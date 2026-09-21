from . import bingo


OWNER_PLAYER1 = "PLAYER1"
OWNER_PLAYER2 = "PLAYER2"


def pair_key(user1_id, user2_id):
    first, second = sorted((int(user1_id), int(user2_id)))
    return f"{first}:{second}"


def role_for(match, user):
    if user.id == match.player1_id:
        return OWNER_PLAYER1
    if user.id == match.player2_id:
        return OWNER_PLAYER2
    raise ValueError("User is not a participant in this match.")


def split_calls(calls, owners, viewer_role):
    if len(calls) != len(owners):
        raise ValueError("Corrupt Bingo move history.")

    my_calls = []
    opponent_calls = []
    for number, owner in zip(calls, owners):
        if owner == viewer_role:
            my_calls.append(number)
        else:
            opponent_calls.append(number)
    return my_calls, opponent_calls


def apply_move(match, user, number):
    """Mutate a locked BingoMatch with one validated move."""
    if match.status != match.STATUS_ACTIVE:
        raise ValueError("This match is already finished.")
    if match.current_player_id != user.id:
        raise PermissionError("Wait for your turn.")

    try:
        number = int(number)
    except (TypeError, ValueError):
        raise ValueError("Choose a number from 1 to 25.")

    if not 1 <= number <= 25:
        raise ValueError("Choose a number from 1 to 25.")
    if number in match.calls:
        raise ValueError("That number has already been called.")

    role = role_for(match, user)
    calls = list(match.calls)
    owners = list(match.call_owners)
    if len(calls) != len(owners):
        raise ValueError("Corrupt Bingo move history.")

    calls.append(number)
    owners.append(role)
    match.calls = calls
    match.call_owners = owners

    p1_lines, p2_lines = bingo.score_boards(
        match.player1_board,
        match.player2_board,
        calls,
    )
    match.player1_lines = p1_lines
    match.player2_lines = p2_lines

    result = bingo.result_for_scores(p1_lines, p2_lines)
    if result:
        match.status = match.STATUS_FINISHED
        match.result = result
    else:
        match.current_player = (
            match.player2 if role == OWNER_PLAYER1 else match.player1
        )

    return match
