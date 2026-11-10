from unittest import mock

from project import curation
from project.tests.test_curation import RCC, CurationTestBase

DOI = "10.1038/s41524-025-01558-w"
FOUND = RCC + "/10.1038.s41524-025-01558-w"


class TestDoiFolderNames(CurationTestBase):
    def test_slash_becomes_dot(self):
        self.assertEqual(
            (DOI, ["10.1038.s41524-025-01558-w"]),
            curation.doi_folder_names(DOI))

    def test_resolver_urls_and_labels_are_accepted(self):
        for raw in ("https://doi.org/" + DOI, "doi: " + DOI, DOI + "."):
            self.assertEqual(DOI, curation.doi_folder_names(raw)[0], raw)

    def test_mixed_case_also_tries_lower_case(self):
        _doi, names = curation.doi_folder_names("10.1103/PhysRevB.1.2")
        self.assertEqual(["10.1103.PhysRevB.1.2", "10.1103.physrevb.1.2"], names)

    def test_rejects_non_dois_and_unsafe_names(self):
        for raw in ("", "not a doi", "10.1/x", "10.1234/../../etc",
                    "10.1234/a b", "10.1234/a?b=c"):
            self.assertEqual([], curation.doi_folder_names(raw)[1], raw)


class TestLocateFolder(CurationTestBase):
    def locate(self, doi=DOI, csrf=True, lister=None):
        headers = {"X-CSRF-Token": self.csrf} if csrf and getattr(self, "csrf", None) else {}
        with mock.patch("project.curation._list_directory",
                        side_effect=lister or (lambda url: (["Data"], ["README.md"]))) as listed:
            response = self.client.post(
                "/api/curation/locate-folder", json={"doi": doi}, headers=headers)
        return response, listed

    def test_requires_sign_in(self):
        response, listed = self.locate(csrf=False)
        self.assertEqual(401, response.status_code)
        listed.assert_not_called()

    def test_requires_csrf(self):
        self.login()
        response, listed = self.locate(csrf=False)
        self.assertEqual(403, response.status_code)
        listed.assert_not_called()

    def test_finds_the_doi_named_folder_under_the_allowed_root(self):
        self.login()
        response, listed = self.locate()
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertTrue(body["found"])
        self.assertEqual(FOUND, body["path"])
        self.assertEqual(["Data"], body["folders"])
        listed.assert_called_once_with(FOUND)

    def test_reports_not_found_without_guessing(self):
        self.login()

        def missing(url):
            raise RuntimeError("404")

        response, _listed = self.locate(lister=missing)
        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertFalse(body["found"])
        self.assertEqual([FOUND], body["tried"])

    def test_only_configured_roots_are_tried(self):
        self.login()
        response, listed = self.locate()
        for call in listed.call_args_list:
            self.assertTrue(call.args[0].startswith(RCC + "/"))

    def test_invalid_doi_is_a_400_without_any_request(self):
        self.login()
        response, listed = self.locate(doi="../../etc/passwd")
        self.assertEqual(400, response.status_code)
        listed.assert_not_called()


class TestAnalyzeSuggestions(CurationTestBase):
    def test_analysis_carries_figure_number_suggestions(self):
        self.login()
        response, _lister, _fetch = self.analyze()
        self.assertEqual(200, response.status_code)
        body = response.json()
        images = {c["id"]: c["proposal"]["imageFile"]
                  for c in body["candidates"]["charts"]}
        numbers = body["suggestions"]["numbers"]
        self.assertEqual(
            {"1", "2"},
            {numbers[cid] for cid, image in images.items()
             if image.endswith(("figure1.png", "figure2.png"))})
        self.assertIsInstance(body["suggestions"]["links"], list)

    def test_pdf_figures_are_chart_candidates(self):
        from project.tests.test_curation import FIXTURE, FOLDER
        tree = dict(FIXTURE)
        tree["figures"] = ([], ["figure1.png", "Figure3.pdf"])

        def lister(url):
            return tree[url[len(FOLDER):].strip("/")]

        self.login()
        response, _lister, _fetch = self.analyze(walk=lister)
        self.assertEqual(200, response.status_code)
        images = [c["proposal"]["imageFile"]
                  for c in response.json()["candidates"]["charts"]]
        self.assertTrue(any(image.endswith("Figure3.pdf") for image in images),
                        images)


class TestUnreadableRoot(CurationTestBase):
    def post(self, side_effect):
        from project.tests.test_curation import FOLDER
        with mock.patch("project.curation._list_directory", side_effect=side_effect):
            return self.client.post(
                "/api/curation/analyze-folder", json={"path": FOLDER},
                headers={"X-CSRF-Token": self.csrf})

    def test_a_certificate_failure_is_reported_as_one(self):
        import requests
        self.login()
        response = self.post(requests.exceptions.SSLError("certificate verify failed"))
        self.assertEqual(502, response.status_code)
        self.assertIn("certificate", response.json()["error"])
        self.assertNotIn("verify failed", response.json()["error"])

    def test_an_unreachable_root_is_not_called_empty(self):
        self.login()
        response = self.post(RuntimeError("connection refused"))
        self.assertEqual(502, response.status_code)
        self.assertNotIn("No files were found", response.json()["error"])
