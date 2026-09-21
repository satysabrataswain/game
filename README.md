# Django GameHub — reviewed multiplayer build

A self-contained Django + HTML/CSS/JavaScript game portal. The frontend and backend run from the same Django server.

## Included games

- Tic-Tac-Toe vs minimax CPU
- Bingo vs CPU
- Two-player Bingo by username invite
- Django register / login / logout
- Refresh/reconnect support for the active browser game

## Two-player Bingo rules in this build

1. Each player gets an independently shuffled 1–25 board. The board sequence is different for Player 1 and Player 2.
2. Players take turns calling one number that has not already been called.
3. A number called by **you is green** on your board.
4. A number called by the **opponent is red** on your board.
5. The same called number is marked on both boards, because Bingo line calculation uses the shared called-number set. The color only shows who called it.
6. A completed row, column, or diagonal gets a gold completed-line marker on that player's own board. The opponent's line count/line positions stay hidden.
7. First board to reach 5 completed lines wins. If the same call makes both boards reach 5 lines, the result is a draw.
8. The opponent's board arrangement is never returned by the API. Only the called number is shared, which is required for the red/green rule.

## Invite flow on the SAME computer / localhost

`localhost` means the current computer only. To test two accounts on one computer:

1. Start Django and open `http://127.0.0.1:8000/`.
2. In normal Chrome/Edge/Firefox, register/login as `player1`.
3. Open an Incognito/Private window (or a different browser) at the same URL and register/login as `player2`.
4. Player 1: **Bingo -> Add Friend -> enter `player2` -> Send invite**.
5. Player 2 will see the invite under **Incoming** (the page polls the server automatically). Click **Accept**.
6. The match is created in the shared Django database. The inviter starts the first turn.
7. Player 1's calls are green for Player 1 and red for Player 2. Player 2's calls are green for Player 2 and red for Player 1.

Do not test two accounts in two normal tabs of the same browser profile: both tabs share the same Django login session. Use Incognito/Private mode or a second browser/profile.

## Invite flow on TWO phones/computers on the same Wi-Fi/LAN

A second device cannot open the host machine's `localhost`; `localhost` always points back to that second device itself.

On the computer running Django:

### Windows PowerShell

```powershell
ipconfig
# Find the host's IPv4 address, for example 192.168.1.20
$env:GAMEHUB_ALLOWED_HOSTS="127.0.0.1,localhost,192.168.1.20"
python manage.py runserver 0.0.0.0:8000
```

### Linux/macOS

```bash
# Find your LAN IP first, for example 192.168.1.20
export GAMEHUB_ALLOWED_HOSTS="127.0.0.1,localhost,192.168.1.20"
python manage.py runserver 0.0.0.0:8000
```

Then both devices open:

```text
http://192.168.1.20:8000/
```

Both devices must be on the same network and the host firewall must allow Python/Django on port 8000. This development server is for local testing, not public internet deployment.

## Windows setup

```bat
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test
python manage.py runserver
```

Or double-click `start_windows.bat`.

## Linux/macOS setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test
python manage.py runserver
```

## Important implementation details

- Friend invites and multiplayer matches are database-backed, not browser-session-only.
- Active pair and pending invite uniqueness is enforced in the database.
- Multiplayer moves run inside a transaction and verify the current player server-side.
- Duplicate numbers and out-of-turn moves are rejected server-side.
- A player can forfeit an abandoned match so the pair is not permanently blocked from starting a new one.
- The opponent's board is never included in match API responses.
- Invalid JSON now returns a proper 400 error instead of silently becoming an empty request.
- Solo session game history is bounded so the session does not grow forever.
- Frontend prevents rapid duplicate clicks and polls friend/match state for live updates.
- `GAMEHUB_SECRET_KEY`, `GAMEHUB_DEBUG`, and `GAMEHUB_ALLOWED_HOSTS` can be configured through environment variables.

## Main multiplayer API routes

- `GET /api/games/friends/state/`
- `POST /api/games/friends/request/`
- `POST /api/games/friends/<id>/accept/`
- `POST /api/games/friends/<id>/decline/`
- `POST /api/games/friends/<id>/cancel/`
- `GET /api/games/friend-match/<uuid>/`
- `POST /api/games/friend-match/<uuid>/move/`
- `POST /api/games/friend-match/<uuid>/forfeit/`

## Production note

This project defaults to local-development settings. Before a public deployment, use a strong secret key, disable DEBUG, configure exact allowed hosts, enable HTTPS/security cookie settings, enable appropriate password validators, and run behind a production WSGI/ASGI server.

## Render deployment

This package is Render-ready. See `RENDER_DEPLOY_GUIDE.md`.
