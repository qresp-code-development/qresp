import contextlib
import json
import os
import unittest
from unittest import mock

import mongoengine
import mongomock

# Deterministic RCC folder analysis, through the real ASGI middleware with the
# file server fully mocked — NO external request is ever made. These tests pin
# the security posture (auth/CSRF, root allowlist, traversal, TLS opt-in),
# the bounded crawl, and the conservative classification rules: charts only
# from images, tools only from pinned manifests, no experiment inference, and
# no directory contents in logs or storage.
from project import connexionapp
from project import curation
from project import folderstandard
from project.models import Paper

RCC = "https://notebook.rcc.uchicago.edu/files"
FOLDER = RCC + "/10.1021.acs.jpcc.5c01077"

# The reference fixture tree from the DOI folder.
FIXTURE = {
    "": (["data", "figures", "scripts"], ["README.md", "requirements.txt"]),
    "data": (["SE-RSH", "VDOS", "dipoles", "short_traj", "vlocal"], []),
    "data/SE-RSH": ([], ["se_rsh.dat"]),
    "data/VDOS": ([], ["vdos.dat"]),
    "data/dipoles": ([], ["dipoles.dat"]),
    "data/short_traj": ([], ["traj_1.xyz", "traj_2.xyz"]),
    "data/vlocal": ([], ["vlocal.cube"]),
    "figures": ([], ["figure1.png", "figure2.png"]),
    "scripts": ([], ["plot_vdos.py", "compute_dipoles.py"]),
}

TEXTS = {
    "requirements.txt": "numpy==1.26.4\nmatplotlib==3.8.0\nscipy>=1.10\n# note\n",
    "scripts/plot_vdos.py": '"""Plot the vibrational density of states."""\n'
                            "import numpy as np\nimport matplotlib.pyplot\n",
    "scripts/compute_dipoles.py": "import numpy as np\nprint(1)\n",
}


def fake_lister(url):
    relative = url[len(FOLDER):].strip("/")
    if relative not in FIXTURE:
        raise AssertionError("unexpected listing request: %s" % url)
    return FIXTURE[relative]


class CurationTestBase(unittest.TestCase):
    def setUp(self):
        self.client = connexionapp.test_client()
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)

    def tearDown(self):
        os.environ.pop("QRESP_ENABLE_DEV_LOGIN", None)
        os.environ.pop("QRESP_FILESERVER_ROOTS", None)
        os.environ.pop("QRESP_FILESERVER_INSECURE_TLS_HOSTS", None)
        mongoengine.disconnect_all()

    def login(self, email="curator@example.com"):
        response = self.client.post(
            "/api/auth/dev-login", json={"email": email})
        assert response.status_code == 200, response.text
        self.csrf = self.client.get("/api/auth/me").json()["csrf_token"]

    def analyze(self, path=FOLDER, csrf=True, walk=None, texts=None):
        headers = {}
        if csrf and getattr(self, "csrf", None):
            headers["X-CSRF-Token"] = self.csrf
        texts = TEXTS if texts is None else texts
        with mock.patch("project.curation._list_directory",
                        side_effect=fake_lister) as lister, \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: (
                               texts.get(url[len(FOLDER):].strip("/"), ""),
                               False)) as fetch:
            if walk is not None:
                lister.side_effect = walk
            response = self.client.post(
                "/api/curation/analyze-folder", json={"path": path},
                headers=headers)
        return response, lister, fetch


class TestAnalyzeFolderAccess(CurationTestBase):
    def test_anonymous_rejected_without_any_fetch(self):
        response, lister, _ = self.analyze(csrf=False)
        self.assertEqual(401, response.status_code)
        lister.assert_not_called()

    def test_missing_csrf_rejected_without_any_fetch(self):
        self.login()
        response, lister, _ = self.analyze(csrf=False)
        self.assertEqual(403, response.status_code)
        lister.assert_not_called()

    def test_allowed_folder_accepted(self):
        self.login()
        response, _, _ = self.analyze()
        self.assertEqual(200, response.status_code)
        self.assertEqual(FOLDER, response.json()["root"])


class TestAnalyzeFolderPathSafety(CurationTestBase):
    """Every rejection must happen BEFORE a request is made."""

    def assert_refused(self, path):
        self.login()
        response, lister, fetch = self.analyze(path=path)
        self.assertEqual(400, response.status_code, path)
        lister.assert_not_called()
        fetch.assert_not_called()
        return response.json()["error"]

    def test_arbitrary_host_rejected(self):
        message = self.assert_refused("https://evil.example.com/files/x")
        self.assertIn("outside the file server roots", message)

    def test_lookalike_host_prefix_rejected(self):
        self.assert_refused(
            "https://notebook.rcc.uchicago.edu.evil.com/files/x")

    def test_same_host_outside_root_rejected(self):
        self.assert_refused("https://notebook.rcc.uchicago.edu/etc/passwd")

    def test_root_prefix_without_separator_rejected(self):
        # ".../filesXYZ" must not satisfy a startswith check on ".../files".
        self.assert_refused("https://notebook.rcc.uchicago.edu/filesXYZ/a")

    def test_scheme_change_rejected(self):
        self.assert_refused("http://notebook.rcc.uchicago.edu/files/x")
        self.assert_refused("file:///etc/passwd")
        self.assert_refused("ftp://notebook.rcc.uchicago.edu/files/x")

    def test_credentials_in_url_rejected(self):
        message = self.assert_refused(
            "https://user:pw@notebook.rcc.uchicago.edu/files/x")
        self.assertIn("Credentials", message)

    def test_query_and_fragment_rejected(self):
        self.assert_refused(FOLDER + "?a=b")
        self.assert_refused(FOLDER + "#frag")

    def test_traversal_rejected(self):
        self.assert_refused(FOLDER + "/../../etc")
        self.assert_refused("../../etc/passwd")

    def test_encoded_traversal_rejected(self):
        self.assert_refused(FOLDER + "/%2e%2e/%2e%2e/etc")
        self.assert_refused(FOLDER + "/%2E%2E/secret")

    def test_backslash_and_nested_scheme_rejected(self):
        self.assert_refused(FOLDER + "/%5C%5Cserver%5Cshare")
        self.assert_refused(FOLDER + "/a/https%3A%2F%2Fevil.com")

    def test_empty_path_rejected(self):
        message = self.assert_refused("")
        self.assertIn("Select and save", message)

    def test_relative_path_resolves_inside_the_root(self):
        self.assertEqual(FOLDER, curation.resolve_folder_url(
            "10.1021.acs.jpcc.5c01077"))
        self.assertEqual(FOLDER, curation.resolve_folder_url(
            "/10.1021.acs.jpcc.5c01077/"))

    def test_root_allowlist_is_environment_only(self):
        os.environ["QRESP_FILESERVER_ROOTS"] = "https://other.example.org/pub"
        self.assertEqual("https://other.example.org/pub/a",
                         curation.resolve_folder_url(
                             "https://other.example.org/pub/a"))
        with self.assertRaises(curation.FolderError):
            curation.resolve_folder_url(FOLDER)


class TestTlsPosture(CurationTestBase):
    def test_tls_verification_is_on_by_default(self):
        self.assertTrue(curation._verify_for(FOLDER))

    def test_insecure_bypass_is_opt_in_and_host_restricted(self):
        os.environ["QRESP_FILESERVER_INSECURE_TLS_HOSTS"] = \
            "notebook.rcc.uchicago.edu"
        self.assertFalse(curation._verify_for(FOLDER))
        # Only the named host: every other host still verifies.
        self.assertTrue(curation._verify_for("https://other.example.org/pub"))

    def test_the_scope_is_a_no_op_for_a_verified_host(self):
        # No exception configured -> no notice, and urllib3's own warning is
        # left exactly as it is.
        with mock.patch("builtins.print") as printed:
            with curation.tls_exception_scope(FOLDER):
                pass
        printed.assert_not_called()

    def test_the_configured_exception_warns_once_and_quiets_urllib3(self):
        os.environ["QRESP_FILESERVER_INSECURE_TLS_HOSTS"] = \
            "notebook.rcc.uchicago.edu"
        from urllib3.exceptions import InsecureRequestWarning
        import warnings as warnings_module
        with mock.patch("builtins.print") as printed:
            with curation.tls_exception_scope(FOLDER):
                # Exactly one class is silenced, and only that one. Asserting
                # on the filter list keeps this independent of whatever
                # warning state other tests happen to leave behind.
                inside = [f for f in warnings_module.filters
                          if f[0] == "ignore" and f[2] is InsecureRequestWarning]
                self.assertEqual(1, len(inside))
        # Exactly one human-readable notice, naming the host and the variable.
        self.assertEqual(1, printed.call_count)
        message = printed.call_args.args[0]
        self.assertIn("notebook.rcc.uchicago.edu", message)
        self.assertIn("QRESP_FILESERVER_INSECURE_TLS_HOSTS", message)
        self.assertIn("every other host still verifies", message)

    def test_the_exception_does_not_leak_out_of_the_scope(self):
        os.environ["QRESP_FILESERVER_INSECURE_TLS_HOSTS"] = \
            "notebook.rcc.uchicago.edu"
        import warnings as warnings_module
        before = list(warnings_module.filters)
        with curation.tls_exception_scope(FOLDER):
            self.assertNotEqual(before, list(warnings_module.filters))
        # Restored exactly: the suppression lasts one analysis, not the
        # lifetime of the process.
        self.assertEqual(before, list(warnings_module.filters))

    def test_other_hosts_still_verify_inside_the_scope(self):
        os.environ["QRESP_FILESERVER_INSECURE_TLS_HOSTS"] = \
            "notebook.rcc.uchicago.edu"
        with curation.tls_exception_scope(FOLDER):
            self.assertTrue(curation._verify_for("https://other.example.org/a"))
            self.assertFalse(curation._verify_for(FOLDER))

    def test_listing_passes_verify_true_by_default(self):
        with mock.patch("project.curation.requests") as requests_mock:
            requests_mock.get.return_value = mock.Mock(
                content=b"<html></html>", status_code=200)
            curation._list_directory(FOLDER)
        self.assertTrue(requests_mock.get.call_args.kwargs["verify"])
        self.assertEqual(curation.REQUEST_TIMEOUT,
                         requests_mock.get.call_args.kwargs["timeout"])


