import json
import os
import time
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlparse

import jwt
import mongoengine
import mongomock
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Microsoft Entra OIDC flow through the real ASGI middleware with ALL network
# (discovery, token, JWKS) mocked — no Microsoft calls. ID tokens are REALLY
# signed with a test RSA key and verified by the production code path
# (PyJWT + JWKS), so signature/issuer/tenant/audience/expiry/nonce checks are
# exercised for real.
from project import auth as auth_module
from project import connexionapp
from project.models import ExternalIdentity
from project.paperdao import Paper

CLIENT_ENV = {
    "QRESP_MICROSOFT_CLIENT_ID": "11111111-2222-3333-4444-555555555555",
    "QRESP_MICROSOFT_CLIENT_SECRET": "test-secret",
    "QRESP_MICROSOFT_REDIRECT_URI":
        "https://localhost:8443/api/auth/microsoft/callback",
}

TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
OTHER_TENANT_ID = "99999999-8888-7777-6666-555555555555"
ISSUER = "https://login.microsoftonline.com/%s/v2.0" % TENANT_ID
OBJECT_ID = "abcdefab-1234-5678-9abc-def012345678"
EMAIL = "prof@uchicago.edu"
KID = "ms-test-key-1"

DISCOVERY_URL_ORGS = ("https://login.microsoftonline.com/organizations"
                      "/v2.0/.well-known/openid-configuration")
DISCOVERY_URL_TENANT = ("https://login.microsoftonline.com/%s"
                        "/v2.0/.well-known/openid-configuration" % TENANT_ID)

METADATA = {
    # Multitenant metadata publishes a TEMPLATE issuer — the code must
    # validate the token's real issuer against its tid claim instead.
    "issuer": "https://login.microsoftonline.com/{tenantid}/v2.0",
    "authorization_endpoint":
        "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    "token_endpoint":
        "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    "jwks_uri":
        "https://login.microsoftonline.com/organizations/discovery/v2.0/keys",
}

_SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_SIGNING_PEM = _SIGNING_KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)
# A second key whose signature must be REJECTED (never in the JWKS).
_ROGUE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_ROGUE_PEM = _ROGUE_KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
)


def _jwks():
    entry = json.loads(
        jwt.algorithms.RSAAlgorithm.to_jwk(_SIGNING_KEY.public_key()))
    entry.update({"kid": KID, "alg": "RS256", "use": "sig"})
    return {"keys": [entry]}


def load_fixture():
    location = os.path.realpath(
        os.path.join(os.getcwd(), os.path.dirname(__file__)))
    with open(os.path.join(location, 'data.json')) as f:
        return json.load(f)


class MockResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("HTTP %s" % self.status_code)


class MicrosoftTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        for key, value in CLIENT_ENV.items():
            os.environ[key] = value
        auth_module._microsoft_metadata_cache.clear()
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)

    def tearDown(self):
        for key in CLIENT_ENV:
            os.environ.pop(key, None)
        os.environ.pop("QRESP_MICROSOFT_TENANT", None)
        os.environ.pop("QRESP_ADMIN_EMAILS", None)
        ExternalIdentity.drop_collection()
        Paper.drop_collection()
        mongoengine.disconnect_all()
        auth_module._microsoft_metadata_cache.clear()

    # ---- mocked Microsoft network -------------------------------------------

    def _mock_get(self, url, **kwargs):
        if url in (DISCOVERY_URL_ORGS, DISCOVERY_URL_TENANT):
            return MockResponse(METADATA)
        if url == METADATA["jwks_uri"]:
            return MockResponse(_jwks())
        raise AssertionError("unexpected GET %s" % url)

    def start_login(self, next_path=None):
        params = {"next": next_path} if next_path else None
        with mock.patch("project.auth.requests") as requests_mock:
            requests_mock.get.side_effect = self._mock_get
            response = self.client.get(
                "/api/auth/microsoft", params=params, follow_redirects=False)
        assert response.status_code == 302, response.text
        return response.headers["location"]

    def make_id_token(self, nonce, key=None, kid=KID, **overrides):
        now = int(time.time())
        claims = {
            "iss": ISSUER,
            "aud": CLIENT_ENV["QRESP_MICROSOFT_CLIENT_ID"],
            "sub": "pairwise-subject-1",
            "tid": TENANT_ID,
            "oid": OBJECT_ID,
            "email": EMAIL,
            "preferred_username": EMAIL,
            "name": "Prof Example",
            "iat": now,
            "exp": now + 600,
            "nonce": nonce,
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, key or _SIGNING_PEM, algorithm="RS256",
                          headers={"kid": kid})

    def finish_login(self, token_factory=None, next_path=None,
                     state_override=None):
        location = self.start_login(next_path=next_path)
        query = parse_qs(urlparse(location).query)
        state = query["state"][0]
        nonce = query["nonce"][0]
        factory = token_factory or (lambda n: self.make_id_token(n))
        id_token = factory(nonce)
        with mock.patch("project.auth.requests") as requests_mock:
            requests_mock.get.side_effect = self._mock_get
            requests_mock.post.return_value = MockResponse({
                "access_token": "transient-access-token",
                "token_type": "Bearer",
                "id_token": id_token,
            })
            response = self.client.get(
                "/api/auth/microsoft/callback",
                params={"state": state_override or state, "code": "authcode"},
                follow_redirects=False,
            )
        return response

    def me(self):
        return self.client.get("/api/auth/me").json()


class TestMicrosoftConfiguration(MicrosoftTestBase):
    def test_unconfigured_returns_503_and_other_logins_unaffected(self):
        for key in CLIENT_ENV:
            os.environ.pop(key, None)
        response = self.client.get(
            "/api/auth/microsoft", follow_redirects=False)
        self.assertEqual(503, response.status_code)
        self.assertIn("not configured", response.json()["error"])
        response = self.client.get(
            "/api/auth/microsoft/callback", follow_redirects=False)
        self.assertEqual(503, response.status_code)

        # dev-login keeps working while Microsoft is unconfigured.
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        try:
            response = self.client.post(
                "/api/auth/dev-login", json={"email": "dev@example.com"})
            self.assertEqual(200, response.status_code)
        finally:
            os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)


class TestMicrosoftAuthorizationRequest(MicrosoftTestBase):
    def test_redirect_targets_organizations_authority_with_oidc_params(self):
        location = self.start_login()
        parsed = urlparse(location)
        query = parse_qs(parsed.query)
        self.assertEqual("login.microsoftonline.com", parsed.netloc)
        # Work/school accounts only: the organizations authority, never the
        # consumer endpoint.
        self.assertIn("/organizations/", parsed.path)
        self.assertEqual(["code"], query["response_type"])
        self.assertEqual([CLIENT_ENV["QRESP_MICROSOFT_CLIENT_ID"]],
                         query["client_id"])
        self.assertEqual([CLIENT_ENV["QRESP_MICROSOFT_REDIRECT_URI"]],
                         query["redirect_uri"])
        # Identity-only scopes; nothing Graph/mail/files-shaped. Token-wise
        # check ("mail" would otherwise match inside "email").
        self.assertEqual(["openid profile email"], query["scope"])
        scope_tokens = set(query["scope"][0].lower().split())
        self.assertEqual({"openid", "profile", "email"}, scope_tokens)
        for token in scope_tokens:
            self.assertNotIn("graph", token)
            self.assertFalse(token.startswith(
                ("mail.", "files.", "calendars.", "contacts.", "sites.",
                 "user.")))
        self.assertTrue(query["state"][0])
        self.assertTrue(query["nonce"][0])
        self.assertEqual(["S256"], query["code_challenge_method"])
        self.assertEqual(43, len(query["code_challenge"][0]))
        # Account selection so a signed-out user can switch accounts.
        self.assertEqual(["select_account"], query["prompt"])

    def test_each_login_gets_fresh_state_and_nonce(self):
        first = parse_qs(urlparse(self.start_login()).query)
        second = parse_qs(urlparse(self.start_login()).query)
        self.assertNotEqual(first["state"], second["state"])
        self.assertNotEqual(first["nonce"], second["nonce"])


