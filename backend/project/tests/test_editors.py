from project.paperdao import Paper
from project.tests.test_permissions import (
    ADMIN,
    OTHER,
    OWNER,
    PermissionTestBase,
)

EDITOR = "editor@example.com"


class EditorTestBase(PermissionTestBase):
    def set_editors(self, paper_id, editors):
        return self.client.put(
            f"/api/paper/{paper_id}/editors",
            json={"editor_emails": editors},
            headers={"X-CSRF-Token": self.csrf},
        )

    def edit_tags(self, paper_id, tags):
        return self.client.put(
            f"/api/paper/{paper_id}", json={"tags": tags},
            headers={"X-CSRF-Token": self.csrf},
        )

    def set_active(self, paper_id, active):
        return self.client.put(
            f"/api/paper/{paper_id}/active", json={"active": active},
            headers={"X-CSRF-Token": self.csrf},
        )

    def add_editor_as_owner(self, editor=EDITOR):
        self.login(OWNER)
        response = self.set_editors(self.owned_id, [editor])
        assert response.status_code == 200, response.text


class TestEditorManagement(EditorTestBase):
    """PUT /api/paper/{id}/editors — owner/admin manage the edit-only list."""

    def test_owner_can_set_editors(self):
        self.login(OWNER)
        response = self.set_editors(self.owned_id, [EDITOR])
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual([EDITOR], response.json()["editor_emails"])
        self.assertEqual(
            [EDITOR], list(Paper.objects.get(id=self.owned_id).editor_emails))

    def test_admin_can_set_editors_on_any_record(self):
        self.login(ADMIN)
        response = self.set_editors(self.ownerless_id, [EDITOR])
        self.assertEqual(200, response.status_code, response.text)

    def test_editor_cannot_manage_editors(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        response = self.set_editors(self.owned_id, [EDITOR, OTHER])
        self.assertEqual(403, response.status_code)
        self.assertIn("not manage", response.json()["error"])
        self.assertEqual(
            [EDITOR], list(Paper.objects.get(id=self.owned_id).editor_emails))

    def test_non_owner_cannot_manage_editors(self):
        self.login(OTHER)
        response = self.set_editors(self.owned_id, [OTHER])
        self.assertEqual(403, response.status_code)

    def test_anonymous_cannot_manage_editors(self):
        response = self.client.put(
            f"/api/paper/{self.owned_id}/editors",
            json={"editor_emails": [EDITOR]})
        self.assertEqual(401, response.status_code)

    def test_editor_emails_are_normalized_and_deduplicated(self):
        self.login(OWNER)
        response = self.set_editors(
            self.owned_id, ["  Editor@Example.COM ", EDITOR, ""])
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual([EDITOR], response.json()["editor_emails"])

    def test_invalid_editor_email_rejected(self):
        self.login(OWNER)
        response = self.set_editors(self.owned_id, ["not-an-email"])
        self.assertEqual(400, response.status_code)

    def test_editors_can_be_cleared(self):
        self.add_editor_as_owner()
        response = self.set_editors(self.owned_id, [])
        self.assertEqual(200, response.status_code)
        self.assertEqual(
            [], list(Paper.objects.get(id=self.owned_id).editor_emails))


class TestEditorPermissions(EditorTestBase):
    """The editor role: edit-only access to the record."""

    def test_editor_can_edit_metadata(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        response = self.edit_tags(self.owned_id, ["edited-by-editor"])
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(
            ["edited-by-editor"],
            list(Paper.objects.get(id=self.owned_id).tags))

    def test_editor_can_load_raw(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        response = self.client.get(f"/api/paper/{self.owned_id}/raw")
        self.assertEqual(200, response.status_code, response.text)

    def test_editor_cannot_deactivate(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        response = self.set_active(self.owned_id, False)
        self.assertEqual(403, response.status_code)
        self.assertTrue(Paper.objects.get(id=self.owned_id).is_active)

    def test_editor_can_edit_deactivated_record(self):
        self.add_editor_as_owner()
        self.login(OWNER)
        self.set_active(self.owned_id, False)
        self.login(EDITOR)
        response = self.edit_tags(self.owned_id, ["hidden-edit"])
        self.assertEqual(200, response.status_code, response.text)
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual(["hidden-edit"], list(updated.tags))
        self.assertFalse(updated.is_active)

    def test_permissions_endpoint_reports_editor_role(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        body = self.permissions(self.owned_id)
        self.assertTrue(body["can_edit"])
        self.assertEqual("editor", body["reason"])
        self.assertEqual("editor", body["role"])
        self.assertFalse(body["can_manage"])
        # Editors cannot manage the list, so it is not exposed to them.
        self.assertNotIn("editor_emails", body)

    def test_permissions_endpoint_reports_owner_role_and_editor_list(self):
        self.add_editor_as_owner()
        body = self.permissions(self.owned_id)
        self.assertEqual("owner", body["role"])
        self.assertTrue(body["can_manage"])
        self.assertEqual([EDITOR], body["editor_emails"])

    def test_edit_payload_cannot_change_editor_list(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        response = self.client.put(
            f"/api/paper/{self.owned_id}",
            json={"tags": ["ok"], "editor_emails": [EDITOR, OTHER]},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(
            [EDITOR], list(Paper.objects.get(id=self.owned_id).editor_emails))


class TestOwnerReassignment(EditorTestBase):
    """Admin owner changes: the new owner gains edit, the old owner loses it
    unless they are kept on as an editor."""

    def reassign(self, paper_id, new_owner):
        return self.client.put(
            f"/api/paper/{paper_id}/owner",
            json={"owner_email": new_owner, "force": True},
            headers={"X-CSRF-Token": self.csrf},
        )

    def test_new_owner_can_edit_old_owner_cannot(self):
        self.login(ADMIN)
        response = self.reassign(self.owned_id, OTHER)
        self.assertEqual(200, response.status_code, response.text)

        self.login(OTHER)
        self.assertTrue(self.permissions(self.owned_id)["can_edit"])
        self.assertEqual(
            200, self.edit_tags(self.owned_id, ["new-owner"]).status_code)

        self.login(OWNER)
        body = self.permissions(self.owned_id)
        self.assertFalse(body["can_edit"])
        self.assertEqual("none", body["role"])
        self.assertEqual(
            403, self.edit_tags(self.owned_id, ["old-owner"]).status_code)

    def test_old_owner_keeps_edit_when_listed_as_editor(self):
        self.login(ADMIN)
        self.set_editors(self.owned_id, [OWNER])
        self.reassign(self.owned_id, OTHER)

        self.login(OWNER)
        body = self.permissions(self.owned_id)
        self.assertTrue(body["can_edit"])
        self.assertEqual("editor", body["role"])
        self.assertFalse(body["can_manage"])
        self.assertEqual(
            200, self.edit_tags(self.owned_id, ["still-editing"]).status_code)


class TestAuditFields(EditorTestBase):
    """updated_at / updated_by_email / edit_history stamped on mutations."""

    def test_edit_stamps_audit_fields(self):
        self.login(OWNER)
        response = self.edit_tags(self.owned_id, ["audited"])
        self.assertEqual(200, response.status_code, response.text)
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual(OWNER, updated.updated_by_email)
        self.assertIsNotNone(updated.updated_at)
        self.assertEqual(1, len(updated.edit_history))
        entry = updated.edit_history[0]
        self.assertEqual(OWNER, entry["email"])
        self.assertEqual("edit", entry["action"])
        self.assertTrue(entry["timestamp"])

    def test_deactivate_and_reactivate_append_history(self):
        self.login(OWNER)
        self.set_active(self.owned_id, False)
        self.set_active(self.owned_id, True)
        updated = Paper.objects.get(id=self.owned_id)
        actions = [entry["action"] for entry in updated.edit_history]
        self.assertEqual(["deactivate", "reactivate"], actions)
        self.assertEqual(OWNER, updated.updated_by_email)
        self.assertIsNotNone(updated.updated_at)

    def test_assign_owner_appends_history(self):
        self.login(ADMIN)
        response = self.client.put(
            f"/api/paper/{self.ownerless_id}/owner",
            json={"owner_email": OTHER},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(200, response.status_code, response.text)
        updated = Paper.objects.get(id=self.ownerless_id)
        self.assertEqual(ADMIN, updated.updated_by_email)
        self.assertEqual(
            ["assign_owner"],
            [entry["action"] for entry in updated.edit_history])

    def test_update_editors_appends_history(self):
        self.add_editor_as_owner()
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual(OWNER, updated.updated_by_email)
        self.assertEqual(
            ["update_editors"],
            [entry["action"] for entry in updated.edit_history])

    def test_edit_history_accumulates_across_actions(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        self.edit_tags(self.owned_id, ["one"])
        self.login(OWNER)
        self.set_active(self.owned_id, False)
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual(
            ["update_editors", "edit", "deactivate"],
            [entry["action"] for entry in updated.edit_history])
        self.assertEqual(
            [OWNER, EDITOR, OWNER],
            [entry["email"] for entry in updated.edit_history])

    def test_edit_payload_cannot_forge_audit_fields(self):
        self.login(OWNER)
        response = self.client.put(
            f"/api/paper/{self.owned_id}",
            json={"tags": ["ok"],
                  "updated_by_email": "forged@example.com",
                  "edit_history": [{"email": "forged@example.com",
                                    "action": "edit", "timestamp": "1970"}]},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(200, response.status_code, response.text)
        updated = Paper.objects.get(id=self.owned_id)
        self.assertEqual(OWNER, updated.updated_by_email)
        self.assertEqual(1, len(updated.edit_history))
        self.assertEqual(OWNER, updated.edit_history[0]["email"])


class TestAccountListsEditorRecords(EditorTestBase):
    """GET /api/account/papers includes records where the user is an editor."""

    def test_editor_sees_record_with_editor_role(self):
        self.add_editor_as_owner()
        self.login(EDITOR)
        response = self.client.get("/api/account/papers")
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual(1, body["count"])
        self.assertEqual("editor", body["papers"][0]["role"])
        self.assertEqual(self.owned_id, body["papers"][0]["id"])

    def test_owner_sees_record_with_owner_role(self):
        self.login(OWNER)
        response = self.client.get("/api/account/papers")
        body = response.json()
        self.assertEqual(1, body["count"])
        self.assertEqual("owner", body["papers"][0]["role"])
        self.assertIn("editor_emails", body["papers"][0])

    def test_non_related_user_sees_nothing(self):
        self.login(OTHER)
        body = self.client.get("/api/account/papers").json()
        self.assertEqual(0, body["count"])
