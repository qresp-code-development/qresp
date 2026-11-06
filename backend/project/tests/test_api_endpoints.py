import json
import os
import tempfile
import unittest
import warnings
from unittest import mock

import mongoengine
import mongomock

# Importing project builds the Connexion 3 app; tests re-point mongoengine at
# an in-memory mongomock connection below (same pattern as test_paperDAO).
from project import connexionapp
from project.controllers.preview import Preview
from project.controllers.publish import Publish
from project.paperdao import Paper


def warn(*args, **kwargs):
    pass


warnings.warn = warn


class TestApiEndpoints(unittest.TestCase):
    """Smoke tests for /api/* through the full Connexion 3 ASGI middleware
    (routing + request validation + swagger-ui) -- the same path production
    traffic takes. Flask's test_client would bypass that middleware, so these
    tests guard the Connexion 2 -> 3 migration."""

    @classmethod
    def setUpClass(cls):
        cls.client = connexionapp.test_client()

    def setUp(self):
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        location = os.path.realpath(
            os.path.join(os.getcwd(), os.path.dirname(__file__)))
        with open(os.path.join(location, 'data.json')) as f:
            paperdata = json.load(f)
        Paper(**paperdata).save()

    def tearDown(self):
        Paper.drop_collection()
        mongoengine.disconnect_all()

    def test_search_returns_papers(self):
        response = self.client.get('/api/search')
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, len(response.json()))

    def test_search_filters_by_tag(self):
        response = self.client.get('/api/search', params={'tags': 'DFT'})
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, len(response.json()))

    def test_collections(self):
        response = self.client.get('/api/collections')
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, len(response.json()))

    def test_paper_details_serializes_embedded_documents(self):
        paperid = self.client.get('/api/search').json()[0]['_Search__id']
        response = self.client.get('/api/paper/' + paperid)
        self.assertEqual(200, response.status_code)
        details = response.json()
        self.assertEqual(paperid, details['id'])
        # charts/datasets/... are mongoengine EmbeddedDocuments; their JSON
        # conversion used to come from flask-mongoengine and now lives in
        # project/jsonutil.py. A regression here returns 500, not JSON dicts.
        self.assertIsInstance(details['charts'], list)
        self.assertTrue(all(isinstance(c, dict) for c in details['charts']))

    def test_workflow_details(self):
        paperid = self.client.get('/api/search').json()[0]['_Search__id']
        response = self.client.get('/api/workflow/' + paperid)
        self.assertEqual(200, response.status_code)
        self.assertIn('paperTitle', response.json())

    def test_dircont_invalid_body_is_rejected_by_validation(self):
        # Missing required properties -> Connexion's request-validation
        # middleware must reject the call before the handler runs.
        response = self.client.post('/api/dircont', json={'link': 'x'})
        self.assertEqual(400, response.status_code)

    def test_dircont_body_reaches_handler_as_named_parameter(self):
        # Swagger-2 body params arrive under their spec name (`req`). A
        # mapping regression raises TypeError inside Connexion instead of
        # producing this handler's own error message.
        response = self.client.post('/api/dircont', json={
            'link': 'not-a-real-url', 'src': 'http', 'service': False})
        self.assertEqual(500, response.status_code)
        self.assertIn('Exception in Directory Structure API', response.text)

    def test_healthz_reports_the_api_process(self):
        response = self.client.get('/api/healthz')
        self.assertEqual(200, response.status_code)
        self.assertEqual({'status': 'ok'}, response.json())

    def test_preview_and_publish_create_runtime_state_directories(self):
        # These directories intentionally contain no tracked files. A fresh
        # clone must still be able to create previews and pending publishes.
        with tempfile.TemporaryDirectory() as root, \
                mock.patch('project.controllers.preview.getcwd',
                           return_value=root), \
                mock.patch('project.controllers.publish.getcwd',
                           return_value=root):
            preview = Preview()
            publish = Publish()
            self.assertTrue(os.path.isdir(preview.dir_prefix))
            self.assertTrue(os.path.isdir(publish.dir_prefix))
            self.assertTrue(preview.generateId().startswith('PREVIEW_'))
            self.assertTrue(publish.generateId().startswith('PUBLISH_'))

    def test_swagger_ui_is_served(self):
        response = self.client.get('/api/ui/')
        self.assertEqual(200, response.status_code)


class TestRetiredFlaskShell(unittest.TestCase):
    """The public UI is the frontend now; old backend pages must not return."""

    @classmethod
    def setUpClass(cls):
        cls.client = connexionapp.test_client()

    def test_legacy_pages_and_callback_are_not_served(self):
        for path in ('/', '/qrespcurator', '/qrespexplorer', '/admin',
                     '/oauth2callback', '/sitemap.xml'):
            with self.subTest(path=path):
                self.assertEqual(404, self.client.get(path).status_code)


if __name__ == '__main__':
    unittest.main()
