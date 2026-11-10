import os
import re
import unittest
from datetime import datetime, timedelta
from unittest import mock
from urllib.parse import parse_qs, urlparse

import mongoengine
import mongomock

# Email/password accounts through the real ASGI middleware with mongomock and
# the mail client mocked: an account is inactive until the emailed link is
# opened with the account's password, because email is the ownership key.
from project import connexionapp
from project.models import LocalAccount

PUBLIC_URL = "https://qresp.example.org"
EMAIL = "curator@example.edu"
PASSWORD = "correct-horse"


class LocalAccountTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        os.environ["QRESP_PUBLIC_URL"] = PUBLIC_URL
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        patcher = mock.patch("project.utils.mail.mailClient")
        self.mail = patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        LocalAccount.drop_collection()
        mongoengine.disconnect_all()
        for key in ("QRESP_PUBLIC_URL", "QRESP_ADMIN_EMAILS",
                    "QRESP_PUBLISH_SKIP_EMAIL", "QRESP_ENABLE_DEV_LOGIN"):
            os.environ.pop(key, None)

    def register(self, email=EMAIL, password=PASSWORD, **extra):
        return self.client.post("/api/auth/register", json=dict(
            email=email, password=password, **extra))

    def login(self, email=EMAIL, password=PASSWORD):
        return self.client.post("/api/auth/local-login",
                                json={"email": email, "password": password})

    def verify(self, token, password=PASSWORD):
        return self.client.post("/api/auth/verify-email",
                                json={"token": token, "password": password})

    def me(self):
        return self.client.get("/api/auth/me").json()

    def last_link(self):
        _subject, _text, html, _to = self.mail.send.call_args[0]
        return re.search(r'href="([^"]+)"', html).group(1)

    def last_token(self):
        return parse_qs(urlparse(self.last_link()).query)["token"][0]


class TestRegistration(LocalAccountTestBase):
    def test_register_emails_a_link_and_does_not_sign_in(self):
        response = self.register()
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertTrue(body["verification_required"])
        self.assertFalse(body["authenticated"])
        self.assertNotIn("verify_link", body)
        self.assertFalse(self.me()["authenticated"])

        self.assertEqual(EMAIL, self.mail.send.call_args[0][3])
        self.assertTrue(self.last_link().startswith(
            PUBLIC_URL + "/verify-email?token="))
        account = LocalAccount.objects(email=EMAIL).first()
        self.assertFalse(account.email_verified)
        # Only a hash of the token is stored.
        self.assertNotEqual(self.last_token(), account.verify_token_hash)

    def test_link_ignores_a_forged_origin_or_host(self):
        self.client.post(
            "/api/auth/register",
            json={"email": EMAIL, "password": PASSWORD},
            headers={"Origin": "https://evil.example.com",
                     "Host": "evil.example.com"})
        self.assertTrue(self.last_link().startswith(PUBLIC_URL + "/"))

    def test_without_a_public_url_email_sign_up_is_refused(self):
        os.environ.pop("QRESP_PUBLIC_URL")
        response = self.register()
        self.assertEqual(503, response.status_code)
        self.assertIsNone(LocalAccount.objects(email=EMAIL).first())
        self.mail.send.assert_not_called()

    def test_mail_failure_is_reported(self):
        self.mail.send.side_effect = RuntimeError("smtp down")
        response = self.register()
        self.assertEqual(503, response.status_code)
        self.assertIn("could not send", response.json()["error"])
        self.assertFalse(self.me()["authenticated"])

    def test_skip_email_mode_returns_the_link_instead(self):
        os.environ["QRESP_PUBLISH_SKIP_EMAIL"] = "1"
        body = self.register().json()
        self.assertTrue(body["verify_link"].startswith(
            PUBLIC_URL + "/verify-email?token="))
        self.mail.send.assert_not_called()

    def test_a_confirmed_address_cannot_be_registered_again(self):
        self.register()
        self.verify(self.last_token())
        response = self.register(password="another-password")
        self.assertEqual(409, response.status_code)
        self.assertEqual(200, self.login().status_code)

    def test_registering_an_unconfirmed_address_replaces_the_pending_sign_up(self):
        # Someone else starts a sign-up with the curator's address...
        self.register(password="squatter-pass")
        squatter_token = self.last_token()
        # ...the real owner registers it too and confirms from their inbox.
        self.register(password=PASSWORD)
        self.assertEqual(400, self.verify(squatter_token, "squatter-pass").status_code)
        self.assertEqual(200, self.verify(self.last_token()).status_code)
        self.assertEqual(401, self.login(password="squatter-pass").status_code)


