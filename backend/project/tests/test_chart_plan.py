import unittest
from unittest import mock

# Chart records are decided from the IMAGE FILES, not only from folders.
#
# A Dataset or a Script boundary is a folder; a Chart is not, because a Chart
# stores exactly one image. So the analysis reports every image it found,
# grouped by the folder it really sits in, and the curator sends back a plan
# saying what each image is: its own Chart, a supporting file of another
# Chart in the same folder, or ignored.
#
# These tests drive the REAL endpoint with the file server mocked — no request
# leaves the process — and pin: the discovered groups, the candidates a plan
# produces, the conservative notebook rule, and the fact that every malformed
# plan is refused with a 400 before any provider or quota is touched.
from project import curation
from project import folderstandard
from project.tests.test_curation import CurationTestBase, FOLDER

# figures_tables/ is a known legacy alias for charts/. The figure folder holds
# the figure itself, a second image that is NOT the figure, and a notebook
# named after the figure.
TREE = {
    "": (["data", "figures_tables", "scripts"], ["README.md"]),
    "data": (["run_A"], []),
    "data/run_A": ([], ["a.csv", "b.csv"]),
    "figures_tables": (["figure_S1"], []),
    "figures_tables/figure_S1": (
        [], ["diagram.png", "figure_S1.png", "figure_S1.ipynb"]),
    "scripts": ([], ["run.py"]),
}

FIGURE = "figures_tables/figure_S1/figure_S1.png"
DIAGRAM = "figures_tables/figure_S1/diagram.png"
NOTEBOOK = "figures_tables/figure_S1/figure_S1.ipynb"


def lister(url):
    relative = url[len(FOLDER):].strip("/")
    if relative not in TREE:
        raise AssertionError("unexpected listing request: %s" % url)
    return TREE[relative]


class ChartPlanTestBase(CurationTestBase):
    def request(self, body=None, tree_lister=lister):
        self.login()
        payload = {"path": FOLDER}
        payload.update(body or {})
        # The AI provider and the daily quota are patched so a malformed plan
        # can be shown to cost NOTHING, not merely to fail afterwards.
        with mock.patch("project.curation._list_directory",
                        side_effect=tree_lister), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)), \
                mock.patch("project.curation.call_gemini") as gemini, \
                mock.patch("project.curation._consume_daily_quota") as quota:
            response = self.client.post(
                "/api/curation/analyze-folder", json=payload,
                headers={"X-CSRF-Token": self.csrf})
        self.gemini, self.quota = gemini, quota
        return response

    def charts(self, response):
        return response.json()["candidates"]["charts"]

    def plan(self, *entries):
        return self.request({"chart_plan": list(entries)})


class TestDiscoveredChartImages(ChartPlanTestBase):
    """Every image is reported, grouped by its REAL folder."""

    def groups(self):
        response = self.request()
        self.assertEqual(200, response.status_code)
        return response.json()["chart_image_groups"]

    def test_the_group_is_the_folder_the_images_actually_sit_in(self):
        groups = self.groups()
        self.assertEqual(1, len(groups))
        self.assertEqual("figures_tables/figure_S1", groups[0]["folder"])
        self.assertEqual("figures_tables", groups[0]["role_root"])

    def test_every_image_is_listed_with_its_exact_path(self):
        images = self.groups()[0]["images"]
        self.assertEqual([DIAGRAM, FIGURE],
                         [image["path"] for image in images])

    def test_only_the_folder_named_image_is_suggested_as_a_chart(self):
        actions = {image["path"]: image["suggested_action"]
                   for image in self.groups()[0]["images"]}
        self.assertEqual({DIAGRAM: "review", FIGURE: "chart"}, actions)

    def test_each_image_says_why_it_is_listed(self):
        reasons = {image["path"]: image["reason"]
                   for image in self.groups()[0]["images"]}
        self.assertIn("matches the chart folder", reasons[FIGURE])
        self.assertTrue(reasons[DIAGRAM])

    def test_the_notebook_is_reported_as_an_attachment_not_an_image(self):
        group = self.groups()[0]
        self.assertEqual([{"path": NOTEBOOK}], group["notebooks"])
        self.assertNotIn(NOTEBOOK,
                         [image["path"] for image in group["images"]])

    def test_the_groups_travel_at_the_top_level_of_the_envelope(self):
        body = self.request().json()
        # The browser must not have to reconstruct this from candidate
        # internals, so it is part of the STRUCTURE contract.
        self.assertIn("chart_image_groups", body)
        self.assertEqual(body["chart_image_groups"],
                         body["candidates"]["chart_image_groups"])
        self.assertEqual([], body["applied_chart_plan"])


