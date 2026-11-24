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

## Deployment

Run the Python server behind an HTTPS reverse proxy, set
`WEDDING_COOKIE_SECURE=1`, configure a strong `WEDDING_ADMIN_PASSWORD`, and
keep the SQLite database on persistent storage. The server binds to
`127.0.0.1` by default; set `WEDDING_HOST` and `WEDDING_PORT` to match the
deployment. Invitation URLs are bearer links: share them privately and do not
publish them.