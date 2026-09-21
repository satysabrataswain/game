import random


LINES = []
for row in range(5):
    LINES.append([row * 5 + col for col in range(5)])
for col in range(5):
    LINES.append([row * 5 + col for row in range(5)])
LINES.append([0, 6, 12, 18, 24])
LINES.append([4, 8, 12, 16, 20])


def make_board():
    values = list(range(1, 26))
    random.shuffle(values)
    return values


def make_two_boards():
    first = make_board()
    second = make_board()
    while second == first:
        second = make_board()
    return first, second


def completed_lines(board, called):
    called_set = set(called)
    return [
        line[:]
        for line in LINES
        if all(board[index] in called_set for index in line)
    ]


def line_count(board, called):
    return len(completed_lines(board, called))


def score_boards(board1, board2, called):
    return line_count(board1, called), line_count(board2, called)


def result_for_scores(player1_lines, player2_lines):
    """Return PLAYER1/PLAYER2/DRAW when somebody reaches five lines."""
    player1_done = player1_lines >= 5
    player2_done = player2_lines >= 5
    if player1_done and player2_done:
        return "DRAW"
    if player1_done:
        return "PLAYER1"
    if player2_done:
        return "PLAYER2"
    return ""


def new_state():
    user_board, cpu_board = make_two_boards()
    return {
        "user_board": user_board,
        "cpu_board": cpu_board,
        "calls": [],
        "call_owners": [],
        "user_lines": 0,
        "cpu_lines": 0,
        "status": "ACTIVE",
        "winner": None,
        "message": "Your turn. Choose any uncalled number.",
    }


def _refresh_scores(state):
    user_lines, cpu_lines = score_boards(
        state["user_board"], state["cpu_board"], state["calls"]
    )
    state["user_lines"] = user_lines
    state["cpu_lines"] = cpu_lines
    return result_for_scores(user_lines, cpu_lines)


def _finish(state, result):
    state["status"] = "FINISHED"
    if result == "PLAYER1":
        state["winner"] = "PLAYER"
        state["message"] = "BINGO! You completed 5 lines first. 🎉"
    elif result == "PLAYER2":
        state["winner"] = "COMPUTER"
        state["message"] = "Computer completed 5 lines first. New round?"
    else:
        state["winner"] = "DRAW"
        state["message"] = "Both boards reached 5 lines on the same call — draw."
    return state


def play(state, move):
    if state.get("status") != "ACTIVE":
        raise ValueError("This game is already finished.")

    try:
        number = int(move)
    except (TypeError, ValueError):
        raise ValueError("Choose a number from 1 to 25.")

    if not 1 <= number <= 25:
        raise ValueError("Choose a number from 1 to 25.")
    if number in state["calls"]:
        raise ValueError("That number has already been called.")

    # Player call: green on the player's board.
    state["calls"].append(number)
    state["call_owners"].append("PLAYER")
    result = _refresh_scores(state)
    if result:
        return _finish(state, result)

    # CPU call: red on the player's board. The called number is deliberately
    # visible because the requested game rule uses move-owner colors.
    remaining = [value for value in range(1, 26) if value not in state["calls"]]
    if remaining:
        cpu_number = random.choice(remaining)
        state["calls"].append(cpu_number)
        state["call_owners"].append("COMPUTER")
        result = _refresh_scores(state)
        if result:
            return _finish(state, result)

        state["message"] = (
            f"Computer called {cpu_number} (red). Your turn — your calls are green."
        )

    return state


def public_state(state):
    my_calls = [
        number
        for number, owner in zip(state["calls"], state["call_owners"])
        if owner == "PLAYER"
    ]
    opponent_calls = [
        number
        for number, owner in zip(state["calls"], state["call_owners"])
        if owner == "COMPUTER"
    ]

    # cpu_board remains server-only. Exact called numbers are intentionally
    # public because they must be rendered red/green on the user's own board.
    return {
        "board": list(state["user_board"]),
        "my_calls": my_calls,
        "opponent_calls": opponent_calls,
        "all_called": list(state["calls"]),
        "completed_lines": completed_lines(state["user_board"], state["calls"]),
        "my_lines": state["user_lines"],
        # Completed-line progress belongs to the board owner only.
        "opponent_lines": None,
        "opponent_name": "Computer",
        "my_turn": state["status"] == "ACTIVE",
        "status": state["status"],
        "winner": (
            "YOU"
            if state["winner"] == "PLAYER"
            else "OPPONENT"
            if state["winner"] == "COMPUTER"
            else "DRAW"
            if state["winner"] == "DRAW"
            else None
        ),
        "message": state["message"],
    }
