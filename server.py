#!/usr/bin/env python3
"""Small SQLite-backed invitation server; all guest permissions are checked here."""

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
DATABASE = Path(os.environ.get("WEDDING_DB_PATH", ROOT / "data" / "guests.sqlite3"))
ADMIN_PASSWORD = os.environ.get("WEDDING_ADMIN_PASSWORD", "")
COOKIE_SECURE = os.environ.get("WEDDING_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
HOST = os.environ.get("WEDDING_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEDDING_PORT", "8000"))
SESSION_TTL = 8 * 60 * 60
MAX_BODY_SIZE = 64 * 1024
EVENTS = {
    "mehndi": {
        "name": "Mehndi",
        "label": "A night of colour",
        "date": "Thursday · 10 December 2026",
        "time": "7:00 PM onwards",
        "venue": "Rose Garden Marquee",
        "city": "Sahiwal, Pakistan",
        "symbol": "✿",
    },
    "barat": {
        "name": "Barat",
        "label": "The wedding celebration",
        "date": "Saturday · 12 December 2026",
        "time": "7:00 PM · Barat arrival",
        "venue": "Royal Palace Marquee",
        "city": "Sahiwal, Pakistan",
        "symbol": "❦",
    },
    "walima": {
        "name": "Walima",
        "label": "A gathering of gratitude",
        "date": "Sunday · 13 December 2026",
        "time": "1:00 PM onwards",
        "venue": "Lotus Palace",
        "city": "Sahiwal, Pakistan",
        "symbol": "✽",
    },
}
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/script.js": "script.js",
    "/admin": "admin.html",
    "/admin/": "admin.html",
    "/admin.html": "admin.html",
    "/admin.js": "admin.js",
}
SESSIONS = {}
LOGIN_ATTEMPTS = {}


