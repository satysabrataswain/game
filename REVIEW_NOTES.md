# Review notes

This replacement was reviewed around the requested multiplayer Bingo behavior.

## Fixed / added

- Database-backed friend invites and two-player Bingo matches.
- Independent random 5x5 board arrangement per player.
- Shared called-number set for Bingo rules.
- Move ownership colors: own call green, opponent call red.
- Completed line cells highlighted only from the viewer's own board.
- Opponent board and opponent completed-line count are not returned by the match API.
- Atomic server-side turn validation.
- Duplicate number and out-of-turn request protection.
- Duplicate/reverse pending invite protection with a database constraint.
- One active match per player pair, with a database constraint.
- Forfeit support so abandoned matches do not permanently block a new match.
- Same-call simultaneous 5-line completion is a draw.
- Refresh restores the active game in that browser tab/session.
- Frontend polling updates invites and friend matches without manual refresh.
- Rapid double-click protection.
- Strict JSON validation for account/game APIs.
- Bounded solo session game storage.
- Username validation and case-insensitive login lookup.
- Environment-configurable secret/debug/allowed hosts.
- Automated Django tests for invite privacy, turn rules, color ownership, invalid JSON and core Bingo behavior.
- Pure Python service checks and JavaScript syntax checks passed during packaging.

## Verification limitation in the packaging environment

Django itself was not preinstalled and the environment could not reach PyPI, so the full `python manage.py test` integration suite could not be executed here. The project includes that suite; after `pip install -r requirements.txt`, run `python manage.py test` locally.
