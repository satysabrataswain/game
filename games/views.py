import json
import uuid
from functools import wraps

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import BingoMatch, FriendRequest
from .services import bingo, multiplayer_bingo, tic_tac_toe


SESSION_KEY = "gamehub_games"
MAX_SESSION_GAMES = 20


def api_login_required(view_func):
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Please login first."}, status=401)
        return view_func(request, *args, **kwargs)

    return wrapped


def _json_body(request):
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("Invalid JSON body.")
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object.")
    return data


def _games(request):
    games = request.session.get(SESSION_KEY)
    if not isinstance(games, dict):
        games = {}
        request.session[SESSION_KEY] = games
    return games


def _save_games(request, games):
    request.session[SESSION_KEY] = games
    request.session.modified = True


def _trim_games(games):
    while len(games) >= MAX_SESSION_GAMES:
        games.pop(next(iter(games)), None)


def _public_solo(game):
    state = game["state"]
    if game["game_type"] == "BINGO":
        state = bingo.public_state(state)
    return {
        "id": game["id"],
        "mode": "SOLO",
        "game_type": game["game_type"],
        "state": state,
    }


def _match_for_user(match_id, user, *, lock=False):
    queryset = BingoMatch.objects.select_related(
        "player1", "player2", "current_player"
    )
    if lock:
        queryset = queryset.select_for_update()
    return queryset.filter(
        Q(player1=user) | Q(player2=user),
        id=match_id,
    ).first()


def _friend_public(match, user):
    role = multiplayer_bingo.role_for(match, user)
    if role == multiplayer_bingo.OWNER_PLAYER1:
        board = match.player1_board
        my_lines = match.player1_lines
        opponent = match.player2
    else:
        board = match.player2_board
        my_lines = match.player2_lines
        opponent = match.player1

    my_calls, opponent_calls = multiplayer_bingo.split_calls(
        match.calls, match.call_owners, role
    )

    if match.status == BingoMatch.STATUS_FINISHED:
        if match.result == BingoMatch.RESULT_DRAW:
            winner = "DRAW"
            message = "Both boards reached 5 lines on the same call — draw."
        elif (
            match.result == BingoMatch.RESULT_PLAYER1
            and role == multiplayer_bingo.OWNER_PLAYER1
        ) or (
            match.result == BingoMatch.RESULT_PLAYER2
            and role == multiplayer_bingo.OWNER_PLAYER2
        ):
            winner = "YOU"
            message = "You won the Bingo match. 🎉"
        else:
            winner = "OPPONENT"
            message = f"{opponent.username} won the Bingo match."
    elif match.current_player_id == user.id:
        winner = None
        message = "Your turn. Your call will appear green; your opponent's calls are red."
    else:
        winner = None
        message = f"{opponent.username}'s turn. Their call will appear red on your board."

    last_call = None
    if match.calls:
        last_owner = match.call_owners[-1]
        last_call = {
            "number": match.calls[-1],
            "owner": "YOU" if last_owner == role else "OPPONENT",
        }

    return {
        "id": str(match.id),
        "mode": "FRIEND",
        "game_type": "BINGO_FRIEND",
        "state": {
            "board": list(board),
            "my_calls": my_calls,
            "opponent_calls": opponent_calls,
            "all_called": list(match.calls),
            "completed_lines": bingo.completed_lines(board, match.calls),
            "my_lines": my_lines,
            # The opponent's completed-line count is private. Their called
            # numbers are visible only because the UI must color them red.
            "opponent_lines": None,
            "opponent_name": opponent.username,
            "my_turn": (
                match.status == BingoMatch.STATUS_ACTIVE
                and match.current_player_id == user.id
            ),
            "status": match.status,
            "winner": winner,
            "last_call": last_call,
            "message": message,
        },
    }


@ensure_csrf_cookie
def home(request):
    return render(request, "games/home.html")


@api_login_required
@require_POST
def start_game(request):
    try:
        data = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    game_type = str(data.get("game_type", "")).upper()
    if game_type == "TIC_TAC_TOE":
        state = tic_tac_toe.new_state()
    elif game_type == "BINGO":
        state = bingo.new_state()
    else:
        return JsonResponse({"error": "Unknown game type."}, status=400)

    game_id = str(uuid.uuid4())
    game = {"id": game_id, "game_type": game_type, "state": state}
    games = _games(request)
    _trim_games(games)
    games[game_id] = game
    _save_games(request, games)
    return JsonResponse(_public_solo(game), status=201)


