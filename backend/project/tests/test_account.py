import unittest

from project.tests.test_permissions import (
    ADMIN,
    OTHER,
    OWNER,
    PermissionTestBase,
)


class TestAccountPapers(PermissionTestBase):
    """GET /api/account/papers — records owned by the session user."""

    def test_anonymous_denied_401(self):
        response = self.client.get("/api/account/papers")
        self.assertEqual(401, response.status_code)

    def test_owner_sees_only_their_records(self):
        self.login(OWNER)
        response = self.client.get("/api/account/papers")
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual(1, body["count"])  # the ownerless record is excluded
        entry = body["papers"][0]
        self.assertEqual(self.owned_id, entry["id"])
        self.assertEqual(OWNER, entry["owner_email"])
        self.assertTrue(entry["title"])
        self.assertEqual(2016, entry["year"])
        self.assertIn("DFT", entry["tags"])
        self.assertIn("MICCOM", entry["collections"])
        self.assertIn("Gaiduk", entry["authors"])

    def test_non_owner_gets_empty_list(self):
        self.login(OTHER)
        response = self.client.get("/api/account/papers")
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(0, response.json()["count"])

    def test_admin_sees_only_their_own_records_here(self):
        self.login(ADMIN)
        response = self.client.get("/api/account/papers")
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(0, response.json()["count"])


if __name__ == "__main__":
    unittest.main()