class TestMicrosoftCallbackRejections(MicrosoftTestBase):
    def test_mismatched_state_rejected(self):
        response = self.finish_login(state_override="wrong-state")
        self.assertEqual(400, response.status_code)
        self.assertIn("state", response.json()["error"].lower())
        self.assertFalse(self.me()["authenticated"])

    def test_callback_without_started_flow_rejected(self):
        response = self.client.get(
            "/api/auth/microsoft/callback",
            params={"state": "anything", "code": "authcode"},
            follow_redirects=False,
        )
        self.assertEqual(400, response.status_code)

    def test_provider_error_reported(self):
        response = self.client.get(
            "/api/auth/microsoft/callback",
            params={"error": "access_denied"},
            follow_redirects=False,
        )
        self.assertEqual(400, response.status_code)
        message = response.json()["error"]
        self.assertIn("did not complete", message)
        # The provider's error string arrives in the URL and is therefore
        # attacker-controllable: log it, never reflect it.
        self.assertNotIn("access_denied", message)

    def test_mismatched_nonce_rejected(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token("other-nonce"))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_expired_token_rejected(self):
        now = int(time.time())
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, iat=now - 7200, exp=now - 3600))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_wrong_audience_rejected(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, aud="00000000-0000-0000-0000-000000000000"))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_non_entra_issuer_rejected(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, iss="https://evil.example.com/%s/v2.0" % TENANT_ID))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_issuer_tenant_mismatching_tid_rejected(self):
        # Issuer says one tenant, tid claims another: forged multitenant mix.
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, tid=OTHER_TENANT_ID))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_rogue_signing_key_rejected(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, key=_ROGUE_PEM))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_missing_tid_rejected(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(nonce, tid=None))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_missing_oid_rejected(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(nonce, oid=None))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])

    def test_missing_usable_email_rejected_without_session(self):
        # No email claim, and preferred_username is a non-email UPN.
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, email=None, preferred_username="prof-device-account"))
        self.assertEqual(400, response.status_code)
        self.assertIn("email", response.json()["error"].lower())
        self.assertFalse(self.me()["authenticated"])
        self.assertEqual(0, ExternalIdentity.objects.count())

    def test_configured_tenant_rejects_other_tenants(self):
        os.environ["QRESP_MICROSOFT_TENANT"] = TENANT_ID
        auth_module._microsoft_metadata_cache.clear()
        other_issuer = ("https://login.microsoftonline.com/%s/v2.0"
                        % OTHER_TENANT_ID)
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, iss=other_issuer, tid=OTHER_TENANT_ID))
        self.assertEqual(400, response.status_code)
        self.assertFalse(self.me()["authenticated"])