class TestPlanBuildsCandidates(ChartPlanTestBase):
    def test_two_chart_actions_produce_two_independent_candidates(self):
        response = self.plan({"path": FIGURE, "action": "chart"},
                             {"path": DIAGRAM, "action": "chart"})
        self.assertEqual(200, response.status_code)
        charts = self.charts(response)
        self.assertEqual(2, len(charts))
        self.assertEqual([DIAGRAM, FIGURE],
                         sorted(c["proposal"]["imageFile"] for c in charts))
        # One image each: a Chart never grows a second image field.
        for chart in charts:
            self.assertNotIn("imageFiles", chart["proposal"])
            self.assertNotIn(chart["proposal"]["imageFile"],
                             chart["proposal"]["files"])

    def test_only_the_matching_image_receives_the_notebook(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "chart"},
                      {"path": DIAGRAM, "action": "chart"}))
        notebooks = {c["proposal"]["imageFile"]: c["proposal"]["notebookFile"]
                     for c in charts}
        self.assertEqual(NOTEBOOK, notebooks[FIGURE])
        self.assertEqual("", notebooks[DIAGRAM])

    def test_a_supporting_image_joins_its_target_chart_files(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "chart"},
                      {"path": DIAGRAM, "action": "supporting",
                       "target": FIGURE}))
        self.assertEqual(1, len(charts))
        proposal = charts[0]["proposal"]
        self.assertEqual(FIGURE, proposal["imageFile"])
        self.assertEqual([DIAGRAM], proposal["files"])
        self.assertEqual(NOTEBOOK, proposal["notebookFile"])

    def test_a_supporting_image_is_never_also_a_chart(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "chart"},
                      {"path": DIAGRAM, "action": "supporting",
                       "target": FIGURE}))
        images = [c["proposal"]["imageFile"] for c in charts]
        self.assertNotIn(DIAGRAM, images)

    def test_ignore_creates_nothing_and_attaches_nothing(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "chart"},
                      {"path": DIAGRAM, "action": "ignore"}))
        self.assertEqual(1, len(charts))
        self.assertEqual(FIGURE, charts[0]["proposal"]["imageFile"])
        self.assertEqual([], charts[0]["proposal"]["files"])

    def test_ignoring_everything_proposes_no_chart_at_all(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "ignore"},
                      {"path": DIAGRAM, "action": "ignore"}))
        self.assertEqual([], charts)

    def test_number_caption_and_keywords_are_never_invented(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "chart"},
                      {"path": DIAGRAM, "action": "chart"}))
        for chart in charts:
            self.assertEqual("", chart["proposal"]["number"])
            self.assertEqual("", chart["proposal"]["caption"])
            self.assertEqual([], chart["proposal"]["properties"])
            # ...and they are named as the fields still needing a human.
            self.assertEqual(["caption", "number", "properties"],
                             sorted(chart["needs_input"]))

    def test_no_path_appears_in_two_chart_records(self):
        charts = self.charts(
            self.plan({"path": FIGURE, "action": "chart"},
                      {"path": DIAGRAM, "action": "chart"}))
        used = []
        for chart in charts:
            used.append(chart["proposal"]["imageFile"])
            used.extend(chart["proposal"]["files"])
        self.assertEqual(sorted(set(used)), sorted(used))

    def test_candidate_ids_are_deterministic_for_the_same_plan(self):
        entries = [{"path": FIGURE, "action": "chart"},
                   {"path": DIAGRAM, "action": "chart"}]
        first = self.charts(self.request({"chart_plan": entries}))
        # Submitted in the other order: the same ids, on the same images.
        second = self.charts(
            self.request({"chart_plan": list(reversed(entries))}))
        self.assertEqual(
            {c["id"]: c["proposal"]["imageFile"] for c in first},
            {c["id"]: c["proposal"]["imageFile"] for c in second})

    def test_the_applied_plan_is_echoed_back_normalized(self):
        body = self.plan({"path": FIGURE, "action": "chart"},
                         {"path": DIAGRAM, "action": "supporting",
                          "target": FIGURE}).json()
        self.assertEqual(
            [{"path": DIAGRAM, "action": "supporting", "target": FIGURE},
             {"path": FIGURE, "action": "chart", "target": ""}],
            body["applied_chart_plan"])

    def test_a_plan_changes_nothing_else_about_the_folder(self):
        body = self.plan({"path": FIGURE, "action": "chart"}).json()
        candidates = body["candidates"]
        self.assertEqual("legacy", body["structure_mode"])
        self.assertEqual(["data/run_A"],
                         [f for c in candidates["datasets"]
                          for f in c["proposal"]["files"]])
        self.assertEqual(["scripts/run.py"],
                         [f for c in candidates["scripts"]
                          for f in c["proposal"]["files"]])


