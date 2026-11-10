import json
import os
import unittest

from project.paperdao import Paper
from project.tests.test_permissions import (
    ADMIN,
    OTHER,
    OWNER,
    PermissionTestBase,
)


def load_fixture():
    location = os.path.realpath(
        os.path.join(os.getcwd(), os.path.dirname(__file__)))
    with open(os.path.join(location, 'data.json')) as f:
        return json.load(f)


class TestRawPaper(PermissionTestBase):
    """GET /api/paper/{id}/raw — the curator edit flow's data source."""

    def raw(self, paper_id):
        return self.client.get(f"/api/paper/{paper_id}/raw")

    def test_anonymous_denied_401(self):
        self.assertEqual(401, self.raw(self.owned_id).status_code)

    def test_non_owner_denied_403(self):
        self.login(OTHER)
        self.assertEqual(403, self.raw(self.owned_id).status_code)

    def test_owner_gets_stored_document_without_server_fields(self):
        self.login(OWNER)
        response = self.raw(self.owned_id)
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual(self.owned_id, body["id"])
        doc = body["paper"]
        # full stored shape, not the display shape
        self.assertIn("reference", doc)
        self.assertIn("info", doc)
        self.assertIn("insertedBy", doc["info"])
        self.assertIn("charts", doc)
        self.assertIn("workflow", doc)
        # server-owned fields stripped
        self.assertNotIn("_id", doc)
        self.assertNotIn("owner_email", doc)

    def test_admin_can_load_ownerless_record(self):
        self.login(ADMIN)
        response = self.raw(self.ownerless_id)
        self.assertEqual(200, response.status_code, response.text)

    def test_missing_paper_404(self):
        self.login(ADMIN)
        response = self.raw("000000000000000000000000")
        self.assertEqual(404, response.status_code)


class TestFullMetadataUpdate(PermissionTestBase):
    """PUT /api/paper/{id} with a full curator-shaped payload (edit flow)."""

    def update(self, paper_id, payload):
        headers = {}
        if getattr(self, "csrf", None):
            headers["X-CSRF-Token"] = self.csrf
        return self.client.put(
            f"/api/paper/{paper_id}", json=payload, headers=headers
        )

    def full_payload(self, **overrides):
        payload = load_fixture()
        for blocked in ("version", "versions"):
            payload.pop(blocked, None)
        payload["reference"]["title"] = "Edited title from the curator"
        payload["tags"] = ["DFT", "edited"]
        payload["charts"][0]["caption"] = "Edited caption"
        payload["datasets"][0]["description"] = "Edited dataset description"
        payload.update(overrides)
        return payload

    def test_owner_full_update_persists_all_sections(self):
        self.login(OWNER)
        response = self.update(self.owned_id, self.full_payload())
        self.assertEqual(200, response.status_code, response.text)
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual("Edited title from the curator",
                         updated.reference.title)
        self.assertEqual(["DFT", "edited"], list(updated.tags))
        self.assertEqual("Edited caption", updated.charts[0].caption)
        self.assertEqual("Edited dataset description",
                         updated.datasets[0].description)
        # verified owner survives a full-document payload
        self.assertEqual(OWNER, updated.owner_email)

    def test_admin_full_update_allowed(self):
        self.login(ADMIN)
        response = self.update(self.owned_id, self.full_payload())
        self.assertEqual(200, response.status_code, response.text)

    def test_full_update_cannot_change_owner(self):
        self.login(OWNER)
        response = self.update(
            self.owned_id, self.full_payload(owner_email="attacker@evil.com")
        )
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(OWNER,
                         Paper.objects.get(id=self.owned_id).owner_email)

    def test_non_owner_full_update_denied(self):
        self.login(OTHER)
        response = self.update(self.owned_id, self.full_payload())
        self.assertEqual(403, response.status_code)

    def test_invalid_full_payload_rejected(self):
        self.login(OWNER)
        payload = self.full_payload()
        payload["tags"] = "not a list"  # wrong type: still refused
        response = self.update(self.owned_id, payload)
        self.assertEqual(400, response.status_code)


if __name__ == "__main__":
    unittest.main()
