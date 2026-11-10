import os
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlparse

# Importing project builds the Connexion 3 app; these tests exercise the
# Google identity flow through the real ASGI middleware with the OAuth
# client mocked — no Google network calls.
from project import connexionapp

CLIENT_ENV = {
    "QRESP_GOOGLE_CLIENT_ID": "test-client-id",
    "QRESP_GOOGLE_CLIENT_SECRET": "test-client-secret",
    "QRESP_GOOGLE_REDIRECT_URI": "https://localhost:8443/api/auth/google/callback",
}


class GoogleAuthTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        for key, value in CLIENT_ENV.items():
            os.environ[key] = value

    def tearDown(self):
        for key in CLIENT_ENV:
            os.environ.pop(key, None)
        os.environ.pop("QRESP_ADMIN_EMAILS", None)

    def start_login(self, next_path=None):
        params = {"next": next_path} if next_path else None
        response = self.client.get(
            "/api/auth/google", params=params, follow_redirects=False
        )
        assert response.status_code == 302, response.text
        return response.headers["location"]

    def finish_login(self, userinfo, state=None, next_path=None):
        location = self.start_login(next_path=next_path)
        real_state = parse_qs(urlparse(location).query)["state"][0]
        with mock.patch("project.auth.OAuth2Session") as session_cls:
            oauth = session_cls.return_value
            oauth.fetch_token.return_value = {"access_token": "x"}
            oauth.get.return_value.json.return_value = userinfo
            response = self.client.get(
                "/api/auth/google/callback",
                params={"state": state or real_state, "code": "authcode"},
                follow_redirects=False,
            )
        return response


