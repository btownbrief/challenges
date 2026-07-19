# Btown Challenges 🏆

Real Burlington challenges — eat it, climb it, streak it — and an accountability board: finish one, put your name on it.

A Btown Brief production. Live at https://play.btownbrief.com/challenges/

## Features

- 14 Burlington-area and Btown Brief original challenges
- Category filters and direct links to individual challenges
- Public completion boards with local-only fallback
- Passphrase-protected completion moderation

## Setup

No build step. Serve the directory as static files:

```sh
python3 -m http.server 8000
```

Run `db/challenges.sql` once in the shared Supabase project to enable public
completion boards. Until then, completions are saved only in the visitor's
browser and the app says so.
