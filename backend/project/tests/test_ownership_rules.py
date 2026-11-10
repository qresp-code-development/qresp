import glob
import json
import os
import unittest
from unittest import mock

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


class TestPublishRequiresOwner(PermissionTestBase):
    """POST /api/publish — production ownership rules for NEW records.

    Publishing inserts the record immediately: the signed-in session already
    proves who is publishing, so no per-record email link is sent."""

    def publish(self, payload):
        headers = {}
        if getattr(self, "csrf", None):
            headers["X-CSRF-Token"] = self.csrf
        with mock.patch("project.utils.mail.mailClient") as mail:
            response = self.client.post(
                "/api/publish", json=payload, headers=headers
            )
        mail.send.assert_not_called()
        return response

    def published(self, response):
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertTrue(body["success"])
        return Paper.objects.get(id=body["id"])

    def test_anonymous_publish_denied_401(self):
        before = Paper.objects.count()
        response = self.publish(load_fixture())
        self.assertEqual(401, response.status_code, response.text)
        self.assertEqual(before, Paper.objects.count())

    def test_publish_inserts_the_record_at_once_with_the_session_owner(self):
        self.login(OWNER)
        before = Paper.objects.count()
        record = self.published(self.publish(load_fixture()))
        self.assertEqual(before + 1, Paper.objects.count())
        self.assertEqual(OWNER, record.owner_email)
        self.assertNotIn("verify_link", self.publish(load_fixture()).json())

    def test_a_blank_curator_email_falls_back_to_the_signed_in_account(self):
        self.login(OWNER)
        payload = load_fixture()
        payload["info"]["insertedBy"] = {"firstName": "", "lastName": "",
                                         "emailId": ""}
        record = self.published(self.publish(payload))
        self.assertEqual(OWNER, record.info.insertedBy.emailId)

    def test_a_typed_curator_email_is_kept(self):
        self.login(OWNER)
        payload = load_fixture()
        payload["info"]["insertedBy"]["emailId"] = "curator@example.edu"
        record = self.published(self.publish(payload))
        self.assertEqual("curator@example.edu", record.info.insertedBy.emailId)

    def test_client_supplied_owner_is_discarded(self):
        self.login(OWNER)
        payload = load_fixture()
        payload["owner_email"] = "attacker@evil.com"
        record = self.published(self.publish(payload))
        self.assertEqual(OWNER, record.owner_email)

    def test_a_record_the_model_refuses_is_a_400(self):
        from mongoengine.errors import ValidationError
        self.login(OWNER)
        with mock.patch("project.controllers.publish.PaperDAO") as dao:
            dao.return_value.insertIntoPapers.side_effect = ValidationError("bad year")
            response = self.publish(load_fixture())
        self.assertEqual(400, response.status_code, response.text)
        self.assertIn("could not be saved", response.json()["msg"])

    def test_a_database_failure_is_a_500_without_details(self):
        self.login(OWNER)
        with mock.patch("project.controllers.publish.PaperDAO") as dao:
            dao.return_value.insertIntoPapers.side_effect = RuntimeError("db down")
            response = self.publish(load_fixture())
        self.assertEqual(500, response.status_code, response.text)
        self.assertNotIn("db down", response.json()["msg"])

    def test_publish_controller_error_is_returned_as_json_message(self):
        self.login(OWNER)
        with mock.patch("project.api.Publish") as publish_cls:
            publish_cls.return_value.publish.return_value = {
                "msg": "schema failed",
                "code": 400,
            }
            response = self.client.post(
                "/api/publish", json=load_fixture(),
                headers={"X-CSRF-Token": self.csrf},
            )
        self.assertEqual(400, response.status_code, response.text)
        self.assertEqual("schema failed", response.json()["msg"])

    def test_preview_stays_anonymous(self):
        payload = load_fixture()
        response = self.client.post("/api/preview", json=payload)
        self.assertEqual(200, response.status_code, response.text)
        preview_id = response.json()
        # cleanup the preview artifact written by the controller
        for path in glob.glob(
                os.path.join(os.getcwd(), "papers", "previews",
                             "%s.json" % preview_id)):
            os.remove(path)


