import json
import os
import unittest

import mongoengine
import mongomock

# Importing project builds the Connexion 3 app; tests run through the real
# ASGI middleware with mongomock (no MongoDB) — same pattern as the other
# suites.
from project import app, connexionapp
from project.auth import can_edit_paper, stamp_owner
from project.paperdao import Paper

OWNER = "owner@example.com"
OTHER = "other@example.com"
ADMIN = "admin@example.com"


class PermissionTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        os.environ["QRESP_ADMIN_EMAILS"] = ADMIN

        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        location = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(location, 'data.json')) as f:
            paperdata = json.load(f)

        owned = Paper(**paperdata)
        owned.owner_email = OWNER
        owned.save()
        self.owned_id = str(owned.id)

        ownerless = Paper(**paperdata)
        ownerless.save()
        self.ownerless_id = str(ownerless.id)

    def tearDown(self):
        Paper.drop_collection()
        mongoengine.disconnect_all()
        os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)
        os.environ.pop("QRESP_ADMIN_EMAILS", None)

    def login(self, email, is_admin=False):
        response = self.client.post(
            "/api/auth/dev-login", json={"email": email, "is_admin": is_admin}
        )
        assert response.status_code == 200, response.text
        # Session-authenticated mutations require the CSRF token from /me.
        self.csrf = self.client.get("/api/auth/me").json()["csrf_token"]

    def permissions(self, paper_id):
        response = self.client.get(f"/api/paper/{paper_id}/permissions")
        assert response.status_code == 200, response.text
        return response.json()


class TestPaperPermissionsEndpoint(PermissionTestBase):
    def test_anonymous_cannot_edit(self):
        body = self.permissions(self.owned_id)
        self.assertFalse(body["can_edit"])
        self.assertFalse(body["authenticated"])
        self.assertFalse(body["is_admin"])
        self.assertEqual(OWNER, body["owner_email"])
        self.assertIn("authentication", body["reason"])

    def test_owner_can_edit(self):
        self.login(OWNER)
        body = self.permissions(self.owned_id)
        self.assertTrue(body["can_edit"])
        self.assertEqual("owner", body["reason"])
        self.assertTrue(body["authenticated"])

    def test_non_owner_cannot_edit(self):
        self.login(OTHER)
        body = self.permissions(self.owned_id)
        self.assertFalse(body["can_edit"])
        self.assertIn("owner, an editor, or an admin", body["reason"])
        self.assertEqual("none", body["role"])
        self.assertFalse(body["can_manage"])

    def test_admin_can_edit_owned_record(self):
        self.login(ADMIN)
        body = self.permissions(self.owned_id)
        self.assertTrue(body["can_edit"])
        self.assertEqual("admin", body["reason"])
        self.assertTrue(body["is_admin"])

    def test_ownerless_record_is_admin_only(self):
        self.login(OTHER)
        body = self.permissions(self.ownerless_id)
        self.assertFalse(body["can_edit"])
        self.assertIn("no owner", body["reason"])
        self.assertIsNone(body["owner_email"])

        self.login(ADMIN)
        body = self.permissions(self.ownerless_id)
        self.assertTrue(body["can_edit"])

    def test_session_admin_flag_grants_edit(self):
        self.login(OTHER, is_admin=True)
        body = self.permissions(self.owned_id)
        self.assertTrue(body["can_edit"])
        self.assertEqual("admin", body["reason"])

    def test_unknown_paper_is_404(self):
        response = self.client.get("/api/paper/000000000000000000000000/permissions")
        self.assertEqual(404, response.status_code)


class TestOwnershipHelpers(PermissionTestBase):
    def test_can_edit_paper_rules(self):
        owned = Paper.objects.get(id=self.owned_id)
        ownerless = Paper.objects.get(id=self.ownerless_id)
        owner = {"email": OWNER, "is_admin": False}
        other = {"email": OTHER, "is_admin": False}
        admin = {"email": ADMIN, "is_admin": False}

        self.assertEqual((False, "authentication required"),
                         can_edit_paper(owned, None))
        self.assertEqual((True, "owner"), can_edit_paper(owned, owner))
        self.assertEqual((True, "admin"), can_edit_paper(owned, admin))
        self.assertFalse(can_edit_paper(owned, other)[0])
        self.assertFalse(can_edit_paper(ownerless, owner)[0])
        self.assertTrue(can_edit_paper(ownerless, admin)[0])

    def test_stamp_owner_uses_session_identity(self):
        # Logged-in session -> the publish payload gains owner_email.
        with app.test_request_context():
            from flask import session
            session["auth_user"] = {"email": OWNER, "name": "O",
                                    "is_admin": False, "provider": "dev"}
            paper = {"reference": {"title": "t"}}
            stamp_owner(paper)
            self.assertEqual(OWNER, paper["owner_email"])

        # Anonymous session -> payload untouched (record stays ownerless).
        with app.test_request_context():
            paper = {"reference": {"title": "t"}}
            stamp_owner(paper)
            self.assertNotIn("owner_email", paper)


if __name__ == "__main__":
    unittest.main()
