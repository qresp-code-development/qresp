"""The SERIALIZED analyze-folder response for a multi-image chart folder.

Testing `pick_chart_image()` in isolation was not enough, and it hid a real
break: the analysis was still calling `chart_images()` and publishing the
result under `options.imageFile` as bare strings, while the browser read
`candidate.image_options` and expected `{path, reason}` objects. Both sides
had tests. Neither side tested the wire.

These tests go through the real handler and assert the exact shape the
frontend fixtures are built from.
"""
import os
import unittest
from unittest import mock

import mongoengine
import mongomock

from project import connexionapp

RCC = "https://notebook.rcc.uchicago.edu/files"
FOLDER = RCC + "/10.1021.acs.nanolett.7b00283"

# The staging folder, verbatim: two legitimate images and a notebook named
# after one of them.
FIXTURE = {
    "": (["charts"], ["README.md"]),
    "charts": (["figure_S1"], []),
    "charts/figure_S1": (
        [], ["diagram.png", "figure_S1.png", "figure_S1.ipynb"]),
}


def lister_for(fixture):
    def _list(url):
        relative = url[len(FOLDER):].strip("/")
        if relative not in fixture:
            raise AssertionError("unexpected listing request: %s" % url)
        return fixture[relative]
    return _list


class RouteTestBase(unittest.TestCase):

    def setUp(self):
        self.client = connexionapp.test_client()
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        mongoengine.disconnect_all()
        mongoengine.connect("qresp_image_options_test",
                            mongo_client_class=mongomock.MongoClient)
        self.client.post("/api/auth/dev-login",
                         json={"email": "curator@example.com"})
        self.csrf = self.client.get("/api/auth/me").json()["csrf_token"]

    def tearDown(self):
        os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)
        mongoengine.disconnect_all()

    def analyze(self, fixture=None, path=FOLDER):
        with mock.patch("project.curation._list_directory",
                        side_effect=lister_for(fixture or FIXTURE)), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            return self.client.post(
                "/api/curation/analyze-folder", json={"path": path},
                headers={"X-CSRF-Token": self.csrf})

    def chart(self, fixture=None):
        response = self.analyze(fixture)
        self.assertEqual(200, response.status_code, response.text)
        charts = response.json()["candidates"]["charts"]
        self.assertEqual(1, len(charts), charts)
        return charts[0]


class TestSerializedImageOptions(RouteTestBase):

    def test_the_response_carries_image_options_not_options(self):
        candidate = self.chart()
        self.assertIn("image_options", candidate)
        # The old generic key is gone: the field renderer used to pick it up
        # and draw a SECOND image control beside the role UI.
        self.assertNotIn("options", candidate)

    def test_every_image_is_listed_as_path_and_reason(self):
        candidate = self.chart()
        self.assertEqual(candidate["image_options"], [
            {"path": "charts/figure_S1/diagram.png",
             "reason": "image found in this chart folder"},
            {"path": "charts/figure_S1/figure_S1.png",
             "reason": "filename matches the chart folder"},
        ])

    def test_the_suggested_primary_is_the_folder_named_image(self):
        candidate = self.chart()
        self.assertEqual(candidate["proposal"]["imageFile"],
                         "charts/figure_S1/figure_S1.png")

    def test_the_notebook_is_proposed_independently(self):
        candidate = self.chart()
        self.assertEqual(candidate["proposal"]["notebookFile"],
                         "charts/figure_S1/figure_S1.ipynb")

    def test_notebook_options_carry_every_notebook(self):
        fixture = dict(FIXTURE)
        fixture["charts/figure_S1"] = (
            [], ["diagram.png", "diagram.ipynb", "figure_S1.png",
                 "figure_S1.ipynb"])
        candidate = self.chart(fixture)
        self.assertEqual(candidate["notebook_options"], [
            "charts/figure_S1/diagram.ipynb",
            "charts/figure_S1/figure_S1.ipynb",
        ])

    def test_a_single_image_folder_lists_one_option(self):
        fixture = dict(FIXTURE)
        fixture["charts/figure_S1"] = ([], ["figure_S1.png"])
        candidate = self.chart(fixture)
        self.assertEqual([o["path"] for o in candidate["image_options"]],
                         ["charts/figure_S1/figure_S1.png"])
        self.assertEqual(candidate["proposal"]["imageFile"],
                         "charts/figure_S1/figure_S1.png")

    def test_an_ambiguous_folder_lists_all_and_suggests_none(self):
        fixture = dict(FIXTURE)
        fixture["charts/figure_S1"] = ([], ["alpha.png", "beta.png"])
        candidate = self.chart(fixture)
        self.assertEqual([o["path"] for o in candidate["image_options"]],
                         ["charts/figure_S1/alpha.png",
                          "charts/figure_S1/beta.png"])
        self.assertEqual(candidate["proposal"]["imageFile"], "")

    def test_no_image_path_is_ever_silently_discarded(self):
        fixture = dict(FIXTURE)
        fixture["charts/figure_S1"] = (
            [], ["a.png", "b.png", "c.png", "figure_S1.png"])
        candidate = self.chart(fixture)
        self.assertEqual(len(candidate["image_options"]), 4)

    def test_folder_basename_matching_is_generic_over_the_wire(self):
        # No hardcoded figure/table/DOI pattern: the folder name drives it.
        fixture = {
            "": (["charts"], []),
            "charts": (["Ω_scan"], []),
            "charts/Ω_scan": ([], ["Ω_scan.png", "extra.png"]),
        }
        response = self.analyze(fixture)
        candidate = response.json()["candidates"]["charts"][0]
        self.assertEqual(candidate["proposal"]["imageFile"],
                         "charts/Ω_scan/Ω_scan.png")


class TestNotebookPairing(unittest.TestCase):
    """An image promoted to its own chart takes only its own notebook."""

    def pair(self, image, names):
        from project import folderstandard as fs
        folder = "charts/fig"
        files = ["%s/%s" % (folder, name) for name in names]
        return fs.notebook_for_image("%s/%s" % (folder, image),
                                     fs.chart_notebooks(folder, files))

    def test_each_image_takes_the_notebook_that_matches_it(self):
        names = ["a.png", "a.ipynb", "b.png", "b.ipynb"]
        self.assertEqual(self.pair("a.png", names), "charts/fig/a.ipynb")
        self.assertEqual(self.pair("b.png", names), "charts/fig/b.ipynb")

    def test_an_image_with_no_matching_notebook_takes_none(self):
        # Even though a notebook is right there -- it belongs to the other
        # image, and adopting it would put the same notebook on two charts.
        self.assertEqual(
            self.pair("b.png", ["a.png", "a.ipynb", "b.png"]), "")

    def test_a_case_difference_still_pairs(self):
        self.assertEqual(
            self.pair("Fig1.png", ["Fig1.png", "fig1.ipynb"]),
            "charts/fig/fig1.ipynb")

    def test_two_notebooks_with_the_same_stem_pair_with_neither(self):
        # Impossible on one file system, but the guard costs nothing and the
        # alternative is picking one at random.
        from project import folderstandard as fs
        self.assertEqual(
            fs.notebook_for_image("charts/fig/a.png",
                                  ["charts/fig/a.ipynb", "charts/x/a.ipynb"]),
            "")


if __name__ == "__main__":
    unittest.main()
