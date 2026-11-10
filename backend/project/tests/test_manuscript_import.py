import base64
import contextlib
import io
import json
import os
import unittest
import zipfile
from unittest import mock

# Auto-Curation Lite phase 1: DOI lookup + manuscript-source import, through
# the real ASGI middleware. ALL network (Crossref) is mocked — no external
# calls. TeX is only ever parsed as text; nothing is compiled or extracted to
# the filesystem, and these tests also assert that raw manuscript content
# never leaks into responses or stdout.
from project import connexionapp
from project import manuscript

CROSSREF_MESSAGE = {
    "type": "journal-article",
    "title": ["Registry Title"],
    "author": [
        {"given": "Ada B.", "family": "Lovelace"},
        {"given": "Charles", "family": "Babbage"},
    ],
    "container-title": ["Journal of Computing"],
    "issued": {"date-parts": [[2021, 5]]},
    "volume": "12",
    "issue": "3",
    "page": "100-110",
    "abstract": "<jats:p>Registry abstract.</jats:p>",
    "DOI": "10.1234/qresp.demo",
    "URL": "https://doi.org/10.1234/qresp.demo",
    "subject": ["Materials Science", "Computing"],
}


TEX_NO_DOI = r"""
\documentclass{article}
\title{Unpublished Manuscript}
\author{Solo Author}
\begin{document}
\begin{abstract}Draft abstract.\end{abstract}
\end{document}
"""


def b64(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.b64encode(data).decode("ascii")


def make_zip(members, infos=None):
    buffer = io.BytesIO()
    # Deflate like real Overleaf exports — the zip-bomb test relies on 51 MB
    # of zeros compressing far below the raw upload cap.
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in (members or {}).items():
            archive.writestr(name, content)
        for info, content in (infos or []):
            archive.writestr(info, content)
    return buffer.getvalue()


class MockResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class ImportTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"

    def tearDown(self):
        os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)

    def login(self):
        response = self.client.post(
            "/api/auth/dev-login", json={"email": "curator@example.com"})
        assert response.status_code == 200, response.text
        self.csrf = self.client.get("/api/auth/me").json()["csrf_token"]

    def post(self, path, payload, csrf=True):
        headers = {}
        if csrf and getattr(self, "csrf", None):
            headers["X-CSRF-Token"] = self.csrf
        return self.client.post(path, json=payload, headers=headers)

    def import_source(self, filename, data, crossref=None, csrf=True):
        with mock.patch("project.manuscript.requests") as requests_mock:
            if crossref is not None:
                requests_mock.get.return_value = MockResponse(
                    {"message": crossref})
            else:
                requests_mock.get.side_effect = AssertionError(
                    "unexpected network call")
            response = self.post(
                "/api/import/manuscript",
                {"filename": filename, "content_base64": b64(data)},
                csrf=csrf)
        return response, requests_mock


class TestImportAuth(ImportTestBase):
    def test_anonymous_rejected(self):
        response = self.post("/api/import/doi", {"doi": "10.1/x"}, csrf=False)
        self.assertEqual(401, response.status_code)

    def test_missing_csrf_rejected(self):
        self.login()
        response = self.post("/api/import/doi", {"doi": "10.1234/x"},
                             csrf=False)
        self.assertEqual(403, response.status_code)

    def test_the_manuscript_upload_route_is_gone(self):
        # Uploading a .pdf/.tex/.zip is no longer a product feature, so the
        # route must not merely be unused -- it must not exist.
        self.login()
        response = self.post(
            "/api/import/manuscript",
            {"filename": "a.tex", "content_base64": b64("x")})
        self.assertEqual(404, response.status_code)


class TestDoiLookup(ImportTestBase):
    def lookup(self, doi, response=None, side_effect=None):
        self.login()
        with mock.patch("project.manuscript.requests") as requests_mock:
            if side_effect is not None:
                requests_mock.get.side_effect = side_effect
            else:
                requests_mock.get.return_value = response
            result = self.post("/api/import/doi", {"doi": doi})
        return result

    def test_valid_doi_returns_full_proposal(self):
        response = self.lookup("10.1234/qresp.demo",
                               MockResponse({"message": CROSSREF_MESSAGE}))
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        proposal = body["proposal"]
        self.assertEqual("Registry Title", proposal["title"])
        self.assertEqual(
            [{"firstName": "Ada", "middleName": "B.",
              "lastName": "Lovelace"},
             {"firstName": "Charles", "middleName": "", "lastName": "Babbage"}],
            proposal["authors"])
        self.assertEqual("Journal of Computing", proposal["journal"])
        self.assertEqual(2021, proposal["year"])
        self.assertEqual("12", proposal["volume"])
        self.assertEqual("3", proposal["issue"])
        self.assertEqual("100-110", proposal["pages"])
        self.assertEqual("Registry abstract.", proposal["abstract"])
        self.assertEqual("10.1234/qresp.demo", proposal["doi"])
        self.assertEqual(["Materials Science", "Computing"],
                         proposal["tags"])
        # Crossref work type maps to the curator's kind radio values.
        self.assertEqual("journal", proposal["kind"])
        self.assertEqual("crossref", body["provenance"]["title"])

    def test_doi_is_normalized_from_url_and_prefix_forms(self):
        for raw in ("https://doi.org/10.1234/QRESP.Demo",
                    "doi: 10.1234/qresp.demo", "  10.1234/qresp.demo  "):
            response = self.lookup(
                raw, MockResponse({"message": {"title": ["T"]}}))
            self.assertEqual(200, response.status_code, raw)
            self.assertEqual("10.1234/qresp.demo", response.json()["doi"])

    def test_invalid_doi_rejected_without_network(self):
        self.login()
        with mock.patch("project.manuscript.requests") as requests_mock:
            response = self.post("/api/import/doi",
                                 {"doi": "not-a-doi"})
        self.assertEqual(400, response.status_code)
        requests_mock.get.assert_not_called()

    def test_unknown_doi_reports_404(self):
        response = self.lookup("10.1234/missing",
                               MockResponse({}, status_code=404))
        self.assertEqual(404, response.status_code)
        self.assertIn("not found", response.json()["error"])

    def test_provider_timeout_reports_502_without_leaking(self):
        response = self.lookup("10.1234/slow",
                               side_effect=RuntimeError("boom internals"))
        self.assertEqual(502, response.status_code)
        self.assertNotIn("boom", response.text)

    def test_provider_error_body_is_not_leaked(self):
        response = self.lookup(
            "10.1234/error",
            MockResponse({"secret": "internal provider gibberish"},
                         status_code=500))
        self.assertEqual(502, response.status_code)
        self.assertNotIn("gibberish", response.text)

    def test_missing_optional_metadata_is_fine(self):
        response = self.lookup(
            "10.1234/minimal",
            MockResponse({"message": {"title": ["Only A Title"]}}))
        self.assertEqual(200, response.status_code)
        proposal = response.json()["proposal"]
        self.assertEqual("Only A Title", proposal["title"])
        self.assertNotIn("abstract", proposal)
        self.assertNotIn("authors", proposal)