class TestBoundedWalk(CurationTestBase):
    def test_walks_the_reference_tree(self):
        files, dirs, warnings, truncated = curation.walk_folder(
            FOLDER, list_directory=fake_lister)
        self.assertFalse(truncated)
        self.assertEqual([], warnings)
        self.assertIn("data/short_traj/traj_1.xyz", files)
        self.assertIn("figures/figure1.png", files)
        self.assertIn("data/short_traj", dirs)

    def test_depth_is_capped(self):
        deep = {}
        path = ""
        for level in range(curation.MAX_DEPTH + 4):
            child = "level%d" % level
            deep[path] = ([child], ["file%d.dat" % level])
            path = ("%s/%s" % (path, child)) if path else child
        deep[path] = ([], [])

        def lister(url):
            return deep[url[len(FOLDER):].strip("/")]

        files, _, warnings, truncated = curation.walk_folder(
            FOLDER, list_directory=lister)
        self.assertTrue(truncated)
        self.assertTrue(warnings)
        self.assertLessEqual(len(files), curation.MAX_DEPTH + 1)

    def test_file_count_is_capped_and_reported(self):
        many = {"": ([], ["f%d.dat" % i
                          for i in range(curation.MAX_FILES + 50)])}
        files, _, warnings, truncated = curation.walk_folder(
            FOLDER, list_directory=lambda url: many[""])
        self.assertTrue(truncated)
        self.assertEqual(curation.MAX_FILES, len(files))
        self.assertIn("larger than Qresp will inspect", " ".join(warnings))

    def test_the_depth_cap_says_so_even_alongside_other_warnings(self):
        # A deep tree that ALSO has an unlistable folder must still report
        # why it stopped — a silent `truncated` flag is what makes a partial
        # result look complete.
        deep = {}
        path = ""
        for level in range(curation.MAX_DEPTH + 3):
            child = "level%d" % level
            deep[path] = ([child, "broken"], ["f%d.dat" % level])
            path = ("%s/%s" % (path, child)) if path else child
        deep[path] = ([], [])

        def lister(url):
            relative = url[len(FOLDER):].strip("/")
            if relative.endswith("broken"):
                raise IOError("boom")
            return deep[relative]

        _, _, warnings, truncated = curation.walk_folder(
            FOLDER, list_directory=lister)
        self.assertTrue(truncated)
        joined = " ".join(warnings)
        self.assertIn("could not be listed", joined)
        self.assertIn("first %d folder levels" % curation.MAX_DEPTH, joined)
        # The depth message is reported once, not once per skipped folder.
        self.assertEqual(1, joined.count("folder levels"))

    def test_a_failing_subfolder_is_skipped_not_fatal(self):
        def flaky(url):
            if url.endswith("/scripts"):
                raise IOError("boom")
            return fake_lister(url)

        files, _, warnings, _ = curation.walk_folder(
            FOLDER, list_directory=flaky)
        self.assertIn("figures/figure1.png", files)
        self.assertIn("could not be listed", " ".join(warnings))

    def test_directory_requests_are_capped(self):
        wide = {"": (["d%d" % i for i in range(curation.MAX_DIR_REQUESTS + 20)],
                     [])}
        wide.update({"d%d" % i: ([], [])
                     for i in range(curation.MAX_DIR_REQUESTS + 20)})
        _, _, warnings, truncated = curation.walk_folder(
            FOLDER, list_directory=lambda url:
            wide[url[len(FOLDER):].strip("/")])
        self.assertTrue(truncated)
        self.assertIn("directory listings", " ".join(warnings))


class TestStructureDetection(CurationTestBase):
    """Which mode a folder lands in, and why."""

    def test_exact_lowercase_roles_are_the_standard(self):
        mode, roles, issues = folderstandard.detect_structure(
            ["datasets/a/x.csv", "charts/f1/preview.png", "scripts/s/r.py",
             "docs/g.md", "README.md"],
            ["datasets", "datasets/a", "charts", "charts/f1", "scripts",
             "scripts/s", "docs"])
        self.assertEqual("standard", mode)
        self.assertEqual(
            {"datasets": "datasets", "charts": "charts",
             "scripts": "scripts", "docs": "docs"}, roles)
        self.assertEqual([], issues)

    def test_known_aliases_map_case_insensitively_to_legacy(self):
        mode, roles, issues = folderstandard.detect_structure(
            ["Data/x.csv", "Figures_Tables/f.png", "Plot_Scripts/p.py",
             "Doc/readme.md"],
            ["Data", "Figures_Tables", "Plot_Scripts", "Doc"])
        self.assertEqual("legacy", mode)
        self.assertEqual(
            {"Data": "datasets", "Figures_Tables": "charts",
             "Plot_Scripts": "scripts", "Doc": "docs"}, roles)
        # The mapping is explained, and nothing is renamed on the server.
        self.assertTrue(issues)
        self.assertTrue(any("Nothing on the file server is renamed"
                            in issue["reason"] for issue in issues))

    def test_the_known_acs_folder_enters_legacy_mode(self):
        # acs.nanolett.7b00283 in the public corpus.
        mode, roles, _ = folderstandard.detect_structure(
            ["data/a.dat", "doc/notes.md", "figures_tables/f.png",
             "scripts/s.py"],
            ["data", "doc", "figures_tables", "scripts"])
        self.assertEqual("legacy", mode)
        self.assertEqual("datasets", roles["data"])
        self.assertEqual("charts", roles["figures_tables"])
        self.assertEqual("scripts", roles["scripts"])
        self.assertEqual("docs", roles["doc"])

    def test_an_unknown_root_is_invalid_not_a_guess(self):
        mode, _, issues = folderstandard.detect_structure(
            ["datasets/a/x.csv", "mystery_stuff/y.png"],
            ["datasets", "datasets/a", "mystery_stuff"])
        self.assertEqual("invalid", mode)
        self.assertEqual(["mystery_stuff"], [i["path"] for i in issues])

    def test_a_flat_folder_of_loose_files_is_invalid(self):
        mode, _, issues = folderstandard.detect_structure(
            ["a.csv", "b.png", "c.py"], [])
        self.assertEqual("invalid", mode)
        self.assertIn("no top-level directories", issues[0]["reason"])

    def test_new_artifact_ids_must_be_url_safe(self):
        for good in ("figure_01", "bandgap-2", "d.1", "A9"):
            self.assertTrue(folderstandard.validate_artifact_id(good), good)
        for bad in ("has space", "a/b", "a?b", "a#b", "", None):
            self.assertFalse(folderstandard.validate_artifact_id(bad), bad)