@contextmanager
def connect_db():
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_db():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS guests (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS guest_events (
                guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
                event_id TEXT NOT NULL CHECK (event_id IN ('mehndi', 'barat', 'walima')),
                PRIMARY KEY (guest_id, event_id)
            );
            """
        )


class RequestError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


class InvitationHandler(BaseHTTPRequestHandler):
    server_version = "WeddingInvitation"
    sys_version = ""

    def log_message(self, _format, *_args):
        # Invitation URLs contain bearer tokens; never write request paths to logs.
        return

    def _send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, filename):
        path = ROOT / filename
        try:
            body = path.read_bytes()
        except OSError:
            self._send_json(500, {"error": "The invitation page could not be loaded."})
            return
        content_type = "text/css; charset=utf-8" if path.suffix == ".css" else (
            "text/javascript; charset=utf-8" if path.suffix == ".js" else "text/html; charset=utf-8"
        )
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise RequestError(400, "Invalid request body.")
        if length < 1 or length > MAX_BODY_SIZE:
            raise RequestError(400, "Invalid request body.")
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise RequestError(400, "Invalid JSON.")
        if not isinstance(payload, dict):
            raise RequestError(400, "Invalid request body.")
        return payload

    def _check_origin(self):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host")
        parsed = urlsplit(origin or "")
        if not host or parsed.scheme not in {"http", "https"} or parsed.netloc.lower() != host.lower():
            raise RequestError(403, "Request origin was not accepted.")

    def _admin_session(self):
        cookie = SimpleCookie()
        cookie.load(self.headers.get("Cookie", ""))
        morsel = cookie.get("wedding_admin")
        session_id = morsel.value if morsel else ""
        session = SESSIONS.get(session_id)
        now = time.time()
        if not session or session[1] < now or session[0] != self.client_address[0]:
            SESSIONS.pop(session_id, None)
            raise RequestError(401, "Please sign in to manage invitations.")
        return session_id

    @staticmethod
    def _validate_guest(payload):
        name = payload.get("name")
        events = payload.get("events")
        expiry = payload.get("expiresAt")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            raise RequestError(400, "Enter a guest or family name (up to 120 characters).")
        if not isinstance(events, list) or not events:
            raise RequestError(400, "Assign at least one wedding event.")
        if any(not isinstance(event, str) or event not in EVENTS for event in events):
            raise RequestError(400, "Choose valid wedding events.")
        events = list(dict.fromkeys(events))
        if expiry in ("", None):
            expiry = None
        elif not isinstance(expiry, str):
            raise RequestError(400, "Choose a valid expiry date.")
        else:
            try:
                parsed = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                parsed = parsed.astimezone(timezone.utc)
            except ValueError:
                raise RequestError(400, "Choose a valid expiry date.")
            if parsed <= datetime.now(timezone.utc):
                raise RequestError(400, "Expiry must be a future date.")
            expiry = parsed.isoformat()
        return name.strip(), events, expiry

    @staticmethod
    def _guest_rows():
        with connect_db() as connection:
            guests = connection.execute(
                "SELECT id, name, expires_at, created_at FROM guests ORDER BY name COLLATE NOCASE"
            ).fetchall()
            event_rows = connection.execute(
                """SELECT guest_id, event_id FROM guest_events
                   ORDER BY CASE event_id WHEN 'mehndi' THEN 0 WHEN 'barat' THEN 1 ELSE 2 END"""
            ).fetchall()
        by_guest = {}
        for row in event_rows:
            by_guest.setdefault(row["guest_id"], []).append(row["event_id"])
        return [
            {
                "id": guest["id"],
                "name": guest["name"],
                "events": by_guest.get(guest["id"], []),
                "expiresAt": guest["expires_at"],
                "createdAt": guest["created_at"],
            }
            for guest in guests
        ]

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/admin/guests":
            try:
                self._admin_session()
                self._send_json(200, {"guests": self._guest_rows(), "events": EVENTS})
            except RequestError as error:
                self._send_json(error.status, {"error": error.message})
            return
        if path.startswith("/api/invitations/"):
            token = path.removeprefix("/api/invitations/")
            if not re.fullmatch(r"[a-f0-9]{64}", token):
                self._send_json(404, {"error": "This invitation link is invalid or expired."})
                return
            token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
            with connect_db() as connection:
                guest = connection.execute(
                    "SELECT id, name, expires_at FROM guests WHERE token_hash = ?", (token_hash,)
                ).fetchone()
                if guest:
                    event_ids = [
                        row["event_id"]
                        for row in connection.execute(
                            """SELECT event_id FROM guest_events WHERE guest_id = ?
                               ORDER BY CASE event_id
                                 WHEN 'mehndi' THEN 0 WHEN 'barat' THEN 1 ELSE 2 END""",
                            (guest["id"],),
                        )
                    ]
            if not guest:
                self._send_json(404, {"error": "This invitation link is invalid or expired."})
                return
            if guest["expires_at"] and datetime.fromisoformat(guest["expires_at"]) <= datetime.now(timezone.utc):
                self._send_json(410, {"error": "This invitation link has expired."})
                return
            self._send_json(
                200,
                {
                    "guestName": guest["name"],
                    "events": [{"id": event_id, **EVENTS[event_id]} for event_id in event_ids],
                },
            )
            return
        if path.startswith("/invite/"):
            self._send_file("index.html")
            return
        filename = STATIC_FILES.get(path)
        if filename:
            self._send_file(filename)
            return
        self._send_json(404, {"error": "Page not found."})

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            self._check_origin()
            if path == "/api/admin/login":
                self._login()
            elif path == "/api/admin/logout":
                session_id = self._admin_session()
                SESSIONS.pop(session_id, None)
                self._send_json(
                    200,
                    {"ok": True},
                    {"Set-Cookie": self._expired_cookie()},
                )
            elif path == "/api/admin/guests":
                self._admin_session()
                self._create_guest()
            else:
                raise RequestError(404, "Page not found.")
        except RequestError as error:
            self._send_json(error.status, {"error": error.message})

    def do_PUT(self):
        try:
            self._check_origin()
            self._admin_session()
            match = re.fullmatch(r"/api/admin/guests/([0-9]+)", urlsplit(self.path).path)
            if not match:
                raise RequestError(404, "Guest not found.")
            name, events, expiry = self._validate_guest(self._read_json())
            guest_id = int(match.group(1))
            now = datetime.now(timezone.utc).isoformat()
            with connect_db() as connection:
                cursor = connection.execute(
                    "UPDATE guests SET name = ?, expires_at = ?, updated_at = ? WHERE id = ?",
                    (name, expiry, now, guest_id),
                )
                if not cursor.rowcount:
                    raise RequestError(404, "Guest not found.")
                connection.execute("DELETE FROM guest_events WHERE guest_id = ?", (guest_id,))
                connection.executemany(
                    "INSERT INTO guest_events (guest_id, event_id) VALUES (?, ?)",
                    [(guest_id, event) for event in events],
                )
            self._send_json(200, {"ok": True})
        except RequestError as error:
            self._send_json(error.status, {"error": error.message})

    def do_DELETE(self):
        try:
            self._check_origin()
            self._admin_session()
            match = re.fullmatch(r"/api/admin/guests/([0-9]+)", urlsplit(self.path).path)
            if not match:
                raise RequestError(404, "Guest not found.")
            with connect_db() as connection:
                cursor = connection.execute("DELETE FROM guests WHERE id = ?", (int(match.group(1)),))
            if not cursor.rowcount:
                raise RequestError(404, "Guest not found.")
            self._send_json(200, {"ok": True})
        except RequestError as error:
            self._send_json(error.status, {"error": error.message})

    def _login(self):
        address = self.client_address[0]
        now = time.time()
        attempts, started = LOGIN_ATTEMPTS.get(address, (0, now))
        if now - started > 900:
            attempts, started = 0, now
        if attempts >= 5:
            raise RequestError(429, "Too many sign-in attempts. Try again in 15 minutes.")
        password = self._read_json().get("password")
        if not isinstance(password, str) or not hmac.compare_digest(
            password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
        ):
            LOGIN_ATTEMPTS[address] = (attempts + 1, started)
            raise RequestError(401, "The admin password was not accepted.")
        LOGIN_ATTEMPTS.pop(address, None)
        for session_id, session in list(SESSIONS.items()):
            if session[1] < now:
                SESSIONS.pop(session_id, None)
        session_id = secrets.token_urlsafe(32)
        SESSIONS[session_id] = (address, now + SESSION_TTL)
        self._send_json(
            200,
            {"ok": True},
            {
                "Set-Cookie": (
                    "wedding_admin="
                    + session_id
                    + "; Path=/; HttpOnly; SameSite=Strict; Max-Age="
                    + str(SESSION_TTL)
                    + ("; Secure" if COOKIE_SECURE else "")
                )
            },
        )

    def _create_guest(self):
        name, events, expiry = self._validate_guest(self._read_json())
        token = secrets.token_hex(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        now = datetime.now(timezone.utc).isoformat()
        with connect_db() as connection:
            cursor = connection.execute(
                "INSERT INTO guests (name, token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (name, token_hash, expiry, now, now),
            )
            guest_id = cursor.lastrowid
            connection.executemany(
                "INSERT INTO guest_events (guest_id, event_id) VALUES (?, ?)",
                [(guest_id, event) for event in events],
            )
        self._send_json(
            201,
            {
                "id": guest_id,
                "name": name,
                "events": events,
                "expiresAt": expiry,
                "invitationPath": "/invite/" + token,
            },
        )

    @staticmethod
    def _expired_cookie():
        return "wedding_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" + (
            "; Secure" if COOKIE_SECURE else ""
        )


def main():
    if len(ADMIN_PASSWORD) < 16:
        raise SystemExit("Set WEDDING_ADMIN_PASSWORD to a strong password of at least 16 characters.")
    initialize_db()
    server = ThreadingHTTPServer((HOST, PORT), InvitationHandler)
    print("Wedding invitations available at http://%s:%s" % (HOST, PORT))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping invitation server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
