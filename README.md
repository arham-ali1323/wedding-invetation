# Pakistani wedding invitations

This site uses plain HTML, CSS, and JavaScript for the invitation, with a small
Python standard-library server and SQLite database for guest permissions.

## Run locally

Python 3.9 or newer is required. In PowerShell, from the project folder:

```powershell
$env:WEDDING_ADMIN_PASSWORD = "choose-a-long-private-password"
python server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) for the site and
[http://127.0.0.1:8000/admin](http://127.0.0.1:8000/admin) to manage guests.
The admin password must be at least 16 characters. Guest records are stored in
`data/guests.sqlite3` (override its location with `WEDDING_DB_PATH`).

Add a guest or family, select one or more events, and optionally set an expiry.
The private invitation link is shown only once when created; copy and share it
with that guest. Existing guests can have their event access or expiry changed,
or their link revoked. A revoked or expired link no longer returns any event
details.

## Deploy to Vercel

The static pages and API can be deployed from this repository to Vercel. The
deployed API uses Neon Postgres because Vercel's function filesystem is not
persistent; the local SQLite database is not used or copied to production.

1. Import this repository into Vercel.
2. Add the Neon Postgres integration to the Vercel project and make sure it
   provides `DATABASE_URL` to the Production deployment.
3. Add `WEDDING_ADMIN_PASSWORD` in Vercel's Environment Variables. Use a unique
   password with at least 16 characters, and enable it for Production.
4. Deploy. The `vercel.json` rewrites expose the admin page at `/admin`,
   invitation pages at `/invite/<token>`, and route API requests through a
   serverless function.
5. Open `https://<your-domain>/admin`, sign in, and create guest invitations.

The API creates its Postgres tables on first use. Guest links contain random
bearer tokens; only their hashes are stored. Share each generated link privately.
If you already created guests in the local SQLite database, add them again in
the production admin page; local data is intentionally not uploaded.

The admin guest directory classifies guests as Special (all configured events)
or Regular Relatives (two events), unless you explicitly keep them in Personal
Guests. Guest names and event assignments remain on the server so invitation
permissions are enforced there. Phone numbers, notes, invitation-send status,
and the generated link copy are stored in the admin browser's local storage;
they are not synchronized to other devices. WhatsApp opens a prefilled message,
and the host marks an invitation sent after confirming it in WhatsApp.

## Local database

For local development, the Python server still uses `data/guests.sqlite3`:

```powershell
$env:WEDDING_ADMIN_PASSWORD = "choose-a-long-private-password"
python server.py
```

Open [http://127.0.0.1:8000/admin](http://127.0.0.1:8000/admin) to manage local
invitations. This local database is separate from the Neon database used on
Vercel. Invitation URLs are bearer links; share them privately and do not
publish them.