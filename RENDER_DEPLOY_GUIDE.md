# GameHub – Render deployment

## Recommended: Render Blueprint

1. Push this folder (the folder that contains `manage.py`) to GitHub.
2. In Render: **New > Blueprint**.
3. Select the GitHub repository.
4. Render reads `render.yaml` and creates both the web service and PostgreSQL database.
5. When the deploy finishes, open the generated `.onrender.com` URL.

## Manual Web Service setup

Create a PostgreSQL database first. Then create the Web Service from the GitHub repo.

- Language: Python 3
- Build Command: `./build.sh`
- Start Command: `python -m gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`

Environment variables:

- `GAMEHUB_SECRET_KEY`: click **Generate**
- `GAMEHUB_DEBUG`: `0`
- `DATABASE_URL`: paste the PostgreSQL **Internal Database URL**

You do not need to manually set `GAMEHUB_ALLOWED_HOSTS` for the default Render hostname because the settings automatically read `RENDER_EXTERNAL_HOSTNAME`.

If you later add a custom domain, set:

- `GAMEHUB_ALLOWED_HOSTS`: `yourdomain.com,www.yourdomain.com`
- `GAMEHUB_CSRF_TRUSTED_ORIGINS`: `https://yourdomain.com,https://www.yourdomain.com`

## Multiplayer invite after deployment

Both players open the same public Render URL, create different accounts, and log in in different browsers/devices. Player 1 opens Bingo > Add Friend, enters Player 2's username, and sends the invite. Player 2 receives it through the app's polling flow and accepts it. No localhost/LAN setup is required after public deployment.