class TestNoPlanIsUnchanged(ChartPlanTestBase):
    """Backward compatibility: without a plan, nothing about the old
    behaviour moves."""

    def test_the_folder_still_proposes_one_chart_with_the_named_image(self):
        charts = self.charts(self.request())
        self.assertEqual(1, len(charts))
        self.assertEqual(FIGURE, charts[0]["proposal"]["imageFile"])
        self.assertEqual(NOTEBOOK, charts[0]["proposal"]["notebookFile"])

    def test_an_absent_plan_is_not_an_empty_plan(self):
        # An explicit empty list is still "no plan": the defaults stand.
        charts = self.charts(self.request({"chart_plan": []}))
        self.assertEqual(1, len(charts))
        self.assertEqual(FIGURE, charts[0]["proposal"]["imageFile"])

    def test_a_plan_for_one_folder_leaves_another_folder_alone(self):
        tree = dict(TREE)
        tree["figures_tables"] = (["figure_S1", "figure_S2"], [])
        tree["figures_tables/figure_S2"] = ([], ["figure_S2.png"])

        def two_figures(url):
            relative = url[len(FOLDER):].strip("/")
            return tree[relative]

        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=two_figures), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER,
                      "chart_plan": [{"path": DIAGRAM, "action": "chart"}]},
                headers={"X-CSRF-Token": self.csrf})
        images = sorted(c["proposal"]["imageFile"]
                        for c in self.charts(response))
        # figure_S2 was never mentioned, so it keeps its deterministic
        # default instead of disappearing.
        self.assertEqual(
            [DIAGRAM, "figures_tables/figure_S2/figure_S2.png"], images)


