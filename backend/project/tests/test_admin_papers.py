from project.paperdao import Paper
from project.tests.test_permissions import (
    ADMIN,
    OTHER,
    OWNER,
    PermissionTestBase,
)

EDITOR = "editor@example.com"


class TestAdminPapers(PermissionTestBase):
    """GET /api/admin/papers — the complete admin management inventory."""

    def test_anonymous_401(self):
        response = self.client.get("/api/admin/papers")
        self.assertEqual(401, response.status_code)

    def test_non_admin_403(self):
        self.login(OTHER)
        response = self.client.get("/api/admin/papers")
        self.assertEqual(403, response.status_code)

    def test_admin_sees_all_records_including_foreign_and_deactivated(self):
        # Owner (NOT the admin) deactivates their record and adds an editor.
        self.login(OWNER)
        self.client.put(
            f"/api/paper/{self.owned_id}/active", json={"active": False},
            headers={"X-CSRF-Token": self.csrf})
        self.client.put(
            f"/api/paper/{self.owned_id}/editors",
            json={"editor_emails": [EDITOR]},
            headers={"X-CSRF-Token": self.csrf})

        self.login(ADMIN)
        response = self.client.get("/api/admin/papers")
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        # Both seeded records: one owned by someone else (and deactivated),
        # one ownerless — the admin owns/edits neither.
        self.assertEqual(2, body["count"])
        by_id = {paper["id"]: paper for paper in body["papers"]}

        owned = by_id[self.owned_id]
        self.assertEqual(OWNER, owned["owner_email"])
        self.assertFalse(owned["is_active"])
        self.assertEqual([EDITOR], owned["editor_emails"])
        # Audit fields surfaced from the owner's mutations above.
        self.assertEqual(OWNER, owned["updated_by_email"])
        self.assertTrue(owned["updated_at"])

        ownerless = by_id[self.ownerless_id]
        self.assertIsNone(ownerless["owner_email"])
        self.assertTrue(ownerless["is_active"])
        self.assertEqual([], ownerless["editor_emails"])

    def test_legacy_fields_are_normalized(self):
        # Simulate a true legacy document: strip the Qresp 2.0 fields
        # entirely. Missing is_active => active, missing editor_emails => [],
        # missing owner_email => ownerless, no audit info.
        Paper.objects(id=self.owned_id).update(
            unset__is_active=1,
            unset__editor_emails=1,
            unset__owner_email=1,
            unset__updated_at=1,
            unset__updated_by_email=1,
        )
        self.login(ADMIN)
        body = self.client.get("/api/admin/papers").json()
        legacy = {p["id"]: p for p in body["papers"]}[self.owned_id]
        self.assertTrue(legacy["is_active"])
        self.assertEqual([], legacy["editor_emails"])
        self.assertIsNone(legacy["owner_email"])
        self.assertIsNone(legacy["updated_at"])
        self.assertIsNone(legacy["updated_by_email"])