@api_login_required
@require_GET
def get_game(request, game_id):
    game = _games(request).get(game_id)
    if not game:
        return JsonResponse({"error": "Game not found."}, status=404)
    return JsonResponse(_public_solo(game))


@api_login_required
@require_POST
def make_move(request, game_id):
    games = _games(request)
    game = games.get(game_id)
    if not game:
        return JsonResponse({"error": "Game not found."}, status=404)

    try:
        data = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    try:
        if game["game_type"] == "TIC_TAC_TOE":
            game["state"] = tic_tac_toe.play(game["state"], data.get("move"))
        elif game["game_type"] == "BINGO":
            game["state"] = bingo.play(game["state"], data.get("move"))
        else:
            return JsonResponse({"error": "Corrupt game type."}, status=500)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    games[game_id] = game
    _save_games(request, games)
    return JsonResponse(_public_solo(game))


@api_login_required
@require_GET
def friend_state(request):
    incoming = FriendRequest.objects.select_related("sender").filter(
        receiver=request.user,
        status=FriendRequest.STATUS_PENDING,
    )[:20]
    outgoing = FriendRequest.objects.select_related("receiver").filter(
        sender=request.user,
        status=FriendRequest.STATUS_PENDING,
    )[:20]
    matches = BingoMatch.objects.select_related(
        "player1", "player2", "current_player"
    ).filter(
        Q(player1=request.user) | Q(player2=request.user),
        status=BingoMatch.STATUS_ACTIVE,
    )[:20]

    match_data = []
    for match in matches:
        opponent = match.player2 if match.player1_id == request.user.id else match.player1
        match_data.append(
            {
                "id": str(match.id),
                "opponent_name": opponent.username,
                "my_turn": match.current_player_id == request.user.id,
                "updated_at": match.updated_at.isoformat(),
            }
        )

    return JsonResponse(
        {
            "incoming": [
                {"id": item.id, "username": item.sender.username}
                for item in incoming
            ],
            "outgoing": [
                {"id": item.id, "username": item.receiver.username}
                for item in outgoing
            ],
            "active_matches": match_data,
        }
    )


@api_login_required
@require_POST
def send_friend_request(request):
    try:
        data = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    username = str(data.get("username", "")).strip()
    if not username:
        return JsonResponse({"error": "Enter your friend's username."}, status=400)

    friend = User.objects.filter(username__iexact=username).first()
    if friend is None:
        return JsonResponse({"error": "User not found."}, status=404)
    if friend.id == request.user.id:
        return JsonResponse({"error": "You cannot invite yourself."}, status=400)

    pair = multiplayer_bingo.pair_key(request.user.id, friend.id)
    if BingoMatch.objects.filter(pair_key=pair, status=BingoMatch.STATUS_ACTIVE).exists():
        return JsonResponse(
            {"error": "You already have an active Bingo match with this player."},
            status=409,
        )

    existing = FriendRequest.objects.select_related("sender", "receiver").filter(
        pair_key=pair,
        status=FriendRequest.STATUS_PENDING,
    ).first()
    if existing:
        if existing.sender_id == request.user.id:
            return JsonResponse({"error": "Invite already sent."}, status=409)
        return JsonResponse(
            {"error": f"{friend.username} already invited you. Accept the incoming invite."},
            status=409,
        )

    try:
        item = FriendRequest.objects.create(
            sender=request.user,
            receiver=friend,
            pair_key=pair,
        )
    except IntegrityError:
        return JsonResponse({"error": "A pending invite already exists."}, status=409)

    return JsonResponse(
        {"ok": True, "request": {"id": item.id, "username": friend.username}},
        status=201,
    )


@api_login_required
@require_POST
def cancel_friend_request(request, request_id):
    updated = FriendRequest.objects.filter(
        id=request_id,
        sender=request.user,
        status=FriendRequest.STATUS_PENDING,
    ).update(status=FriendRequest.STATUS_CANCELLED)
    if not updated:
        return JsonResponse({"error": "Pending sent invite not found."}, status=404)
    return JsonResponse({"ok": True})