class TestRecordBoundaries(CurationTestBase):
    """One immediate child of a role directory is ONE Qresp record."""

    STANDARD_FILES = [
        "datasets/bandgap/values.csv",
        "datasets/bandgap/runs/run1/out.dat",
        "datasets/bandgap/runs/run2/out.dat",
        "datasets/single.csv",
        "charts/figure_01/preview.png",
        "charts/figure_01/notebook.ipynb",
        "charts/figure_01/data/points.csv",
        "scripts/analysis/analyze.py",
        "scripts/analysis/helper.py",
        "scripts/plot.py",
        "docs/guide.md",
        "docs/img/logo.png",
        "README.md",
        "main.ipynb",
    ]
    STANDARD_DIRS = [
        "datasets", "datasets/bandgap", "datasets/bandgap/runs",
        "datasets/bandgap/runs/run1", "datasets/bandgap/runs/run2",
        "charts", "charts/figure_01", "charts/figure_01/data",
        "scripts", "scripts/analysis", "docs", "docs/img",
    ]

    def analyze(self):
        return curation.analyze_folder_tree(
            self.STANDARD_FILES, self.STANDARD_DIRS, {})

    def test_a_dataset_folder_is_one_candidate_carrying_its_path(self):
        result = self.analyze()
        by_files = [c["proposal"]["files"] for c in result["datasets"]]
        # The folder, not its 3 descendants.
        self.assertIn(["datasets/bandgap"], by_files)
        # A direct file under datasets/ is also one dataset.
        self.assertIn(["datasets/single.csv"], by_files)
        self.assertEqual(2, len(result["datasets"]))

    def test_nested_dataset_descendants_do_not_duplicate(self):
        result = self.analyze()
        paths = [f for c in result["datasets"] for f in c["proposal"]["files"]]
        for nested in ("datasets/bandgap/runs",
                       "datasets/bandgap/runs/run1",
                       "datasets/bandgap/runs/run1/out.dat"):
            self.assertNotIn(nested, paths)
        # The curator is told how to split them if they want to.
        bandgap = [c for c in result["datasets"]
                   if c["proposal"]["files"] == ["datasets/bandgap"]][0]
        self.assertTrue(any("place them as siblings" in line
                            for line in bandgap["evidence"]))

    def test_a_chart_folder_groups_preview_data_and_notebook(self):
        result = self.analyze()
        self.assertEqual(1, len(result["charts"]))
        chart = result["charts"][0]
        self.assertEqual("charts/figure_01/preview.png",
                         chart["proposal"]["imageFile"])
        self.assertEqual(["charts/figure_01/data"], chart["proposal"]["files"])
        self.assertEqual("charts/figure_01/notebook.ipynb",
                         chart["proposal"]["notebookFile"])
        # Still never invented.
        self.assertEqual("", chart["proposal"]["number"])
        self.assertEqual("", chart["proposal"]["caption"])
        self.assertEqual([], chart["proposal"]["properties"])

    def test_a_script_folder_is_one_record_and_a_loose_file_is_another(self):
        result = self.analyze()
        by_files = [c["proposal"]["files"] for c in result["scripts"]]
        self.assertIn(["scripts/analysis"], by_files)
        self.assertIn(["scripts/plot.py"], by_files)
        self.assertEqual(2, len(result["scripts"]))

    def test_docs_produce_no_candidates_and_no_unclassified_noise(self):
        result = self.analyze()
        everything = (result["charts"] + result["datasets"]
                      + result["scripts"] + result["tools"])
        for candidate in everything:
            for path in candidate["paths"]:
                self.assertFalse(path.startswith("docs/"), path)
        self.assertEqual(0, result["unclassified_total"])

    def test_python_under_a_dataset_root_is_not_a_script(self):
        result = curation.analyze_folder_tree(
            ["data/set1/prepare.py", "data/set1/values.csv"],
            ["data", "data/set1"], {})
        self.assertEqual([], result["scripts"])
        self.assertEqual(["data/set1"],
                         result["datasets"][0]["proposal"]["files"])

    def test_csv_under_a_script_root_is_not_a_dataset(self):
        result = curation.analyze_folder_tree(
            ["scripts/job/table.csv", "scripts/job/run.py"],
            ["scripts", "scripts/job"], {})
        self.assertEqual([], result["datasets"])
        self.assertEqual(["scripts/job"],
                         result["scripts"][0]["proposal"]["files"])

    def test_a_tool_folder_leaves_package_and_version_blank_without_evidence(self):
        result = curation.analyze_folder_tree(
            ["tools/west/patches/a.patch", "tools/west/README.md"],
            ["tools", "tools/west", "tools/west/patches"], {})
        tool = result["tools"][0]
        self.assertEqual("", tool["proposal"]["packageName"])
        self.assertEqual("", tool["proposal"]["version"])
        self.assertIn("packageName", tool["needs_input"])
        self.assertEqual(["tools/west/patches/a.patch"],
                         tool["proposal"]["patches"])

    def test_a_tool_folder_uses_an_explicit_declaration_when_present(self):
        result = curation.analyze_folder_tree(
            ["tools/west/README.md"], ["tools", "tools/west"],
            {"tools/west/README.md": "Run with WEST v5.0.0"})
        tool = result["tools"][0]
        self.assertEqual("WEST", tool["proposal"]["packageName"])
        self.assertEqual("5.0.0", tool["proposal"]["version"])

    def test_optional_root_files_are_not_a_problem(self):
        result = self.analyze()
        self.assertEqual(0, result["unclassified_total"])
        self.assertEqual("standard", result["structure_mode"])


class TestLegacyMode(CurationTestBase):
    def test_legacy_aliases_produce_boundary_candidates(self):
        files = ["Data/set_a/x.dat", "Figures_Tables/fig1/preview.png",
                 "Plot_Scripts/plot.py", "Doc/manual.md"]
        dirs = ["Data", "Data/set_a", "Figures_Tables",
                "Figures_Tables/fig1", "Plot_Scripts", "Doc"]
        result = curation.analyze_folder_tree(files, dirs, {})
        self.assertEqual("legacy", result["structure_mode"])
        self.assertEqual(["Data/set_a"],
                         result["datasets"][0]["proposal"]["files"])
        self.assertEqual("Figures_Tables/fig1/preview.png",
                         result["charts"][0]["proposal"]["imageFile"])
        self.assertEqual(["Plot_Scripts/plot.py"],
                         result["scripts"][0]["proposal"]["files"])

    def test_legacy_offers_a_bounded_boundary_tree_for_data_and_scripts(self):
        files = ["data/%s/x.dat" % name for name in ("a", "b", "c")]
        files += ["data/a/nested/y.dat", "scripts/s/run.py"]
        dirs = ["data", "data/a", "data/a/nested", "data/b", "data/c",
                "scripts", "scripts/s"]
        result = curation.analyze_folder_tree(files, dirs, {})
        trees = result["boundary_trees"]
        self.assertIn("data", trees)
        self.assertIn("scripts", trees)
        self.assertEqual("datasets", trees["data"]["role"])
        paths = [node["path"] for node in trees["data"]["nodes"]]
        self.assertIn("data/a", paths)
        self.assertIn("data/a/nested", paths)
        # Every node carries a count, not a file list.
        for node in trees["data"]["nodes"]:
            self.assertIn("file_count", node)
            self.assertLessEqual(len(node["sample_names"]),
                                 folderstandard.MAX_NAMES_PER_GROUP)

    def test_the_acs_folder_does_not_explode_into_unclassified(self):
        files = (["data/run%02d/out.dat" % i for i in range(40)]
                 + ["figures_tables/fig1/preview.png"]
                 + ["scripts/plot.py"]
                 + ["doc/notes.md"])
        dirs = (["data"] + ["data/run%02d" % i for i in range(40)]
                + ["figures_tables", "figures_tables/fig1", "scripts", "doc"])
        result = curation.analyze_folder_tree(files, dirs, {})
        self.assertEqual("legacy", result["structure_mode"])
        # 40 dataset records (one per immediate child), not 40 raw files.
        self.assertEqual(40, len(result["datasets"]))
        self.assertEqual(0, result["unclassified_total"])
        self.assertEqual([], result["grouped_unclassified"])


