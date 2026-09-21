# How friend invites work locally

## One computer

1. Run `python manage.py migrate` once.
2. Run `python manage.py runserver`.
3. Normal browser: open `http://127.0.0.1:8000/`, create/login Player 1.
4. Incognito/private window or another browser: open the same address, create/login Player 2.
5. Player 1 opens **Bingo -> Add Friend**, enters Player 2's username, then sends the invite.
6. Player 2's Incoming list refreshes automatically and shows the invite. Player 2 accepts it.
7. Both users now refer to the same database-backed match ID. The server checks every turn.
8. If Player 1 calls a number, that cell is green for Player 1 and red for Player 2. If Player 2 calls a number, it is green for Player 2 and red for Player 1.

Two normal tabs in the same browser profile share one login cookie, so use Incognito/private mode, a second browser, or a separate browser profile.

## Two devices on the same Wi-Fi

On the host computer, find its LAN IPv4 address, for example `192.168.1.20`.

Windows PowerShell:

```powershell
$env:GAMEHUB_ALLOWED_HOSTS="127.0.0.1,localhost,192.168.1.20"
python manage.py runserver 0.0.0.0:8000
```

Linux/macOS:

```bash
export GAMEHUB_ALLOWED_HOSTS="127.0.0.1,localhost,192.168.1.20"
python manage.py runserver 0.0.0.0:8000
```

Both devices then open `http://192.168.1.20:8000/`.

`localhost` cannot be used from the second device because its `localhost` points to itself, not to the Django host computer.