class TestPlanRejection(ChartPlanTestBase):
    """Every malformed plan is refused with a clear 400, and costs nothing."""

    def assert_refused(self, plan, fragment):
        response = self.request({"chart_plan": plan})
        self.assertEqual(400, response.status_code, plan)
        self.assertIn(fragment, response.json()["error"])
        # No provider call and no quota unit was spent on a bad request.
        self.gemini.assert_not_called()
        self.quota.assert_not_called()
        return response.json()["error"]

    def test_a_path_that_is_not_an_image_here(self):
        self.assert_refused(
            [{"path": "figures_tables/figure_S1/nope.png", "action": "chart"}],
            "not an image found in this folder")

    def test_a_notebook_is_not_a_chart_image(self):
        self.assert_refused([{"path": NOTEBOOK, "action": "chart"}],
                            "not an image found in this folder")

    def test_a_dataset_file_is_not_a_chart_image(self):
        self.assert_refused([{"path": "data/run_A/a.csv", "action": "chart"}],
                            "not an image found in this folder")

    def test_urls_absolute_paths_traversal_and_backslashes(self):
        for bad in ("https://evil.example.com/x.png",
                    "/etc/passwd.png",
                    "../outside/x.png",
                    "figures_tables/../../etc/x.png",
                    "figures_tables\\figure_S1\\figure_S1.png",
                    "figures_tables/%2e%2e/x.png"):
            self.assert_refused([{"path": bad, "action": "chart"}],
                                "is not a relative image")

    def test_a_non_normalized_path(self):
        self.assert_refused(
            [{"path": "figures_tables/./figure_S1/figure_S1.png",
              "action": "chart"}], "not a normalized path")

    def test_an_unknown_action(self):
        self.assert_refused([{"path": FIGURE, "action": "primary"}],
                            "is not a chart role")
        self.assert_refused([{"path": FIGURE, "action": ""}],
                            "is not a chart role")
        self.assert_refused([{"path": FIGURE}], "is not a chart role")

    def test_a_duplicate_image_path(self):
        self.assert_refused([{"path": FIGURE, "action": "chart"},
                             {"path": FIGURE, "action": "ignore"}],
                            "more than one role")

    def test_a_supporting_file_with_no_target(self):
        self.assert_refused([{"path": FIGURE, "action": "chart"},
                             {"path": DIAGRAM, "action": "supporting"}],
                            "no Chart to attach it to")

    def test_a_supporting_target_that_is_not_a_chart(self):
        self.assert_refused([{"path": FIGURE, "action": "ignore"},
                             {"path": DIAGRAM, "action": "supporting",
                              "target": FIGURE}],
                            "must attach to an image whose role is Chart")

    def test_a_supporting_target_that_was_never_submitted(self):
        self.assert_refused([{"path": DIAGRAM, "action": "supporting",
                              "target": FIGURE}],
                            "must attach to an image whose role is Chart")

    def test_a_supporting_target_outside_this_folder(self):
        tree = dict(TREE)
        tree["figures_tables"] = (["figure_S1", "figure_S2"], [])
        tree["figures_tables/figure_S2"] = ([], ["figure_S2.png"])
        other = "figures_tables/figure_S2/figure_S2.png"
        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=lambda url: tree[
                            url[len(FOLDER):].strip("/")]), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER, "chart_plan": [
                    {"path": other, "action": "chart"},
                    {"path": DIAGRAM, "action": "supporting",
                     "target": other}]},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(400, response.status_code)
        self.assertIn("not in the same chart folder", response.json()["error"])

    def test_an_image_cannot_support_itself(self):
        self.assert_refused([{"path": FIGURE, "action": "supporting",
                              "target": FIGURE}],
                            "must attach to an image whose role is Chart")

    def test_a_target_on_a_chart_or_ignored_image(self):
        self.assert_refused([{"path": FIGURE, "action": "chart",
                              "target": DIAGRAM}],
                            "Only a supporting file may name a target")

    def assert_refused_at_the_edge(self, plan):
        """A shape the OpenAPI schema itself refuses, before the handler.

        The rejection is still a 400 that costs nothing; only the sentence
        comes from the framework rather than from validate_chart_plan, which
        is asserted directly below for the same input.
        """
        response = self.request({"chart_plan": plan})
        self.assertEqual(400, response.status_code, plan)
        self.gemini.assert_not_called()
        self.quota.assert_not_called()

    def test_a_plan_that_is_not_a_list(self):
        self.assert_refused_at_the_edge({"path": FIGURE})
        with self.assertRaises(folderstandard.ChartPlanError) as caught:
            folderstandard.validate_chart_plan({"path": FIGURE}, [])
        self.assertIn("must be a list of images", str(caught.exception))

    def test_an_entry_that_is_not_an_object(self):
        self.assert_refused_at_the_edge([FIGURE])
        with self.assertRaises(folderstandard.ChartPlanError) as caught:
            folderstandard.validate_chart_plan([FIGURE], [])
        self.assertIn("must be an object", str(caught.exception))

    def test_an_empty_path(self):
        self.assert_refused([{"path": "  ", "action": "chart"}],
                            "empty chart image path")

    def test_a_plan_larger_than_the_folder_can_be(self):
        plan = [{"path": FIGURE, "action": "ignore"}] * (
            folderstandard.MAX_CHART_PLAN + 1)
        self.assert_refused(plan, "larger than this folder can be")