class TestCandidateIdentity(CurationTestBase):
    """Every candidate must carry its OWN name, count and real paths.

    The frontend used to derive a name from proposal.files, which since the
    boundary rewrite holds ONE folder path — so dirname() walked up to the
    role root and every dataset under data/ displayed as "data · 1 file".
    Identity is decided here now, and a role root is only ever the name when
    it IS the chosen boundary.
    """

    FILES = [
        "data/DFT/Figure2/a.in",
        "data/DFT/Figure2/b.out",
        "data/DFT/Figure3/c.in",
        "data/other/x.dat",
        "data/loose.csv",
        "figures_tables/fig1/panel.png",
        "figures_tables/loose.png",
        "scripts/analysis/run.py",
        "scripts/plot.py",
    ]
    DIRS = [
        "data", "data/DFT", "data/DFT/Figure2", "data/DFT/Figure3",
        "data/other", "figures_tables", "figures_tables/fig1",
        "scripts", "scripts/analysis",
    ]

    def analyze_tree(self, boundaries=None):
        return curation.analyze_folder_tree(
            self.FILES, self.DIRS, {}, boundaries=boundaries)

    def identity(self, candidates):
        return [(c["label"], c["file_count"]) for c in candidates]

    def test_a_direct_file_is_named_after_the_file(self):
        result = curation.analyze_folder_tree(
            ["datasets/foo.csv"], ["datasets"], {})
        self.assertEqual([("foo.csv", 1)], self.identity(result["datasets"]))

    def test_a_boundary_folder_is_named_after_the_folder(self):
        result = curation.analyze_folder_tree(
            ["datasets/run-a/x.csv", "datasets/run-a/y.csv"],
            ["datasets", "datasets/run-a"], {})
        self.assertEqual([("run-a", 2)], self.identity(result["datasets"]))

    def test_datasets_never_all_collapse_onto_the_role_root(self):
        result = self.analyze_tree()
        labels = [c["label"] for c in result["datasets"]]
        # Three distinct datasets, three distinct names — this is the bug.
        self.assertEqual(["DFT", "loose.csv", "other"], sorted(labels))
        self.assertNotIn("data", labels)
        self.assertEqual(len(labels), len(set(labels)))
        # And each reports its OWN file count, not 1 for everything.
        counts = dict(self.identity(result["datasets"]))
        self.assertEqual(3, counts["DFT"])
        self.assertEqual(1, counts["other"])
        self.assertEqual(1, counts["loose.csv"])

    def test_a_chosen_boundary_names_the_candidate(self):
        result = self.analyze_tree({"data": ["data/DFT/Figure2"]})
        self.assertEqual([("Figure2", 2)], self.identity(result["datasets"]))
        self.assertEqual(["data/DFT/Figure2"],
                         result["datasets"][0]["proposal"]["files"])

    def test_selecting_the_role_root_still_reports_real_files(self):
        # The special case: `data` IS the chosen boundary, so it may name the
        # record — but the count and the paths must be real, and there must
        # be exactly one candidate.
        result = self.analyze_tree({"data": ["data"]})
        self.assertEqual(1, len(result["datasets"]))
        candidate = result["datasets"][0]
        # Never a BARE role root: that reads like the container, not a
        # record, and is exactly what the repeated "data · 1 file" bug
        # looked like.
        self.assertNotEqual("data", candidate["label"])
        self.assertEqual("data (whole folder)", candidate["label"])
        self.assertEqual(5, candidate["file_count"])
        self.assertTrue(candidate["paths"])
        for path in candidate["paths"]:
            self.assertTrue(path.startswith("data/"), path)

    def test_candidate_paths_are_real_files_not_just_the_boundary(self):
        result = self.analyze_tree()
        dft = [c for c in result["datasets"] if c["label"] == "DFT"][0]
        self.assertEqual(
            ["data/DFT/Figure2/a.in", "data/DFT/Figure2/b.out",
             "data/DFT/Figure3/c.in"],
            sorted(dft["paths"]))
        # The record VALUE stays the folder — that is the boundary contract.
        self.assertEqual(["data/DFT"], dft["proposal"]["files"])

    def test_charts_and_scripts_are_named_too(self):
        result = self.analyze_tree()
        self.assertEqual(
            ["fig1", "loose.png"],
            sorted(c["label"] for c in result["charts"]))
        self.assertEqual(
            ["analysis", "plot.py"],
            sorted(c["label"] for c in result["scripts"]))

    def test_a_low_evidence_chart_still_has_a_name_and_paths(self):
        # No preview image -> LOW classification, but it is still a real
        # folder and must never render as a blank card.
        result = curation.analyze_folder_tree(
            ["charts/fig9/panel_a.png", "charts/fig9/panel_b.png"],
            ["charts", "charts/fig9"], {})
        chart = result["charts"][0]
        self.assertEqual("low", chart["confidence"])
        self.assertEqual("fig9", chart["label"])
        self.assertEqual(2, chart["file_count"])
        self.assertTrue(chart["paths"])

    def test_a_tool_without_a_declaration_is_named_after_its_folder(self):
        result = curation.analyze_folder_tree(
            ["tools/west/patches/a.patch"],
            ["tools", "tools/west", "tools/west/patches"], {})
        tool = result["tools"][0]
        self.assertEqual("west", tool["label"])
        self.assertEqual("", tool["proposal"]["packageName"])

    def test_every_candidate_has_a_label_and_at_least_one_path(self):
        for boundaries in (None, {"data": ["data/DFT"]}, {"data": ["data"]}):
            result = self.analyze_tree(boundaries)
            for kind in ("charts", "datasets", "scripts", "tools"):
                for candidate in result[kind]:
                    self.assertTrue(candidate["label"].strip(),
                                    (kind, boundaries))
                    self.assertTrue([p for p in candidate["paths"] if p],
                                    (kind, boundaries))

    def test_an_unusable_candidate_never_reaches_the_response(self):
        # A boundary folder holding no files produces nothing rather than a
        # nameless, pathless card the curator could still tick.
        groups, _ = curation.build_boundary_candidates(
            [], ["datasets", "datasets/empty"], {"datasets": "datasets"}, {})
        self.assertEqual([], groups["datasets"])
        self.assertFalse(curation._usable(
            {"label": "", "paths": ["datasets/x"]}))
        self.assertFalse(curation._usable({"label": "x", "paths": []}))
        self.assertTrue(curation._usable(
            {"label": "x", "paths": ["datasets/x/y.csv"]}))


class TestExplicitBoundaries(CurationTestBase):
    """A curator may choose where one record ends, within strict limits."""

    FILES = [
        "data/DFT/Figure2/espresso_calculation/scf.in",
        "data/DFT/Figure2/espresso_calculation/scf.out",
        "data/DFT/Figure2/plot.dat",
        "data/DFT/Figure3/scf.in",
        "data/other/x.dat",
        "scripts/analysis/run.py",
        "scripts/analysis/helper.py",
        "doc/notes.md",
    ]
    DIRS = [
        "data", "data/DFT", "data/DFT/Figure2",
        "data/DFT/Figure2/espresso_calculation", "data/DFT/Figure3",
        "data/other", "scripts", "scripts/analysis", "doc",
    ]

    def analyze_tree(self, boundaries=None):
        return curation.analyze_folder_tree(
            self.FILES, self.DIRS, {}, boundaries=boundaries)

    def dataset_paths(self, result):
        return sorted(f for c in result["datasets"]
                      for f in c["proposal"]["files"])

    def test_no_boundaries_uses_immediate_children(self):
        result = self.analyze_tree()
        self.assertEqual("legacy", result["structure_mode"])
        self.assertEqual(["data/DFT", "data/other"],
                         self.dataset_paths(result))
        self.assertEqual({}, result["applied_boundaries"])

    def test_selecting_the_parent_yields_one_dataset(self):
        result = self.analyze_tree({"data": ["data/DFT"]})
        self.assertEqual(["data/DFT"], self.dataset_paths(result))
        self.assertEqual(1, len(result["datasets"]))
        # Everything beneath it belongs to that one record.
        candidate = result["datasets"][0]
        self.assertTrue(any("everything in it" in line
                            for line in candidate["evidence"]))
        self.assertTrue(any("You chose this folder" in line
                            for line in candidate["evidence"]))
        self.assertEqual({"data": ["data/DFT"]}, result["applied_boundaries"])

    def test_selecting_a_child_splits_it_instead(self):
        result = self.analyze_tree(
            {"data": ["data/DFT/Figure2", "data/DFT/Figure3"]})
        self.assertEqual(["data/DFT/Figure2", "data/DFT/Figure3"],
                         self.dataset_paths(result))

    def test_a_selection_only_replaces_its_own_role_root(self):
        result = self.analyze_tree({"data": ["data/DFT/Figure2"]})
        # scripts/ keeps its deterministic default.
        self.assertEqual(["scripts/analysis"],
                         sorted(f for c in result["scripts"]
                                for f in c["proposal"]["files"]))

    def test_scripts_boundaries_are_honoured_too(self):
        result = self.analyze_tree({"scripts": ["scripts/analysis"]})
        self.assertEqual(["scripts/analysis"],
                         sorted(f for c in result["scripts"]
                                for f in c["proposal"]["files"]))

    def test_duplicates_collapse_to_one(self):
        result = self.analyze_tree(
            {"data": ["data/DFT", "data/DFT", "data/DFT"]})
        self.assertEqual(1, len(result["datasets"]))
        self.assertEqual({"data": ["data/DFT"]}, result["applied_boundaries"])

    def assert_rejected(self, boundaries, fragment):
        with self.assertRaises(folderstandard.BoundaryError) as caught:
            self.analyze_tree(boundaries)
        self.assertIn(fragment, str(caught.exception))

    def test_a_parent_and_its_descendant_cannot_both_be_selected(self):
        self.assert_rejected(
            {"data": ["data/DFT", "data/DFT/Figure2"]}, "overlap")

    def test_paths_outside_the_role_root_are_rejected(self):
        self.assert_rejected({"data": ["scripts/analysis"]}, "is not inside")

    def test_unseen_paths_are_rejected(self):
        self.assert_rejected(
            {"data": ["data/DFT/Figure9"]}, "was not found")

    def test_absolute_urls_and_traversal_are_rejected(self):
        for bad in ("/etc/passwd", "../../etc", "data/../../etc",
                    "https://evil.example.com/x", "data\\DFT",
                    "data/%2e%2e/x"):
            self.assert_rejected({"data": [bad]},
                                 "not a relative folder"
                                 if bad != "data/../../etc" else "not a")

    def test_an_unknown_role_root_is_rejected(self):
        self.assert_rejected({"nope": ["nope/a"]}, "not a folder in this paper")

    def test_a_malformed_payload_is_rejected(self):
        self.assert_rejected({"data": "data/DFT"}, "must be a list")
        with self.assertRaises(folderstandard.BoundaryError):
            self.analyze_tree(["data/DFT"])

    def test_docs_still_never_produce_candidates(self):
        result = self.analyze_tree({"data": ["data/DFT"]})
        for group in ("charts", "datasets", "scripts", "tools"):
            for candidate in result[group]:
                for path in candidate["paths"]:
                    self.assertFalse(path.startswith("doc/"), path)

    def test_standard_folders_do_not_need_a_selection(self):
        files = ["datasets/a/x.csv", "charts/f1/preview.png",
                 "scripts/s/run.py"]
        dirs = ["datasets", "datasets/a", "charts", "charts/f1",
                "scripts", "scripts/s"]
        result = curation.analyze_folder_tree(files, dirs, {})
        self.assertEqual("standard", result["structure_mode"])
        self.assertEqual(["datasets/a"], self.dataset_paths(result))
        # No picker is offered for a standard layout.
        self.assertEqual({}, result["boundary_trees"])

    def test_the_endpoint_rejects_a_bad_boundary_with_400(self):
        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=fake_lister), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER,
                      "boundaries": {"data": ["/etc/passwd"]}},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(400, response.status_code)
        self.assertIn("not a relative folder", response.json()["error"])

    def test_the_endpoint_applies_a_valid_boundary(self):
        self.login()
        with mock.patch("project.curation._list_directory",
                        side_effect=fake_lister), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER, "boundaries": {"data": ["data"]}},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(200, response.status_code)
        body = response.json()
        datasets = body["candidates"]["datasets"]
        self.assertEqual(1, len(datasets))
        self.assertEqual(["data"], datasets[0]["proposal"]["files"])
        self.assertEqual({"data": ["data"]},
                         body["candidates"]["applied_boundaries"])


