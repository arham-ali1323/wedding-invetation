import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import server


class InvitationServerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        server.DATABASE = Path(self.temp_dir.name) / "guests.sqlite3"
        server.ADMIN_PASSWORD = "test-password-long-enough"
        server.SESSIONS.clear()
        server.LOGIN_ATTEMPTS.clear()
        server.initialize_db()
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.InvitationHandler)
        self.base_url = "http://127.0.0.1:%s" % self.httpd.server_port
        self.thread = threading.Thread(target=self.httpd.serve_forever)
        self.thread.start()
        self.admin_cookie = None

    def tearDown(self):
        self.httpd.shutdown()
        self.thread.join()
        self.httpd.server_close()
        self.temp_dir.cleanup()

    def request(self, path, method="GET", payload=None, cookie=None, origin=True):
        headers = {}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if origin:
            headers["Origin"] = self.base_url
        if cookie:
            headers["Cookie"] = cookie
        request = urllib.request.Request(
            self.base_url + path, data=data, headers=headers, method=method
        )
        try:
            response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        return response.code, json.loads(body) if body else {}, response.headers

    def sign_in(self):
        status, _payload, headers = self.request(
            "/api/admin/login",
            method="POST",
            payload={"password": server.ADMIN_PASSWORD},
        )
        self.assertEqual(status, 200)
        self.admin_cookie = headers["Set-Cookie"].split(";", 1)[0]

    def create_guest(self, name, events):
        return self.request(
            "/api/admin/guests",
            method="POST",
            payload={"name": name, "events": events, "expiresAt": None},
            cookie=self.admin_cookie,
        )

    def test_guest_token_returns_only_assigned_events(self):
        self.sign_in()
        _status, guest_a, _headers = self.create_guest("Guest A", ["barat", "walima"])
        _status, guest_b, _headers = self.create_guest("Guest B", ["walima"])

        status_a, invitation_a, _headers = self.request(
            guest_a["invitationPath"].replace("/invite/", "/api/invitations/")
        )
        status_b, invitation_b, _headers = self.request(
            guest_b["invitationPath"].replace("/invite/", "/api/invitations/")
        )

        self.assertEqual(status_a, 200)
        self.assertEqual(invitation_a["guestName"], "Guest A")
        self.assertEqual({event["id"] for event in invitation_a["events"]}, {"barat", "walima"})
        self.assertEqual(status_b, 200)
        self.assertEqual({event["id"] for event in invitation_b["events"]}, {"walima"})

        status, _payload, _headers = self.request(
            "/api/admin/guests/%s" % guest_b["id"],
            method="PUT",
            payload={"name": "Guest B", "events": ["mehndi"], "expiresAt": None},
            cookie=self.admin_cookie,
        )
        self.assertEqual(status, 200)
        _status, updated_invitation, _headers = self.request(
            guest_b["invitationPath"].replace("/invite/", "/api/invitations/")
        )
        self.assertEqual(
            {event["id"] for event in updated_invitation["events"]}, {"mehndi"}
        )

    def test_admin_requires_login_and_same_origin(self):
        status, _payload, _headers = self.request("/api/admin/guests")
        self.assertEqual(status, 401)
        self.sign_in()
        status, _payload, _headers = self.request(
            "/api/admin/guests",
            method="POST",
            payload={"name": "Guest", "events": ["mehndi"], "expiresAt": None},
            cookie=self.admin_cookie,
            origin=False,
        )
        self.assertEqual(status, 403)

    def test_revoked_and_expired_links_do_not_return_event_data(self):
        self.sign_in()
        _status, guest, _headers = self.create_guest("Guest", ["mehndi"])
        with server.connect_db() as connection:
            connection.execute(
                "UPDATE guests SET expires_at = ? WHERE id = ?",
                ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(), guest["id"]),
            )
        api_path = guest["invitationPath"].replace("/invite/", "/api/invitations/")
        status, _payload, _headers = self.request(api_path)
        self.assertEqual(status, 410)

        with server.connect_db() as connection:
            connection.execute("UPDATE guests SET expires_at = NULL WHERE id = ?", (guest["id"],))
        status, _payload, _headers = self.request(
            "/api/admin/guests/%s" % guest["id"],
            method="DELETE",
            cookie=self.admin_cookie,
        )
        self.assertEqual(status, 200)
        status, _payload, _headers = self.request(api_path)
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
