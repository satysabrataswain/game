WIN_LINES = (
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6),
)


def new_state():
    return {
        "board": [None] * 9,
        "status": "ACTIVE",
        "winner": None,
        "message": "Your turn — you are X.",
    }


def _winner(board):
    for a, b, c in WIN_LINES:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    if all(board):
        return "DRAW"
    return None


def _minimax(board, maximizing):
    result = _winner(board)
    if result == "O":
        return 10
    if result == "X":
        return -10
    if result == "DRAW":
        return 0

    if maximizing:
        best = -100
        for i, value in enumerate(board):
            if value is None:
                board[i] = "O"
                best = max(best, _minimax(board, False))
                board[i] = None
        return best

    best = 100
    for i, value in enumerate(board):
        if value is None:
            board[i] = "X"
            best = min(best, _minimax(board, True))
            board[i] = None
    return best


def _computer_move(board):
    best_score = -100
    best_index = None
    for i, value in enumerate(board):
        if value is None:
            board[i] = "O"
            score = _minimax(board, False)
            board[i] = None
            if score > best_score:
                best_score = score
                best_index = i
    return best_index


def play(state, move):
    if state.get("status") != "ACTIVE":
        raise ValueError("This game is already finished.")
    try:
        move = int(move)
    except (TypeError, ValueError):
        raise ValueError("Move must be a number from 0 to 8.")

    board = state["board"]
    if move < 0 or move > 8:
        raise ValueError("Choose a position from 0 to 8.")
    if board[move] is not None:
        raise ValueError("That square is already occupied.")

    board[move] = "X"
    result = _winner(board)
    if result:
        return _finish(state, result)

    cpu = _computer_move(board)
    if cpu is not None:
        board[cpu] = "O"

    result = _winner(board)
    if result:
        return _finish(state, result)

    state["message"] = "Your turn — choose an empty square."
    return state


def _finish(state, result):
    state["status"] = "FINISHED"
    if result == "X":
        state["winner"] = "PLAYER"
        state["message"] = "You won! 🎉"
    elif result == "O":
        state["winner"] = "COMPUTER"
        state["message"] = "Computer won. Try another round!"
    else:
        state["winner"] = "DRAW"
        state["message"] = "It’s a draw. Nice game!"
    return state