class TestCapitalizedLegacyThroughTheRoute(CurationTestBase):
    """The reported staging regression, driven through the real endpoint.

    Symptom: three different datasets all rendered as "Datasets · 1 file"
    with no Legacy-compatible badge and no boundary selector. Both halves
    are asserted here on the wire, not on an internal helper.
    """

    TREE = {
        "": (["Datasets", "Figures", "Scripts"], []),
        "Datasets": (["Run_A", "Run_B"], ["loose.csv"]),
        "Datasets/Run_A": ([], ["a.csv", "a2.csv"]),
        "Datasets/Run_B": ([], ["b.csv"]),
        "Figures": (["Fig1"], []),
        "Figures/Fig1": ([], ["preview.png"]),
        "Scripts": ([], ["run.py"]),
    }

    def request(self, tree=None, body=None):
        tree = tree or self.TREE
        self.login()
        payload = {"path": FOLDER}
        payload.update(body or {})

        def lister(url):
            relative = url[len(FOLDER):].strip("/")
            if relative not in tree:
                raise AssertionError("unexpected listing: %s" % url)
            return tree[relative]

        with mock.patch("project.curation._list_directory",
                        side_effect=lister), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder", json=payload,
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(200, response.status_code, response.text)
        return response.json()

    def test_capitalized_role_folders_are_legacy_with_full_metadata(self):
        body = self.request()
        self.assertEqual("legacy", body["structure_mode"])
        for key in ("structure_mode", "normalized_roles", "boundary_trees",
                    "applied_boundaries"):
            self.assertIn(key, body, key)
        self.assertEqual({"Datasets": "datasets", "Figures": "charts",
                          "Scripts": "scripts"}, body["normalized_roles"])
        self.assertEqual(["Datasets", "Scripts"],
                         sorted(body["boundary_trees"]))

    def test_each_dataset_is_named_after_its_own_file_or_folder(self):
        datasets = self.request()["candidates"]["datasets"]
        identity = sorted((c["label"], c["file_count"]) for c in datasets)
        self.assertEqual(
            [("Run_A", 2), ("Run_B", 1), ("loose.csv", 1)], identity)

    def test_no_two_datasets_share_the_role_root_name(self):
        datasets = self.request()["candidates"]["datasets"]
        labels = [c["label"] for c in datasets]
        # The exact regression: three rows all reading "Datasets · 1 file".
        self.assertEqual(len(labels), len(set(labels)))
        for label in labels:
            self.assertNotEqual("Datasets", label)
        self.assertNotEqual(1, len({c["file_count"] for c in datasets}))

    def test_no_candidate_path_is_the_bare_role_root(self):
        body = self.request()
        for kind in ("charts", "datasets", "scripts", "tools"):
            for candidate in body["candidates"][kind]:
                self.assertNotIn("Datasets", candidate["paths"], kind)
                self.assertNotIn("Figures", candidate["paths"], kind)
                self.assertNotIn("Scripts", candidate["paths"], kind)
                for path in candidate["paths"]:
                    self.assertIn("/", path, path)

    def test_a_direct_file_under_the_role_root(self):
        loose = [c for c in self.request()["candidates"]["datasets"]
                 if c["label"] == "loose.csv"][0]
        self.assertEqual(1, loose["file_count"])
        self.assertEqual(["Datasets/loose.csv"], loose["paths"])
        self.assertEqual(["Datasets/loose.csv"], loose["proposal"]["files"])

    def test_a_child_folder_under_the_role_root(self):
        run_a = [c for c in self.request()["candidates"]["datasets"]
                 if c["label"] == "Run_A"][0]
        self.assertEqual(2, run_a["file_count"])
        self.assertEqual(["Datasets/Run_A/a.csv", "Datasets/Run_A/a2.csv"],
                         sorted(run_a["paths"]))
        self.assertEqual(["Datasets/Run_A"], run_a["proposal"]["files"])

    def test_a_custom_boundary_keeps_its_own_identity(self):
        body = self.request(body={"boundaries": {"Datasets": ["Datasets/Run_A"]}})
        self.assertEqual({"Datasets": ["Datasets/Run_A"]},
                         body["applied_boundaries"])
        datasets = body["candidates"]["datasets"]
        self.assertEqual(1, len(datasets))
        self.assertEqual("Run_A", datasets[0]["label"])
        self.assertEqual(2, datasets[0]["file_count"])
        for path in datasets[0]["paths"]:
            self.assertTrue(path.startswith("Datasets/Run_A/"), path)

    def test_choosing_the_role_root_never_labels_it_bare(self):
        body = self.request(body={"boundaries": {"Datasets": ["Datasets"]}})
        datasets = body["candidates"]["datasets"]
        self.assertEqual(1, len(datasets))
        self.assertNotEqual("Datasets", datasets[0]["label"])
        self.assertEqual("Datasets (whole folder)", datasets[0]["label"])
        self.assertEqual(4, datasets[0]["file_count"])

    def test_lowercase_aliases_behave_the_same_way(self):
        tree = {
            "": (["data", "figures_tables", "scripts", "doc"], []),
            "data": (["setA"], ["loose.dat"]),
            "data/setA": ([], ["x.dat", "y.dat"]),
            "figures_tables": (["fig1"], []),
            "figures_tables/fig1": ([], ["preview.png"]),
            "scripts": (["an"], []),
            "scripts/an": ([], ["run.py"]),
            "doc": ([], ["notes.md"]),
        }
        body = self.request(tree)
        self.assertEqual("legacy", body["structure_mode"])
        identity = sorted((c["label"], c["file_count"])
                          for c in body["candidates"]["datasets"])
        self.assertEqual([("loose.dat", 1), ("setA", 2)], identity)

    def test_a_standard_lowercase_structure_needs_no_selector(self):
        tree = {
            "": (["datasets", "charts", "scripts"], []),
            "datasets": (["d1"], []), "datasets/d1": ([], ["x.csv"]),
            "charts": (["f1"], []), "charts/f1": ([], ["preview.png"]),
            "scripts": (["s1"], []), "scripts/s1": ([], ["run.py"]),
        }
        body = self.request(tree)
        self.assertEqual("standard", body["structure_mode"])
        self.assertEqual({}, body["boundary_trees"])
        self.assertEqual("d1", body["candidates"]["datasets"][0]["label"])