class TestGoogleLogin(GoogleAuthTestBase):
    def test_unconfigured_returns_503_and_devlogin_still_works(self):
        for key in CLIENT_ENV:
            os.environ.pop(key, None)
        response = self.client.get("/api/auth/google", follow_redirects=False)
        self.assertEqual(503, response.status_code)
        self.assertIn("not configured", response.json()["error"])

        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        try:
            response = self.client.post(
                "/api/auth/dev-login", json={"email": "dev@example.com"}
            )
            self.assertEqual(200, response.status_code)
        finally:
            os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)

    def test_login_redirects_to_google_with_identity_scopes_and_state(self):
        location = self.start_login()
        parsed = urlparse(location)
        query = parse_qs(parsed.query)
        self.assertIn("accounts.google.com", parsed.netloc)
        self.assertEqual(["test-client-id"], query["client_id"])
        self.assertEqual(["openid email profile"], query["scope"])
        self.assertTrue(query["state"][0])
        # no Drive/Gmail/etc scopes, ever
        self.assertNotIn("drive", query["scope"][0])
        self.assertNotIn("gmail", query["scope"][0])

    def test_login_asks_google_for_the_account_chooser(self):
        # Without prompt=select_account Google silently reuses whichever
        # account is already signed in, so signing out of Qresp and back in
        # can never switch accounts. Microsoft's flow already does this.
        query = parse_qs(urlparse(self.start_login()).query)
        self.assertEqual(["select_account"], query["prompt"])

    def test_the_account_chooser_does_not_disturb_scopes_or_state(self):
        query = parse_qs(urlparse(self.start_login()).query)
        self.assertEqual(["openid email profile"], query["scope"])
        self.assertEqual(["code"], query["response_type"])
        self.assertTrue(query["state"][0])

    def test_callback_rejects_mismatched_state(self):
        response = self.finish_login(
            {"email": "a@b.co", "name": "A", "sub": "1"}, state="wrong-state"
        )
        self.assertEqual(400, response.status_code)
        self.assertIn("state", response.json()["error"].lower())

    def test_callback_without_started_flow_is_rejected(self):
        response = self.client.get(
            "/api/auth/google/callback",
            params={"state": "anything", "code": "authcode"},
            follow_redirects=False,
        )
        self.assertEqual(400, response.status_code)

    def test_callback_stores_google_user_and_normalizes_email(self):
        response = self.finish_login(
            {"email": "  Owner@Example.COM ", "name": "Owner Example",
             "sub": "google-sub-1"}
        )
        self.assertEqual(302, response.status_code, response.text)
        self.assertEqual("/", response.headers["location"])

        me = self.client.get("/api/auth/me").json()
        self.assertTrue(me["authenticated"])
        self.assertEqual("owner@example.com", me["user"]["email"])
        self.assertEqual("Owner Example", me["user"]["name"])
        self.assertEqual("google", me["user"]["provider"])
        self.assertFalse(me["user"]["is_admin"])

    def test_admin_allowlist_sets_is_admin(self):
        os.environ["QRESP_ADMIN_EMAILS"] = "boss@example.com, admin@example.com"
        response = self.finish_login(
            {"email": "Admin@Example.com", "name": "Admin", "sub": "2"}
        )
        self.assertEqual(302, response.status_code, response.text)
        me = self.client.get("/api/auth/me").json()
        self.assertTrue(me["user"]["is_admin"])

    def test_callback_returns_to_safe_next_path(self):
        response = self.finish_login(
            {"email": "a@b.co", "name": "A", "sub": "1"},
            next_path="/paperdetails/abc123?server=https%3A%2F%2Fx",
        )
        self.assertEqual(302, response.status_code, response.text)
        self.assertEqual(
            "/paperdetails/abc123?server=https%3A%2F%2Fx",
            response.headers["location"],
        )

    def test_callback_ignores_unsafe_next_paths(self):
        for evil in ("https://evil.example.com/", "//evil.example.com", "\\evil"):
            response = self.finish_login(
                {"email": "a@b.co", "name": "A", "sub": "1"}, next_path=evil
            )
            self.assertEqual(302, response.status_code, response.text)
            self.assertEqual("/", response.headers["location"])
            # log out between iterations to keep sessions comparable
            csrf = self.client.get("/api/auth/me").json()["csrf_token"]
            self.client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})

    def test_callback_reports_provider_error_without_reflecting_it(self):
        response = self.client.get(
            "/api/auth/google/callback",
            params={"error": "access_denied"},
            follow_redirects=False,
        )
        self.assertEqual(400, response.status_code)
        message = response.json()["error"]
        self.assertIn("did not complete", message)
        # The provider string is URL-controllable: it is logged, not shown.
        self.assertNotIn("access_denied", message)

    def test_callback_error_message_cannot_carry_injected_text(self):
        response = self.client.get(
            "/api/auth/google/callback",
            params={"error": "<script>alert(1)</script> contact evil.example"},
            follow_redirects=False,
        )
        self.assertEqual(400, response.status_code)
        message = response.json()["error"]
        self.assertNotIn("script", message.lower())
        self.assertNotIn("evil.example", message)

    def test_token_exchange_failures_stay_generic(self):
        # oauthlib exceptions can embed the provider's response body; neither
        # it nor a stack trace may reach the user.
        with mock.patch("project.auth.OAuth2Session") as session_cls:
            instance = session_cls.return_value
            instance.authorization_url.return_value = (
                "https://accounts.google.com/o/oauth2/v2/auth?state=s", "s")
            self.client.get("/api/auth/google", follow_redirects=False)
            instance.fetch_token.side_effect = RuntimeError(
                'invalid_client: {"client_secret":"top-secret"}')
            response = self.client.get(
                "/api/auth/google/callback",
                params={"state": "s", "code": "authcode"},
                follow_redirects=False,
            )
        self.assertEqual(400, response.status_code)
        message = response.json()["error"]
        self.assertEqual("Google sign-in failed, please try again.", message)
        self.assertNotIn("top-secret", response.text)
        self.assertNotIn("invalid_client", response.text)


if __name__ == "__main__":
    unittest.main()
