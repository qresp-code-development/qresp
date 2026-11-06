from project.paperdao import Paper
from project.tests.test_permissions import (
    ADMIN,
    OTHER,
    OWNER,
    PermissionTestBase,
)


class TestSoftDeactivate(PermissionTestBase):
    """Owner/admin-only soft deactivation of published records, and the
    public-visibility rules that follow from it."""

    def _set_active(self, paper_id, active):
        return self.client.put(
            f"/api/paper/{paper_id}/active",
            json={"active": active},
            headers={"X-CSRF-Token": self.csrf},
        )

    # ---- authorization -----------------------------------------------------

    def test_anonymous_cannot_deactivate(self):
        response = self.client.put(
            f"/api/paper/{self.owned_id}/active", json={"active": False}
        )
        self.assertEqual(401, response.status_code)
        self.assertTrue(Paper.objects.get(id=self.owned_id).is_active)

    def test_non_owner_cannot_deactivate(self):
        self.login(OTHER)
        response = self._set_active(self.owned_id, False)
        self.assertEqual(403, response.status_code)
        self.assertTrue(Paper.objects.get(id=self.owned_id).is_active)

    def test_owner_can_deactivate_and_reactivate(self):
        self.login(OWNER)
        self.assertEqual(200, self._set_active(self.owned_id, False).status_code)
        self.assertFalse(Paper.objects.get(id=self.owned_id).is_active)
        self.assertEqual(200, self._set_active(self.owned_id, True).status_code)
        self.assertTrue(Paper.objects.get(id=self.owned_id).is_active)

    def test_admin_can_deactivate_any_record(self):
        self.login(ADMIN)
        self.assertEqual(
            200, self._set_active(self.ownerless_id, False).status_code)
        self.assertFalse(Paper.objects.get(id=self.ownerless_id).is_active)

    def test_non_boolean_active_is_rejected(self):
        self.login(OWNER)
        response = self.client.put(
            f"/api/paper/{self.owned_id}/active",
            json={"active": "yes"},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(400, response.status_code)

    # ---- public visibility -------------------------------------------------

    def test_deactivated_record_hidden_from_search(self):
        # Two records exist (owned + ownerless). Search returns both while
        # active; deactivating one drops it from the public results.
        before = self.client.get("/api/search").json()
        self.assertEqual(2, len(before))

        self.login(OWNER)
        self._set_active(self.owned_id, False)

        after = self.client.get("/api/search").json()
        self.assertEqual(1, len(after))

    def test_deactivated_detail_hidden_from_anonymous(self):
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        # New anonymous client (no session cookie).
        from project import connexionapp
        anon = connexionapp.test_client()
        response = anon.get(f"/api/paper/{self.owned_id}")
        self.assertEqual(404, response.status_code)

    def test_owner_can_still_load_deactivated_detail(self):
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        response = self.client.get(f"/api/paper/{self.owned_id}")
        self.assertEqual(200, response.status_code)

    def test_admin_can_still_load_deactivated_detail(self):
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        self.login(ADMIN)
        response = self.client.get(f"/api/paper/{self.owned_id}")
        self.assertEqual(200, response.status_code)

    def test_active_record_detail_stays_public(self):
        response = self.client.get(f"/api/paper/{self.owned_id}")
        self.assertEqual(200, response.status_code)

    # ---- surfaced flags ----------------------------------------------------

    def test_account_papers_reports_active_state(self):
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        response = self.client.get("/api/account/papers")
        self.assertEqual(200, response.status_code)
        summary = response.json()["papers"][0]
        self.assertIn("is_active", summary)
        self.assertFalse(summary["is_active"])

    def test_permissions_reports_active_state(self):
        body = self.permissions(self.owned_id)
        self.assertTrue(body["is_active"])

    # ---- editing a deactivated record (owner/admin) ------------------------

    def test_owner_can_load_raw_of_deactivated_record(self):
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        response = self.client.get(f"/api/paper/{self.owned_id}/raw")
        self.assertEqual(200, response.status_code, response.text)
        self.assertTrue(response.json()["paper"])

    def test_owner_can_edit_deactivated_record_and_stays_deactivated(self):
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        response = self.client.put(
            f"/api/paper/{self.owned_id}",
            json={"tags": ["edited-while-hidden"]},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(200, response.status_code, response.text)
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual(["edited-while-hidden"], list(updated.tags))
        # The edit must NOT resurrect the record.
        self.assertFalse(updated.is_active)

    def test_edit_payload_cannot_reactivate_a_record(self):
        # is_active is owned by the /active endpoint only; a crafted metadata
        # PUT must never flip it.
        self.login(OWNER)
        self._set_active(self.owned_id, False)
        response = self.client.put(
            f"/api/paper/{self.owned_id}",
            json={"tags": ["sneaky"], "is_active": True},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(200, response.status_code, response.text)
        self.assertFalse(Paper.objects.get(id=self.owned_id).is_active)