class TestBoundaryResponseEnvelope(CurationTestBase):
    """The boundary contract as the BROWSER receives it.

    Regression: boundary_trees and applied_boundaries were generated
    correctly but lived inside `candidates`, while structure_mode and
    normalized_roles were lifted to the top level. The UI read the top level,
    got undefined, and the boundary picker never rendered — with unit tests
    passing the whole time because they called analyze_folder_tree directly.
    These call the real handler.
    """

    LOWER = {
        "": (["data", "figures_tables", "scripts", "doc"], []),
        "data": (["setA", "setB"], []),
        "data/setA": ([], ["a.csv"]),
        "data/setB": ([], ["b.csv"]),
        "figures_tables": (["fig1"], []),
        "figures_tables/fig1": ([], ["preview.png"]),
        "scripts": (["analysis"], []),
        "scripts/analysis": ([], ["run.py"]),
        "doc": ([], ["notes.md"]),
    }
    UPPER = {
        "": (["Datasets", "Figures", "Scripts"], []),
        "Datasets": (["Run_A"], []),
        "Datasets/Run_A": ([], ["a.csv"]),
        "Figures": (["Fig1"], []),
        "Figures/Fig1": ([], ["preview.png"]),
        "Scripts": (["Analysis"], []),
        "Scripts/Analysis": ([], ["run.py"]),
    }

    def request(self, tree, body=None):
        self.login()
        payload = {"path": FOLDER}
        payload.update(body or {})

        def lister(url):
            relative = url[len(FOLDER):].strip("/")
            if relative not in tree:
                raise AssertionError("unexpected listing: %s" % url)
            return tree[relative]

        with mock.patch("project.curation._list_directory",
                        side_effect=lister), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder", json=payload,
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(200, response.status_code, response.text)
        return response.json()

    def test_lowercase_aliases_ship_the_boundary_contract_at_top_level(self):
        body = self.request(self.LOWER)
        self.assertEqual("legacy", body["structure_mode"])
        # TOP LEVEL, beside the other structure fields — this is the bug.
        self.assertIn("boundary_trees", body)
        self.assertIn("applied_boundaries", body)
        self.assertEqual(["data", "scripts"],
                         sorted(body["boundary_trees"]))
        self.assertEqual("datasets", body["boundary_trees"]["data"]["role"])
        self.assertEqual("scripts",
                         body["boundary_trees"]["scripts"]["role"])
        # Chart roots are not boundary-selectable.
        self.assertNotIn("figures_tables", body["boundary_trees"])
        self.assertNotIn("doc", body["boundary_trees"])

    def test_capitalized_aliases_keep_their_real_spelling(self):
        body = self.request(self.UPPER)
        self.assertEqual("legacy", body["structure_mode"])
        # The ACTUAL directory name is the key; the canonical role rides
        # beside it and never replaces it.
        self.assertEqual(["Datasets", "Scripts"],
                         sorted(body["boundary_trees"]))
        self.assertEqual({"Datasets": "datasets", "Figures": "charts",
                          "Scripts": "scripts"}, body["normalized_roles"])
        paths = [node["path"]
                 for node in body["boundary_trees"]["Datasets"]["nodes"]]
        self.assertEqual(["Datasets/Run_A"], paths)

    def test_a_role_root_with_nothing_selectable_is_still_reported(self):
        tree = {
            "": (["data", "scripts"], []),
            "data": (["setA"], []),
            "data/setA": ([], ["a.csv"]),
            # No child folders at all: nothing to choose between.
            "scripts": ([], ["run.py"]),
        }
        body = self.request(tree)
        self.assertIn("scripts", body["boundary_trees"])
        self.assertEqual([], body["boundary_trees"]["scripts"]["nodes"])

    def test_resubmitting_boundaries_returns_new_candidates_and_echo(self):
        body = self.request(
            self.LOWER, {"boundaries": {"data": ["data/setA"]}})
        # Same envelope, new candidates, new echo.
        self.assertEqual({"data": ["data/setA"]}, body["applied_boundaries"])
        datasets = body["candidates"]["datasets"]
        self.assertEqual(1, len(datasets))
        self.assertEqual(["data/setA"], datasets[0]["proposal"]["files"])
        self.assertEqual("setA", datasets[0]["label"])
        # And the tree is still offered so the choice can be changed again.
        self.assertIn("data", body["boundary_trees"])

    def test_default_boundaries_echo_nothing_applied(self):
        body = self.request(self.LOWER)
        self.assertEqual({}, body["applied_boundaries"])
        self.assertEqual(
            ["data/setA", "data/setB"],
            sorted(f for c in body["candidates"]["datasets"]
                   for f in c["proposal"]["files"]))

    def test_a_conflicting_boundary_is_refused_by_the_endpoint(self):
        self.login()
        tree = self.LOWER

        def lister(url):
            return tree[url[len(FOLDER):].strip("/")]

        with mock.patch("project.curation._list_directory",
                        side_effect=lister), \
                mock.patch("project.curation._fetch_text_sized",
                           side_effect=lambda url: ("", False)):
            response = self.client.post(
                "/api/curation/analyze-folder",
                json={"path": FOLDER,
                      "boundaries": {"data": ["data", "data/setA"]}},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(400, response.status_code)
        self.assertIn("overlap", response.json()["error"])

    def test_a_standard_layout_needs_no_boundary_picker(self):
        tree = {
            "": (["datasets", "charts", "scripts"], []),
            "datasets": (["d1"], []), "datasets/d1": ([], ["x.csv"]),
            "charts": (["f1"], []), "charts/f1": ([], ["preview.png"]),
            "scripts": (["s1"], []), "scripts/s1": ([], ["run.py"]),
        }
        body = self.request(tree)
        self.assertEqual("standard", body["structure_mode"])
        # Present but empty: the field is never omitted.
        self.assertEqual({}, body["boundary_trees"])
        self.assertEqual({}, body["applied_boundaries"])

    def test_an_invalid_layout_offers_no_candidates_to_add(self):
        tree = {
            "": (["mystery"], []),
            "mystery": ([], ["a.png", "b.csv"]),
        }
        body = self.request(tree)
        self.assertEqual("invalid", body["structure_mode"])
        for kind in ("charts", "datasets", "scripts", "tools"):
            self.assertEqual([], body["candidates"][kind], kind)
        self.assertEqual({}, body["boundary_trees"])
        self.assertTrue(body["candidates"]["grouped_unclassified"])


class TestNeedsReorganization(CurationTestBase):
    def test_unknown_roots_produce_grouped_rows_and_no_candidates(self):
        files = ["mystery/%d.png" % i for i in range(120)]
        files += ["mystery/deep/a.csv", "datasets/d/x.csv"]
        dirs = ["mystery", "mystery/deep", "datasets", "datasets/d"]
        result = curation.analyze_folder_tree(files, dirs, {})

        self.assertEqual("invalid", result["structure_mode"])
        # No extension-based guessing at all.
        for group in ("charts", "datasets", "scripts", "tools"):
            self.assertEqual([], result[group], group)
        # ONE grouped row for the unsupported root, not 121 file entries.
        rows = result["grouped_unclassified"]
        self.assertEqual(["mystery"], [row["path"] for row in rows])
        row = rows[0]
        self.assertEqual(121, row["file_count"])
        self.assertIn(".png", row["extensions"])
        self.assertLessEqual(len(row["sample_names"]),
                             folderstandard.MAX_NAMES_PER_GROUP)
        self.assertIn("not a layout Qresp", row["reason"])
        # The raw list is never returned.
        self.assertEqual([], result["unclassified"])


class TestGroupedUnclassified(CurationTestBase):
    def test_rows_are_grouped_bounded_and_counted(self):
        leftover = ["a/%d.txt" % i for i in range(60)] + ["b/x.dat"]
        rows = folderstandard.group_unclassified(leftover, leftover)
        self.assertEqual(["a", "b"], sorted(row["path"] for row in rows))
        row_a = [r for r in rows if r["path"] == "a"][0]
        self.assertEqual(60, row_a["file_count"])
        self.assertEqual([".txt"], row_a["extensions"])
        # Names only as a bounded sample, never the whole list.
        self.assertEqual(folderstandard.MAX_NAMES_PER_GROUP,
                         len(row_a["sample_names"]))

    def test_the_row_count_itself_is_bounded(self):
        leftover = ["f%03d/x.txt" % i for i in range(400)]
        rows = folderstandard.group_unclassified(leftover, leftover)
        self.assertLessEqual(len(rows), folderstandard.MAX_GROUP_ROWS)


class TestAnalyzeFolderResponse(CurationTestBase):
    def test_response_shape_and_counts(self):
        self.login()
        response, _, _ = self.analyze()
        body = response.json()
        self.assertEqual(FOLDER, body["root"])
        self.assertFalse(body["truncated"])
        # data/ + figures/ + scripts/ are known aliases -> legacy mode.
        self.assertEqual("legacy", body["structure_mode"])
        self.assertEqual("datasets", body["normalized_roles"]["data"])
        self.assertEqual("charts", body["normalized_roles"]["figures"])
        candidates = body["candidates"]
        # Two loose images directly under figures/ -> two charts.
        self.assertEqual(2, len(candidates["charts"]))
        self.assertEqual(2, len(candidates["scripts"]))
        # Five immediate children of data/ -> five datasets, not 6 raw files.
        self.assertEqual(5, len(candidates["datasets"]))
        # Tools now come only from a tools/ role folder; a root
        # requirements.txt is not one.
        self.assertEqual([], candidates["tools"])
        self.assertIn("grouped_unclassified", candidates)
        self.assertEqual(body["counts"]["files"], len(self.all_files()))

    def all_files(self):
        files, _, _, _ = curation.walk_folder(
            FOLDER, list_directory=fake_lister)
        return files

    def test_the_response_states_the_limits_in_force(self):
        self.login()
        response, _, _ = self.analyze()
        limits = response.json()["limits"]
        self.assertEqual(curation.MAX_DEPTH, limits["max_depth"])
        self.assertEqual(curation.MAX_FILES, limits["max_files"])
        self.assertEqual(curation.MAX_DIR_REQUESTS,
                         limits["max_directory_listings"])

    def test_paths_are_relative_and_filetree_compatible(self):
        self.login()
        response, _, _ = self.analyze()
        candidates = response.json()["candidates"]
        for key in ("charts", "datasets", "scripts", "tools"):
            for candidate in candidates[key]:
                for path in candidate["paths"]:
                    self.assertFalse(path.startswith("/"), path)
                    self.assertNotIn("://", path)
                    self.assertNotIn("\\", path)

    def test_nothing_is_written_to_mongo(self):
        self.login()
        before = Paper.objects.count()
        self.analyze()
        self.assertEqual(before, Paper.objects.count())

    def test_only_readable_text_is_read_never_data_or_images(self):
        self.login()
        _, _, fetch = self.analyze()
        read = [call.args[0] for call in fetch.call_args_list]
        for url in read:
            self.assertFalse(url.endswith((".xyz", ".png", ".cube", ".dat")),
                             url)
        # The scripts ARE read, and their headers are now used rather than
        # fetched and discarded.
        self.assertIn(FOLDER + "/scripts/plot_vdos.py", read)

    def test_reads_are_confined_to_candidate_boundaries(self):
        # The root requirements.txt is deliberately no longer fetched. Under
        # the Folder Standard a root file is not a candidate and belongs to no
        # boundary, so nothing could ever have used it — the old plan spent a
        # request on it and threw the result away. The paper's root README is
        # skipped for the same reason, and because it describes the PAPER, not
        # any one artifact.
        self.login()
        _, _, fetch = self.analyze()
        read = [call.args[0][len(FOLDER) + 1:]
                for call in fetch.call_args_list]
        self.assertNotIn("requirements.txt", read)
        self.assertNotIn("README.md", read)
        for path in read:
            self.assertIn("/", path, path)

    def test_directory_contents_are_never_logged(self, ):
        self.login()
        with mock.patch("builtins.print") as printed:
            self.analyze()
        logged = " ".join(str(call.args[0]) for call in printed.call_args_list
                          if call.args)
        self.assertNotIn("traj_1.xyz", logged)
        self.assertNotIn("figure1.png", logged)
        self.assertNotIn("numpy==", logged)
        self.assertIn("Folder analysis:", logged)

    def test_unreadable_folder_reports_without_leaking_details(self):
        self.login()

        def broken(url):
            raise RuntimeError("connection to 10.0.0.5 refused: secret detail")

        with mock.patch("project.curation.walk_folder", side_effect=broken):
            response = self.client.post(
                "/api/curation/analyze-folder", json={"path": FOLDER},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(502, response.status_code)
        self.assertNotIn("secret detail", response.text)
        self.assertNotIn("10.0.0.5", response.text)

    def test_empty_folder_reports_404(self):
        self.login()
        with mock.patch("project.curation._list_directory",
                        return_value=([], [])):
            response = self.client.post(
                "/api/curation/analyze-folder", json={"path": FOLDER},
                headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(404, response.status_code)


GEMINI_ENV = {
    "QRESP_GEMINI_ENABLED": "1",
    "QRESP_GEMINI_API_KEY": "test-gemini-super-secret",
    "QRESP_GEMINI_MODEL": "gemini-test",
}

AI_ITEMS = [
    {
        "id": "script-0",
        "kind": "script",
        "name": "scripts/plot_vdos.py",
        "paths": ["scripts/plot_vdos.py"],
        "inventory": {"file_count": 1,
                      "extensions": [{"extension": ".py", "count": 1}],
                      "sample_names": ["plot_vdos.py"]},
        # Structured, boundary-confined evidence, which replaced the old
        # free-text `context` field. See test_curation_evidence.py.
        "sources": [
            {"type": "docstring", "path": "scripts/plot_vdos.py",
             "excerpt": "Plot the vibrational density of states."},
        ],
    },
]


def gemini_reply(items):
    return {"candidates": [{"content": {"parts": [
        {"text": json.dumps({"items": items})}]}}]}


class MockResponse:
    def __init__(self, payload, status_code=200, text=""):
        self._payload = payload
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._payload


class DescribeCandidatesBase(CurationTestBase):
    def setUp(self):
        super().setUp()
        for key, value in GEMINI_ENV.items():
            os.environ[key] = value

    def tearDown(self):
        for key in GEMINI_ENV:
            os.environ.pop(key, None)
        from project.models import AssistUsage
        AssistUsage.drop_collection()
        super().tearDown()

    def describe(self, payload, reply=None, csrf=True):
        headers = {}
        if csrf and getattr(self, "csrf", None):
            headers["X-CSRF-Token"] = self.csrf
        with mock.patch("project.assist.requests") as requests_mock:
            requests_mock.post.return_value = (
                reply if reply is not None
                else MockResponse(gemini_reply([
                    {"id": "script-0", "description": "Plots the VDOS.",
                     "keywords": ["VDOS"]}])))
            response = self.client.post(
                "/api/curation/describe-candidates", json=payload,
                headers=headers)
        return response, requests_mock


class TestDescribeCandidatesGating(DescribeCandidatesBase):
    def test_anonymous_rejected(self):
        response, requests_mock = self.describe(
            {"consent": True, "items": AI_ITEMS}, csrf=False)
        self.assertEqual(401, response.status_code)
        requests_mock.post.assert_not_called()

    def test_missing_csrf_rejected(self):
        self.login()
        response, requests_mock = self.describe(
            {"consent": True, "items": AI_ITEMS}, csrf=False)
        self.assertEqual(403, response.status_code)
        requests_mock.post.assert_not_called()

    def test_consent_is_required(self):
        # Omitting it never reaches the handler: the spec marks it required.
        self.login()
        response, requests_mock = self.describe({"items": AI_ITEMS})
        self.assertEqual(400, response.status_code)
        requests_mock.post.assert_not_called()

    def test_consent_false_is_not_consent(self):
        self.login()
        response, requests_mock = self.describe(
            {"consent": False, "items": AI_ITEMS})
        self.assertEqual(400, response.status_code)
        self.assertIn("Confirm", response.json()["error"])
        requests_mock.post.assert_not_called()

    def test_unconfigured_provider_reports_503_without_calling_out(self):
        for key in GEMINI_ENV:
            os.environ.pop(key, None)
        self.login()
        response, requests_mock = self.describe(
            {"consent": True, "items": AI_ITEMS})
        self.assertEqual(503, response.status_code)
        self.assertIn("not configured", response.json()["error"])
        requests_mock.post.assert_not_called()

    def test_folder_analysis_still_works_without_gemini(self):
        # The deterministic path must never depend on the AI provider.
        for key in GEMINI_ENV:
            os.environ.pop(key, None)
        self.login()
        response, _, _ = self.analyze()
        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["candidates"]["charts"])

    def test_quota_is_enforced(self):
        os.environ["QRESP_GEMINI_MAX_REQUESTS_PER_USER_PER_DAY"] = "1"
        try:
            self.login()
            first, _ = self.describe({"consent": True, "items": AI_ITEMS})
            self.assertEqual(200, first.status_code)
            second, requests_mock = self.describe(
                {"consent": True, "items": AI_ITEMS})
            self.assertEqual(429, second.status_code)
            requests_mock.post.assert_not_called()
        finally:
            os.environ.pop("QRESP_GEMINI_MAX_REQUESTS_PER_USER_PER_DAY", None)


class TestDescribeCandidatesPayload(DescribeCandidatesBase):
    def sent_payload(self, items):
        self.login()
        _, requests_mock = self.describe({"consent": True, "items": items})
        body = requests_mock.post.call_args.kwargs["json"]
        return json.loads(body["contents"][0]["parts"][0]["text"]), body

    def sent_item(self, item):
        payload, body = self.sent_payload([item])
        return payload["artifact"], body

    def test_only_allowlisted_fields_travel(self):
        payload, _ = self.sent_payload([dict(
            AI_ITEMS[0],
            email="curator@example.com",
            owner="someone",
            absolute_path="/etc/passwd",
            file_bytes="\x00\x01binary",
            api_key="secret",
        )])
        # The payload is the evidence bundle: the paper as background, the
        # artifact, and the artifact's own sources. Nothing else.
        self.assertEqual({"paper_context", "artifact", "sources"},
                         set(payload))
        serialized = json.dumps(payload)
        self.assertNotIn("curator@example.com", serialized)
        self.assertNotIn("someone", serialized)
        self.assertNotIn("/etc/passwd", serialized)
        self.assertNotIn("binary", serialized)
        self.assertNotIn("secret", serialized)

    def test_absolute_and_external_paths_are_dropped(self):
        payload, _ = self.sent_payload([dict(
            AI_ITEMS[0],
            paths=["scripts/ok.py", "/etc/shadow", "https://evil.com/x"])])
        self.assertEqual(["scripts/ok.py"], payload["artifact"]["paths"])

    def test_the_evidence_bundle_is_bounded(self):
        payload, _ = self.sent_payload([dict(
            AI_ITEMS[0],
            sources=[{"type": "readme", "path": "a/README.md",
                      "excerpt": "x" * 99999}] * 50)])
        sources = payload["sources"]
        self.assertLessEqual(len(sources), curation.MAX_AI_SOURCES)
        self.assertLessEqual(
            sum(len(source["excerpt"]) for source in sources),
            curation.MAX_AI_EVIDENCE_CHARS)

    def test_more_than_one_item_is_refused_before_anything_happens(self):
        self.login()
        response, requests_mock = self.describe({
            "consent": True,
            "items": [dict(AI_ITEMS[0], id="script-%d" % i) for i in range(2)],
        })
        # Connexion enforces maxItems from swagger.yml before the handler is
        # even entered, so the rejection shape is the spec's, not ours. Either
        # way it is a 400 and the provider was never called.
        self.assertEqual(400, response.status_code)
        requests_mock.post.assert_not_called()

    def test_zero_items_is_refused_the_same_way(self):
        self.login()
        response, requests_mock = self.describe(
            {"consent": True, "items": []})
        self.assertEqual(400, response.status_code)
        requests_mock.post.assert_not_called()

    def test_one_item_is_the_whole_contract(self):
        payload, _ = self.sent_payload([AI_ITEMS[0]])
        self.assertIn("artifact", payload)
        self.assertNotIn("items", payload)
        self.assertEqual(payload["artifact"]["id"], AI_ITEMS[0]["id"])

    def test_unknown_kinds_are_refused(self):
        self.login()
        response, requests_mock = self.describe(
            {"consent": True,
             "items": [dict(AI_ITEMS[0], kind="experiment")]})
        self.assertEqual(400, response.status_code)
        requests_mock.post.assert_not_called()

    def test_structured_output_and_header_auth(self):
        _, body = self.sent_payload([AI_ITEMS[0]])
        self.assertEqual(curation.AI_RESPONSE_SCHEMA,
                         body["generationConfig"]["responseSchema"])
        self.assertEqual("application/json",
                         body["generationConfig"]["responseMimeType"])
        # No tools/grounding/search/code execution are ever requested.
        for forbidden in ("tools", "toolConfig", "safetySettings"):
            self.assertNotIn(forbidden, body)


class TestDescribeCandidatesResponse(DescribeCandidatesBase):
    def test_suggestions_are_returned_for_review(self):
        self.login()
        response, _ = self.describe({"consent": True, "items": AI_ITEMS})
        self.assertEqual(200, response.status_code)
        suggestions = response.json()["suggestions"]
        self.assertEqual("Plots the VDOS.",
                         suggestions["script-0"]["description"])
        self.assertEqual(["VDOS"], suggestions["script-0"]["keywords"])

    def test_ids_that_were_never_sent_are_discarded(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "ok", "keywords": []},
                {"id": "smuggled", "description": "not requested",
                 "keywords": []}])))
        self.assertEqual(["script-0"], list(response.json()["suggestions"]))

    def test_tools_get_a_description_but_never_keywords(self):
        # Qresp has no keyword field on a Tool, so shipping keywords for one
        # would only invite the UI to invent a home for them.
        self.login()
        response, _ = self.describe(
            {"consent": True,
             # A Tool's own evidence: it cannot carry the Script fixture's
             # docstring, and a bundle filtered to nothing would (correctly)
             # abstain before the provider is reached.
             "items": [dict(AI_ITEMS[0], id="tool-0", kind="tool",
                            name="numpy 1.26.4",
                            sources=[{"type": "manifest",
                                      "path": "tools/numpy/requirements.txt",
                                      "excerpt": "numpy==1.26.4"}])]},
            reply=MockResponse(gemini_reply([
                {"id": "tool-0", "description": "Array library.",
                 "keywords": ["arrays", "numerics"]}])))
        suggestion = response.json()["suggestions"]["tool-0"]
        self.assertEqual("Array library.", suggestion["description"])
        self.assertEqual([], suggestion["keywords"])

    def test_only_descriptive_fields_can_come_back(self):
        # The schema has no room for factual fields, so a model that tries to
        # set one cannot reach the curator.
        properties = curation.AI_RESPONSE_SCHEMA["properties"]["items"]
        # id + the reviewable, non-factual suggestions + how well supported.
        self.assertEqual(
            {"id", "description", "keywords", "kind", "confidence", "reason"},
            set(properties["items"]["properties"]))
        # `kind` is an enum of the four record types, so it cannot become a
        # free-text field either.
        self.assertEqual(["chart", "dataset", "script", "tool"],
                         properties["items"]["properties"]["kind"]["enum"])
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "ok", "keywords": [],
                 "files": ["invented.py"], "packageName": "fake",
                 "version": "9.9", "number": 3, "imageFile": "fake.png"}])))
        self.assertEqual(
            {"description", "keywords", "kind", "confidence", "reason"},
            set(response.json()["suggestions"]["script-0"]))

    def test_ai_confidence_can_never_reach_high(self):
        # Only direct deterministic evidence is "high"; a model claiming it
        # would put a guess on the same footing as a detected file path.
        self.login()
        for claimed in ("high", "HIGH", "certain", "", None, 99):
            response, _ = self.describe(
                {"consent": True, "items": AI_ITEMS},
                reply=MockResponse(gemini_reply([
                    {"id": "script-0", "description": "d", "keywords": [],
                     "confidence": claimed}])))
            got = response.json()["suggestions"]["script-0"]["confidence"]
            self.assertIn(got, ("medium", "low"), claimed)

    def test_ai_confidence_and_reason_are_passed_through_bounded(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "d", "keywords": [],
                 "confidence": "medium", "reason": "r" * 999}])))
        suggestion = response.json()["suggestions"]["script-0"]
        self.assertEqual("medium", suggestion["confidence"])
        self.assertEqual(200, len(suggestion["reason"]))

    def test_a_differing_kind_comes_back_as_a_note(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "d", "keywords": [],
                 "kind": "dataset"}])))
        self.assertEqual("dataset",
                         response.json()["suggestions"]["script-0"]["kind"])

    def test_agreeing_with_qresp_is_not_reported_as_a_change(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "d", "keywords": [],
                 "kind": "script"}])))
        self.assertEqual("", response.json()["suggestions"]["script-0"]["kind"])

    def test_an_invented_kind_is_dropped(self):
        self.login()
        for invented in ("experiment", "paper", "<script>", "", None):
            response, _ = self.describe(
                {"consent": True, "items": AI_ITEMS},
                reply=MockResponse(gemini_reply([
                    {"id": "script-0", "description": "d", "keywords": [],
                     "kind": invented}])))
            self.assertEqual(
                "", response.json()["suggestions"]["script-0"]["kind"],
                invented)

    def test_the_kind_note_never_touches_a_factual_field(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "d", "keywords": [],
                 "kind": "chart", "imageFile": "invented.png",
                 "files": ["invented.py"], "number": 3}])))
        self.assertEqual(
            {"description", "keywords", "kind", "confidence", "reason"},
            set(response.json()["suggestions"]["script-0"]))

    def test_insufficient_evidence_yields_a_blank_description(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "", "keywords": []}])))
        self.assertEqual("",
                         response.json()["suggestions"]["script-0"]["description"])

    def test_malformed_provider_answer_is_a_clean_502(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse({"candidates": [{"content": {"parts": [
                {"text": "I am not JSON at all"}]}}]}))
        self.assertEqual(502, response.status_code)
        self.assertIn("unreadable", response.json()["error"])

    def test_provider_error_details_never_leak(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse({"error": {"message": "invalid api key abc123"}},
                               status_code=403, text="invalid api key abc123"))
        self.assertEqual(502, response.status_code)
        self.assertNotIn("abc123", response.text)
        self.assertNotIn("api key", response.text.lower())

    def test_the_api_key_never_appears_in_a_response_or_log(self):
        self.login()
        with mock.patch("builtins.print") as printed:
            response, _ = self.describe({"consent": True, "items": AI_ITEMS})
        logged = " ".join(str(call.args[0]) for call in printed.call_args_list
                          if call.args)
        self.assertNotIn("test-gemini-super-secret", logged)
        self.assertNotIn("test-gemini-super-secret", response.text)

    def test_descriptions_are_bounded(self):
        self.login()
        response, _ = self.describe(
            {"consent": True, "items": AI_ITEMS},
            reply=MockResponse(gemini_reply([
                {"id": "script-0", "description": "y" * 9999,
                 "keywords": ["k"] * 99}])))
        suggestion = response.json()["suggestions"]["script-0"]
        self.assertEqual(curation.MAX_AI_DESCRIPTION_CHARS,
                         len(suggestion["description"]))
        self.assertLessEqual(len(suggestion["keywords"]), 8)

    def test_nothing_is_persisted_beyond_the_usage_counter(self):
        self.login()
        before = Paper.objects.count()
        self.describe({"consent": True, "items": AI_ITEMS})
        self.assertEqual(before, Paper.objects.count())


