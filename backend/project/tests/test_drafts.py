import os
import unittest

import mongoengine
import mongomock

# Importing project builds the Connexion 3 app; tests run through the real
# ASGI middleware with mongomock (no MongoDB) — same pattern as the other
# suites.
from project import connexionapp
from project.models import CuratorDraft

OWNER = "owner@example.com"
OTHER = "other@example.com"


class DraftTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)

    def tearDown(self):
        CuratorDraft.drop_collection()
        mongoengine.disconnect_all()
        os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)

    def login(self, email):
        response = self.client.post(
            "/api/auth/dev-login", json={"email": email, "is_admin": False}
        )
        assert response.status_code == 200, response.text
        # Session-authenticated mutations require the CSRF token from /me.
        self.csrf = self.client.get("/api/auth/me").json()["csrf_token"]

    def create_draft(self, payload):
        return self.client.post(
            "/api/account/drafts", json=payload,
            headers={"X-CSRF-Token": self.csrf},
        )


class TestDraftAuth(DraftTestBase):
    def test_anonymous_cannot_list_drafts(self):
        response = self.client.get("/api/account/drafts")
        self.assertEqual(401, response.status_code)

    def test_anonymous_cannot_create_draft(self):
        response = self.client.post("/api/account/drafts",
                                    json={"state": {}})
        self.assertEqual(401, response.status_code)


class TestDraftCrud(DraftTestBase):
    def test_incomplete_state_is_accepted(self):
        # Drafts are never publish/schema-validated: a bare fragment with
        # none of the required publish fields must save fine.
        self.login(OWNER)
        response = self.create_draft(
            {"state": {"paperInfo": {"tags": ["metal"]}}})
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual("metal", body["title"])
        self.assertEqual(OWNER, body["owner_email"])
        self.assertTrue(body["id"])

    def test_title_prefers_canonical_reference_info(self):
        # referenceInfo is the canonical primary-paper bibliography; the
        # short-lived intermediate publicationInfo shape stays readable.
        self.login(OWNER)
        response = self.create_draft(
            {"state": {"referenceInfo": {"title": "Primary title"}}})
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual("Primary title", response.json()["title"])

        response = self.create_draft(
            {"state": {"publicationInfo": {"title": "Intermediate title"}}})
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual("Intermediate title", response.json()["title"])

    def test_empty_state_gets_untitled_fallback(self):
        self.login(OWNER)
        response = self.create_draft({"state": {}})
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual("Untitled draft", response.json()["title"])

    def test_explicit_title_wins_over_derived(self):
        self.login(OWNER)
        response = self.create_draft(
            {"title": "My label",
             "state": {"referenceInfo": {"title": "Paper title"}}})
        self.assertEqual("My label", response.json()["title"])

    def test_user_lists_only_own_drafts(self):
        self.login(OWNER)
        self.create_draft({"state": {"referenceInfo": {"title": "Mine"}}})
        self.login(OTHER)
        self.create_draft({"state": {"referenceInfo": {"title": "Theirs"}}})

        response = self.client.get("/api/account/drafts")
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual(1, body["count"])
        self.assertEqual("Theirs", body["drafts"][0]["title"])
        # List summaries must not ship the full state payloads.
        self.assertNotIn("state", body["drafts"][0])

    def test_cannot_access_another_users_draft(self):
        self.login(OWNER)
        draft_id = self.create_draft({"state": {}}).json()["id"]

        self.login(OTHER)
        self.assertEqual(
            404, self.client.get(f"/api/account/drafts/{draft_id}").status_code)
        self.assertEqual(404, self.client.put(
            f"/api/account/drafts/{draft_id}", json={"title": "hijack"},
            headers={"X-CSRF-Token": self.csrf}).status_code)
        self.assertEqual(404, self.client.delete(
            f"/api/account/drafts/{draft_id}",
            headers={"X-CSRF-Token": self.csrf}).status_code)
        # The draft is untouched.
        self.assertEqual(1, CuratorDraft.objects(owner_email=OWNER).count())

    def test_get_returns_full_state(self):
        self.login(OWNER)
        state = {"referenceInfo": {"title": "Full"}, "charts": [{"id": "c0"}]}
        draft_id = self.create_draft({"state": state}).json()["id"]

        response = self.client.get(f"/api/account/drafts/{draft_id}")
        self.assertEqual(200, response.status_code)
        self.assertEqual(state, response.json()["state"])

    def test_update_replaces_state_and_bumps_updated_at(self):
        self.login(OWNER)
        created = self.create_draft(
            {"state": {"referenceInfo": {"title": "v1"}}}).json()

        response = self.client.put(
            f"/api/account/drafts/{created['id']}",
            json={"state": {"referenceInfo": {"title": "v2"}}},
            headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(200, response.status_code, response.text)

        # Updating must not create a second draft.
        self.assertEqual(1, CuratorDraft.objects(owner_email=OWNER).count())
        fetched = self.client.get(
            f"/api/account/drafts/{created['id']}").json()
        self.assertEqual("v2", fetched["state"]["referenceInfo"]["title"])
        self.assertGreaterEqual(fetched["updated_at"], created["updated_at"])

    def test_rename_only_keeps_state(self):
        self.login(OWNER)
        draft_id = self.create_draft(
            {"state": {"referenceInfo": {"title": "Keep me"}}}).json()["id"]

        response = self.client.put(
            f"/api/account/drafts/{draft_id}", json={"title": "Renamed"},
            headers={"X-CSRF-Token": self.csrf})
        self.assertEqual("Renamed", response.json()["title"])
        fetched = self.client.get(f"/api/account/drafts/{draft_id}").json()
        self.assertEqual("Keep me", fetched["state"]["referenceInfo"]["title"])

    def test_delete_removes_draft(self):
        self.login(OWNER)
        draft_id = self.create_draft({"state": {}}).json()["id"]
        response = self.client.delete(
            f"/api/account/drafts/{draft_id}",
            headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(200, response.status_code)
        self.assertEqual(0, CuratorDraft.objects.count())
        self.assertEqual(
            404, self.client.get(f"/api/account/drafts/{draft_id}").status_code)

    def test_multiple_drafts_per_user(self):
        self.login(OWNER)
        self.create_draft({"state": {"referenceInfo": {"title": "One"}}})
        self.create_draft({"state": {"referenceInfo": {"title": "Two"}}})
        body = self.client.get("/api/account/drafts").json()
        self.assertEqual(2, body["count"])


if __name__ == "__main__":
    unittest.main()