class TestMicrosoftSuccessfulLogin(MicrosoftTestBase):
    def test_login_establishes_compatible_session_and_identity(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, email="  Prof@UChicago.EDU "))
        self.assertEqual(302, response.status_code, response.text)
        self.assertEqual("/", response.headers["location"])

        me = self.me()
        self.assertTrue(me["authenticated"])
        self.assertEqual(EMAIL, me["user"]["email"])
        self.assertEqual("Prof Example", me["user"]["name"])
        self.assertEqual("microsoft", me["user"]["provider"])
        self.assertFalse(me["user"]["is_admin"])
        self.assertTrue(me["user"]["account_id"])

        # Keyed by tenant-scoped issuer + immutable object id, not email.
        identity = ExternalIdentity.objects.get(
            issuer=ISSUER, subject=OBJECT_ID)
        self.assertEqual("microsoft", identity.provider)
        self.assertEqual(EMAIL, identity.email)
        self.assertIsNotNone(identity.created_at)
        self.assertIsNotNone(identity.last_login_at)
        self.assertEqual(str(identity.id), me["user"]["account_id"])

    def test_second_login_reuses_the_identity(self):
        self.finish_login()
        first = ExternalIdentity.objects.get(issuer=ISSUER, subject=OBJECT_ID)
        self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, name="Prof Renamed"))
        self.assertEqual(1, ExternalIdentity.objects.count())
        again = ExternalIdentity.objects.get(issuer=ISSUER, subject=OBJECT_ID)
        self.assertEqual(first.id, again.id)
        self.assertEqual("Prof Renamed", again.name)

    def test_preferred_username_email_fallback(self):
        response = self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, email=None,
                preferred_username="  Fallback@Uni.EDU "))
        self.assertEqual(302, response.status_code, response.text)
        self.assertEqual("fallback@uni.edu", self.me()["user"]["email"])

    def test_admin_allowlist_applies_and_provider_claims_do_not(self):
        os.environ["QRESP_ADMIN_EMAILS"] = "boss@example.com, %s" % EMAIL
        # Entra role/group claims must never grant Qresp admin — only the
        # local allowlist does.
        self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, roles=["Admin"], groups=["global-admins"]))
        self.assertTrue(self.me()["user"]["is_admin"])

        # Now the inverse: provider admin claims WITHOUT allowlist membership.
        os.environ.pop("QRESP_ADMIN_EMAILS", None)
        self.finish_login(
            token_factory=lambda nonce: self.make_id_token(
                nonce, roles=["Admin"], wids=["62e90394-69f5-4237-9190"]))
        self.assertFalse(self.me()["user"]["is_admin"])

    def test_safe_next_path_honored_and_open_redirects_blocked(self):
        response = self.finish_login(next_path="/curator")
        self.assertEqual("/curator", response.headers["location"])
        response = self.finish_login(next_path="https://evil.example.com/")
        self.assertEqual("/", response.headers["location"])

    def test_configured_tenant_accepts_its_own_tokens(self):
        os.environ["QRESP_MICROSOFT_TENANT"] = TENANT_ID
        auth_module._microsoft_metadata_cache.clear()
        response = self.finish_login()
        self.assertEqual(302, response.status_code, response.text)
        self.assertTrue(self.me()["authenticated"])


class TestMicrosoftPermissionsIntegration(MicrosoftTestBase):
    """A Microsoft session flows through the existing email-based
    owner/editor/admin checks unchanged — records matched, never claimed."""

    def _seed_paper(self, owner_email=None, editor_emails=None):
        paper = Paper(**load_fixture())
        if owner_email:
            paper.owner_email = owner_email
        if editor_emails:
            paper.editor_emails = editor_emails
        paper.save()
        return str(paper.id)

    def test_microsoft_user_is_owner_via_matching_email(self):
        paper_id = self._seed_paper(owner_email=EMAIL)
        self.finish_login()
        body = self.client.get(f"/api/paper/{paper_id}/permissions").json()
        self.assertTrue(body["can_edit"])
        self.assertEqual("owner", body["reason"])
        self.assertTrue(body["can_manage"])
        self.assertEqual(EMAIL, Paper.objects.get(id=paper_id).owner_email)

    def test_microsoft_user_is_editor_via_matching_email(self):
        paper_id = self._seed_paper(owner_email="other@example.com",
                                    editor_emails=[EMAIL])
        self.finish_login()
        body = self.client.get(f"/api/paper/{paper_id}/permissions").json()
        self.assertTrue(body["can_edit"])
        self.assertEqual("editor", body["reason"])
        self.assertFalse(body["can_manage"])

    def test_microsoft_session_can_edit_owned_record(self):
        paper_id = self._seed_paper(owner_email=EMAIL)
        self.finish_login()
        csrf = self.me()["csrf_token"]
        response = self.client.put(
            f"/api/paper/{paper_id}", json={"tags": ["ms-edit"]},
            headers={"X-CSRF-Token": csrf})
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(
            ["ms-edit"], list(Paper.objects.get(id=paper_id).tags))


if __name__ == "__main__":
    unittest.main()