if __name__ == "__main__":
    unittest.main()


class TestAnalysisCarriesNoSourceDetection(CurationTestBase):
    """The folder analysis an import needs, and nothing the detector added.

    Workflows are built by the curator now -- Add or link, the editor, manual
    entry -- so the analysis no longer reads every script to report what it
    reads and writes. It still classifies the folder exactly as it did.
    """

    SOURCES = dict(TEXTS, **{
        "scripts/plot_vdos.py":
            '"""Plot the vibrational density of states."""\n'
            "import numpy as np\n"
            "np.loadtxt('data/VDOS/vdos.dat')\n",
        "scripts/run.sh":
            "#!/bin/bash\n"
            "python scripts/plot_vdos.py\n",
    })

    def test_the_import_candidates_are_all_still_there(self):
        self.login()
        response, _, _ = self.analyze(texts=self.SOURCES)
        self.assertEqual(200, response.status_code)
        found = response.json()["candidates"]
        # The four kinds an import creates, from a folder that has them.
        self.assertTrue(found["charts"])
        self.assertTrue(found["datasets"])
        self.assertTrue(found["scripts"])
        for kind in ("charts", "datasets", "scripts", "tools"):
            self.assertIn(kind, found)

    def test_the_detector_fields_are_gone(self):
        # A browser holding an older cached analysis simply finds them
        # absent; there is nothing to migrate, because nothing reads them.
        self.login()
        response, _, _ = self.analyze(texts=self.SOURCES)
        body = response.json()
        for field in ("code_links", "shell_calls", "code_scan"):
            self.assertNotIn(field, body)

    def test_the_parser_module_is_gone(self):
        with self.assertRaises(ImportError):
            __import__("project.codelinks")

    def test_no_script_source_is_read_for_its_file_io(self):
        # The scripts are still fetched when they are a candidate's own
        # evidence. What is gone is the second pass that read every one of
        # them in order to parse it.
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            response, _, _ = self.analyze(texts=self.SOURCES)
        self.assertEqual(200, response.status_code)
        gemini.assert_not_called()

    def test_the_detector_endpoints_are_gone(self):
        self.login()
        response = self.client.post(
            "/api/curation/suggest-connections",
            json={"path": FOLDER, "script": {"id": "s0", "sources": []}},
            headers={"X-CSRF-Token": self.csrf},
        )
        self.assertEqual(404, response.status_code)