@api_login_required
@require_POST
def decline_friend_request(request, request_id):
    updated = FriendRequest.objects.filter(
        id=request_id,
        receiver=request.user,
        status=FriendRequest.STATUS_PENDING,
    ).update(status=FriendRequest.STATUS_DECLINED)
    if not updated:
        return JsonResponse({"error": "Pending incoming invite not found."}, status=404)
    return JsonResponse({"ok": True})


@api_login_required
@require_POST
def accept_friend_request(request, request_id):
    try:
        with transaction.atomic():
            item = FriendRequest.objects.select_for_update().select_related(
                "sender", "receiver"
            ).filter(
                id=request_id,
                receiver=request.user,
            ).first()
            if item is None:
                return JsonResponse({"error": "Invite not found."}, status=404)
            if item.status != FriendRequest.STATUS_PENDING:
                return JsonResponse({"error": "This invite is no longer pending."}, status=409)

            pair = item.pair_key
            existing_match = BingoMatch.objects.filter(
                pair_key=pair,
                status=BingoMatch.STATUS_ACTIVE,
            ).first()
            if existing_match:
                item.status = FriendRequest.STATUS_ACCEPTED
                item.save(update_fields=["status", "updated_at"])
                return JsonResponse(_friend_public(existing_match, request.user))

            board1, board2 = bingo.make_two_boards()
            match = BingoMatch.objects.create(
                pair_key=pair,
                player1=item.sender,
                player2=item.receiver,
                player1_board=board1,
                player2_board=board2,
                calls=[],
                call_owners=[],
                current_player=item.sender,
            )
            item.status = FriendRequest.STATUS_ACCEPTED
            item.save(update_fields=["status", "updated_at"])
    except IntegrityError:
        # Handles a rare double-accept/race without creating duplicate active games.
        match = BingoMatch.objects.filter(
            pair_key=multiplayer_bingo.pair_key(request.user.id, item.sender_id),
            status=BingoMatch.STATUS_ACTIVE,
        ).first()
        if match is None:
            return JsonResponse({"error": "Could not create the match. Try again."}, status=409)
        FriendRequest.objects.filter(
            id=request_id,
            receiver=request.user,
            status=FriendRequest.STATUS_PENDING,
        ).update(status=FriendRequest.STATUS_ACCEPTED)

    return JsonResponse(_friend_public(match, request.user), status=201)


@api_login_required
@require_GET
def get_friend_match(request, match_id):
    match = _match_for_user(match_id, request.user)
    if match is None:
        return JsonResponse({"error": "Match not found."}, status=404)
    return JsonResponse(_friend_public(match, request.user))


@api_login_required
@require_POST
def friend_match_move(request, match_id):
    try:
        data = _json_body(request)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    try:
        with transaction.atomic():
            match = _match_for_user(match_id, request.user, lock=True)
            if match is None:
                return JsonResponse({"error": "Match not found."}, status=404)

            try:
                multiplayer_bingo.apply_move(match, request.user, data.get("move"))
            except PermissionError as exc:
                return JsonResponse({"error": str(exc)}, status=409)
            except ValueError as exc:
                return JsonResponse({"error": str(exc)}, status=400)

            match.save(
                update_fields=[
                    "calls",
                    "call_owners",
                    "player1_lines",
                    "player2_lines",
                    "current_player",
                    "status",
                    "result",
                    "updated_at",
                ]
            )
    except IntegrityError:
        return JsonResponse({"error": "Move conflict. Refresh the match and try again."}, status=409)

    return JsonResponse(_friend_public(match, request.user))


@api_login_required
@require_POST
def forfeit_friend_match(request, match_id):
    with transaction.atomic():
        match = _match_for_user(match_id, request.user, lock=True)
        if match is None:
            return JsonResponse({"error": "Match not found."}, status=404)
        if match.status != BingoMatch.STATUS_ACTIVE:
            return JsonResponse({"error": "This match is already finished."}, status=409)

        role = multiplayer_bingo.role_for(match, request.user)
        match.status = BingoMatch.STATUS_FINISHED
        match.result = (
            BingoMatch.RESULT_PLAYER2
            if role == multiplayer_bingo.OWNER_PLAYER1
            else BingoMatch.RESULT_PLAYER1
        )
        match.save(update_fields=["status", "result", "updated_at"])

    return JsonResponse(_friend_public(match, request.user))
