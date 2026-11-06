import json
import os
import unittest

import mongoengine
import mongomock

from project import connexionapp
from project.paperdao import Paper

PUBLISH_ID = "PUBLISH_test_verify"


def _fixture():
    location = os.path.realpath(
        os.path.join(os.getcwd(), os.path.dirname(__file__)))
    with open(os.path.join(location, 'data.json')) as f:
        return json.load(f)


def _queue_path():
    return os.path.join(os.getcwd(), "papers", "publish",
                        PUBLISH_ID + ".json")


class TestVerifyEndpoint(unittest.TestCase):
    """GET /api/verify/{id} — the second step of publishing. Hardened so the
    link is idempotent and gives clear messages for invalid/used links."""

    def setUp(self):
        self.client = connexionapp.test_client()
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        # No pre-seeded papers here, so the first verify is a genuine insert.
        os.makedirs(os.path.dirname(_queue_path()), exist_ok=True)
        with open(_queue_path(), 'w') as f:
            json.dump(_fixture(), f, ensure_ascii=False)

    def tearDown(self):
        if os.path.exists(_queue_path()):
            os.remove(_queue_path())
        Paper.drop_collection()
        mongoengine.disconnect_all()

    def test_verify_inserts_the_paper_and_returns_its_id(self):
        response = self.client.get(f"/api/verify/{PUBLISH_ID}")
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual("", body["error"])
        self.assertTrue(body["id"])
        self.assertEqual(1, Paper.objects.count())

    def test_reverifying_is_idempotent_and_returns_the_same_id(self):
        first = self.client.get(f"/api/verify/{PUBLISH_ID}").json()
        # A second click on the same link must not create a duplicate or error.
        second = self.client.get(f"/api/verify/{PUBLISH_ID}")
        self.assertEqual(200, second.status_code, second.text)
        self.assertEqual(first["id"], second.json()["id"])
        self.assertEqual(1, Paper.objects.count())

    def test_two_links_for_the_same_paper_make_two_records(self):
        """Two curators publishing the same paper (same title and DOI) each
        get their own record; the first one is left exactly as it was."""
        second_id = "PUBLISH_test_verify_second"
        second_path = os.path.join(os.path.dirname(_queue_path()),
                                   second_id + ".json")
        try:
            with open(second_path, 'w') as f:
                json.dump(_fixture(), f, ensure_ascii=False)
            first = self.client.get(f"/api/verify/{PUBLISH_ID}").json()
            second = self.client.get(f"/api/verify/{second_id}")
            self.assertEqual(200, second.status_code, second.text)
            self.assertTrue(second.json()["id"])
            self.assertNotEqual(first["id"], second.json()["id"])
            self.assertEqual(2, Paper.objects.count())
            self.assertIsNotNone(Paper.objects(id=first["id"]).first())
        finally:
            if os.path.exists(second_path):
                os.remove(second_path)

    def test_unknown_link_returns_a_clear_404(self):
        response = self.client.get("/api/verify/PUBLISH_does_not_exist")
        self.assertEqual(404, response.status_code)
        self.assertFalse(response.json()["id"])
        self.assertIn("invalid", response.json()["error"].lower())

    def test_malformed_queue_file_returns_an_error(self):
        """A corrupted publish queue file must not crash the endpoint."""
        bad_id = "PUBLISH_bad_json"
        bad_path = os.path.join(os.getcwd(), "papers", "publish", bad_id + ".json")
        os.makedirs(os.path.dirname(bad_path), exist_ok=True)
        try:
            with open(bad_path, "w") as f:
                f.write("not valid json {{{")
            response = self.client.get(f"/api/verify/{bad_id}")
            self.assertIn(response.status_code, (400, 500))
        finally:
            if os.path.exists(bad_path):
                os.remove(bad_path)

if __name__ == "__main__":
    unittest.main()