class TestSignInBeforeConfirming(LocalAccountTestBase):
    def test_unconfirmed_account_cannot_sign_in(self):
        self.register()
        response = self.login()
        self.assertEqual(403, response.status_code)
        self.assertTrue(response.json()["verification_required"])
        self.assertFalse(self.me()["authenticated"])

    def test_unconfirmed_admin_address_gets_no_session(self):
        os.environ["QRESP_ADMIN_EMAILS"] = EMAIL
        self.register()
        self.assertEqual(403, self.login().status_code)
        self.assertIsNone(self.me()["user"])

    def test_wrong_password_is_still_401_not_a_verification_hint(self):
        self.register()
        response = self.login(password="wrong-password")
        self.assertEqual(401, response.status_code)
        self.assertNotIn("verification_required", response.json())

    def test_sign_in_resends_the_link_but_not_twice_in_a_row(self):
        self.register()
        self.assertEqual(1, self.mail.send.call_count)
        self.login()  # just sent at registration: throttled
        self.assertEqual(1, self.mail.send.call_count)

        LocalAccount.objects(email=EMAIL).update_one(
            set__verify_sent_at=datetime.utcnow() - timedelta(minutes=5))
        self.login()
        self.assertEqual(2, self.mail.send.call_count)
        self.assertEqual(200, self.verify(self.last_token()).status_code)

    def test_legacy_account_without_the_field_must_confirm(self):
        from werkzeug.security import generate_password_hash
        LocalAccount._get_collection().insert_one({
            "email": EMAIL, "password_hash": generate_password_hash(PASSWORD),
            "name": "Legacy"})
        self.assertEqual(403, self.login().status_code)
        self.assertEqual(200, self.verify(self.last_token()).status_code)


class TestVerifyEmail(LocalAccountTestBase):
    def test_link_plus_password_confirms_and_signs_in(self):
        self.register(name="Ada")
        response = self.verify(self.last_token())
        self.assertEqual(200, response.status_code, response.text)
        me = self.me()
        self.assertTrue(me["authenticated"])
        self.assertEqual(EMAIL, me["user"]["email"])
        self.assertEqual("local", me["user"]["provider"])
        self.assertTrue(LocalAccount.objects(email=EMAIL).first().email_verified)

        self.client.post("/api/auth/logout",
                         headers={"X-CSRF-Token": me["csrf_token"]})
        self.assertEqual(200, self.login().status_code)

    def test_wrong_password_does_not_confirm(self):
        self.register()
        token = self.last_token()
        response = self.verify(token, password="not-the-password")
        self.assertEqual(401, response.status_code)
        self.assertFalse(LocalAccount.objects(email=EMAIL).first().email_verified)
        self.assertFalse(self.me()["authenticated"])
        # The right password still works with the same link.
        self.assertEqual(200, self.verify(token).status_code)

    def test_link_is_single_use(self):
        self.register()
        token = self.last_token()
        self.assertEqual(200, self.verify(token).status_code)
        self.assertEqual(400, self.verify(token).status_code)

    def test_expired_link_is_refused(self):
        self.register()
        LocalAccount.objects(email=EMAIL).update_one(
            set__verify_sent_at=datetime.utcnow() - timedelta(hours=25))
        self.assertEqual(400, self.verify(self.last_token()).status_code)

    def test_unknown_token_is_refused(self):
        self.register()
        self.assertEqual(400, self.verify("made-up-token").status_code)


GITHUB_ENV = {
    "QRESP_GITHUB_CLIENT_ID": "gh-id",
    "QRESP_GITHUB_CLIENT_SECRET": "gh-secret",
    "QRESP_GITHUB_REDIRECT_URI": "https://localhost:8443/api/auth/github/callback",
}


class TestGitHubEmailMustBeVerified(LocalAccountTestBase):
    def setUp(self):
        super().setUp()
        os.environ.update(GITHUB_ENV)

    def tearDown(self):
        for key in GITHUB_ENV:
            os.environ.pop(key, None)
        super().tearDown()

    def finish(self, user_info, emails):
        location = self.client.get("/api/auth/github",
                                   follow_redirects=False).headers["location"]
        state = parse_qs(urlparse(location).query)["state"][0]

        def fake_get(url, **_kw):
            response = mock.Mock()
            response.json.return_value = (
                emails if url.endswith("/user/emails") else user_info)
            return response

        with mock.patch("project.auth.OAuth2Session") as session_cls, \
                mock.patch("project.auth._record_external_identity",
                           return_value=None):
            oauth = session_cls.return_value
            oauth.fetch_token.return_value = {"access_token": "x"}
            oauth.get.side_effect = fake_get
            return self.client.get(
                "/api/auth/github/callback",
                params={"state": state, "code": "c"}, follow_redirects=False)

    def test_unverified_public_email_is_rejected(self):
        response = self.finish(
            {"id": 1, "login": "x", "email": "victim@example.edu"},
            [{"email": "victim@example.edu", "primary": True, "verified": False}])
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.client.get("/api/auth/me").json()["authenticated"])

    def test_verified_primary_email_is_used(self):
        response = self.finish(
            {"id": 1, "login": "x", "email": None},
            [{"email": "Me@Example.edu", "primary": True, "verified": True}])
        self.assertEqual(302, response.status_code, response.text)
        user = self.client.get("/api/auth/me").json()["user"]
        self.assertEqual("me@example.edu", user["email"])


if __name__ == "__main__":
    unittest.main()