class TestPlanAgainstStructureModes(ChartPlanTestBase):
    def test_a_standard_layout_takes_a_plan_too(self):
        tree = {
            "": (["charts", "datasets"], []),
            "charts": (["fig1"], []),
            "charts/fig1": ([], ["fig1.png", "extra.png"]),
            "datasets": (["d1"], []),
            "datasets/d1": ([], ["x.csv"]),
        }
        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=lambda url: tree[
                            url[len(FOLDER):].strip("/")]), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER, "chart_plan": [
                    {"path": "charts/fig1/fig1.png", "action": "chart"},
                    {"path": "charts/fig1/extra.png", "action": "chart"}]},
                headers={"X-CSRF-Token": self.csrf})
        body = response.json()
        self.assertEqual("standard", body["structure_mode"])
        self.assertEqual(2, len(body["candidates"]["charts"]))

    def test_a_folder_that_needs_reorganizing_refuses_a_plan(self):
        tree = {"": (["mystery"], []), "mystery": ([], ["a.png"])}
        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=lambda url: tree[
                            url[len(FOLDER):].strip("/")]), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER,
                      "chart_plan": [{"path": "mystery/a.png",
                                      "action": "chart"}]},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(400, response.status_code)
        self.assertIn("needs reorganizing", response.json()["error"])

    def test_an_invalid_layout_still_reports_no_chart_images(self):
        tree = {"": (["mystery"], []), "mystery": ([], ["a.png"])}
        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=lambda url: tree[
                            url[len(FOLDER):].strip("/")]), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder", json={"path": FOLDER},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual([], response.json()["chart_image_groups"])

    def test_a_boundary_and_a_plan_travel_together(self):
        response = self.request({
            "boundaries": {"data": ["data"]},
            "chart_plan": [{"path": FIGURE, "action": "chart"},
                           {"path": DIAGRAM, "action": "supporting",
                            "target": FIGURE}],
        })
        body = response.json()
        self.assertEqual(200, response.status_code)
        self.assertEqual({"data": ["data"]}, body["applied_boundaries"])
        self.assertEqual(["data"],
                         [f for c in body["candidates"]["datasets"]
                          for f in c["proposal"]["files"]])
        charts = body["candidates"]["charts"]
        self.assertEqual(1, len(charts))
        self.assertEqual([DIAGRAM], charts[0]["proposal"]["files"])


class TestSharedInputFiles(unittest.TestCase):
    """Data files in a chart folder follow the ONE chart built from it, and
    are never claimed by two."""

    FILES = ["charts/f1/f1.png", "charts/f1/other.png",
             "charts/f1/data/values.csv"]
    DIRS = ["charts", "charts/f1", "charts/f1/data"]

    def charts(self, plan):
        result = curation.analyze_folder_tree(
            self.FILES, self.DIRS, {}, chart_plan=plan)
        return result["charts"]

    def test_one_chart_keeps_the_folder_data(self):
        charts = self.charts([{"path": "charts/f1/f1.png", "action": "chart"},
                              {"path": "charts/f1/other.png",
                               "action": "ignore"}])
        self.assertEqual(1, len(charts))
        self.assertEqual(["charts/f1/data"], charts[0]["proposal"]["files"])

    def test_two_charts_never_share_the_same_data_path(self):
        charts = self.charts([{"path": "charts/f1/f1.png", "action": "chart"},
                              {"path": "charts/f1/other.png",
                               "action": "chart"}])
        self.assertEqual(2, len(charts))
        for chart in charts:
            self.assertEqual([], chart["proposal"]["files"])
        # ...and the curator is told why, rather than left to notice.
        self.assertTrue(any("shared input files" in line
                            for line in charts[0]["evidence"]))


if __name__ == "__main__":
    unittest.main()