class TestOwnerlessAdminList(PermissionTestBase):
    """GET /api/admin/ownerless-papers — admin-only legacy inventory."""

    def test_anonymous_denied_401(self):
        response = self.client.get("/api/admin/ownerless-papers")
        self.assertEqual(401, response.status_code)

    def test_non_admin_denied_403(self):
        self.login(OTHER)
        response = self.client.get("/api/admin/ownerless-papers")
        self.assertEqual(403, response.status_code)

    def test_admin_gets_compact_ownerless_list(self):
        self.login(ADMIN)
        response = self.client.get("/api/admin/ownerless-papers")
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual(1, body["count"])  # owned record must NOT be listed
        entry = body["papers"][0]
        self.assertEqual(self.ownerless_id, entry["id"])
        self.assertIsNone(entry["owner_email"])
        self.assertEqual("john.doe@company.com",
                         entry["suggested_owner_email"])
        self.assertTrue(entry["title"])
        self.assertEqual(2016, entry["year"])
        self.assertIn("Gaiduk", entry["authors"])


class TestAssignOwner(PermissionTestBase):
    """PUT /api/paper/{id}/owner — admin-only legacy owner assignment."""

    def assign(self, paper_id, body):
        headers = {}
        if getattr(self, "csrf", None):
            headers["X-CSRF-Token"] = self.csrf
        return self.client.put(
            f"/api/paper/{paper_id}/owner", json=body, headers=headers
        )

    def test_anonymous_denied_401(self):
        response = self.assign(self.ownerless_id,
                               {"owner_email": "a@b.co"})
        self.assertEqual(401, response.status_code)

    def test_non_admin_denied_403(self):
        self.login(OTHER)
        response = self.assign(self.ownerless_id,
                               {"owner_email": "other@example.com"})
        self.assertEqual(403, response.status_code)
        self.assertIsNone(
            Paper.objects.get(id=self.ownerless_id).owner_email)

    def test_admin_assigns_owner_to_legacy_record(self):
        self.login(ADMIN)
        response = self.assign(
            self.ownerless_id, {"owner_email": "  New.Owner@Example.COM "}
        )
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(
            {"id": self.ownerless_id,
             "owner_email": "new.owner@example.com",
             "success": True},
            response.json(),
        )
        updated = Paper.objects.get(id=self.ownerless_id)
        self.assertEqual("new.owner@example.com", updated.owner_email)
        # only owner_email changed
        self.assertTrue(updated.reference.title)
        self.assertEqual(["DFT"], list(updated.tags)[:1])

    def test_assigned_owner_can_edit(self):
        self.login(ADMIN)
        self.assign(self.ownerless_id, {"owner_email": OTHER})
        self.login(OTHER)
        response = self.client.get(
            f"/api/paper/{self.ownerless_id}/permissions")
        self.assertTrue(response.json()["can_edit"])

    def test_invalid_email_rejected(self):
        self.login(ADMIN)
        for bad in ("", "not-an-email", "a@b", "a b@c.com"):
            response = self.assign(self.ownerless_id, {"owner_email": bad})
            self.assertEqual(400, response.status_code, bad)

    def test_existing_owner_not_overwritten_without_force(self):
        self.login(ADMIN)
        response = self.assign(self.owned_id,
                               {"owner_email": "usurper@example.com"})
        self.assertEqual(409, response.status_code)
        self.assertEqual(OWNER, Paper.objects.get(id=self.owned_id).owner_email)

        response = self.assign(
            self.owned_id,
            {"owner_email": "usurper@example.com", "force": True},
        )
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual("usurper@example.com",
                         Paper.objects.get(id=self.owned_id).owner_email)


if __name__ == "__main__":
    unittest.main()
