import json
from unittest import mock

from project import repoanalysis as ra
from project.tests.test_curation import CurationTestBase

SHA = "a" * 40

NOTEBOOK = json.dumps({"cells": [
    {"cell_type": "markdown", "source": ["# Phonons"]},
    {"cell_type": "code", "source": [
        "import numpy as np\n", "import seaborn as sns\n",
        "fig.savefig('results/phonons.png')\n"]},
]})

FILES = [
    "README.md",
    "requirements.txt",
    "setup.py",
    "mycode/__init__.py",
    "mycode/solver.py",
    "analysis/plot_bands.py",
    "analysis/make_dos.py",
    "analysis/helpers.py",
    "notebooks/phonons.ipynb",
    "paper/fig2_bands.pdf",
    "paper/dos_300K.png",
    "paper/dos_600K.png",
    "results/phonons.png",
    "results/unrelated.png",
    "docs/images/screenshot-ui.png",
    "docs/_static/logo.png",
    "data/si_bands.dat",
    "data/lattice.csv",
    "tests/baseline.png",
    "tests/test_solver.py",
    ".github/workflows/ci.yml",
]

TEXTS = {
    "requirements.txt": "numpy==1.26.4\nmatplotlib>=3.8\nscipy\n",
    "analysis/plot_bands.py": (
        '"""Silicon band structure (Figure 2)."""\n'
        "import numpy as np\n"
        "import matplotlib.pyplot as plt\n"
        "from mycode import solver\n"
        "bands = np.loadtxt('../data/si_bands.dat')\n"
        "plt.savefig('../paper/fig2_bands.pdf')\n"),
    "analysis/make_dos.py": (
        "import matplotlib.pyplot as plt\n"
        "from mpl_toolkits.mplot3d import Axes3D\n"
        "for T in (300, 600):\n"
        "    plt.savefig(f'../paper/dos_{T}K.png')\n"),
    "analysis/helpers.py": "import scipy\nx = 'lattice.csv'\n",
    "notebooks/phonons.ipynb": NOTEBOOK,
    "mycode/solver.py": "import numpy\n",
}

REPO = {"name": "mycode", "version": "v1.2.0",
        "url": "https://github.com/org/mycode"}


def by_label(groups, kind):
    return {c["label"]: c for c in groups[kind]}


class TestParseRepoUrl(CurationTestBase):
    def test_usual_ways_of_writing_a_repository(self):
        for raw in ("https://github.com/org/mycode",
                    "github.com/org/mycode/tree/main/src",
                    "https://www.github.com/org/mycode.git",
                    "git@github.com:org/mycode.git"):
            self.assertEqual(("github.com", "org/mycode"),
                             ra.parse_repo_url(raw), raw)
        self.assertEqual(("gitlab.com", "group/sub/proj"),
                         ra.parse_repo_url(
                             "https://gitlab.com/group/sub/proj/-/tree/main"))

    def test_other_hosts_and_unsafe_paths_are_refused(self):
        for raw in ("", "https://example.org/org/repo", "https://github.com/org",
                    "https://user:pw@github.com/org/repo",
                    "https://github.com:8443/org/repo",
                    "https://github.com/org/re po",
                    "https://gitlab.com/../etc/-/tree"):
            with self.assertRaises(ra.RepoError, msg=raw):
                ra.parse_repo_url(raw)


class TestFigureFirst(CurationTestBase):
    def setUp(self):
        super().setUp()
        self.groups, self.suggestions, self.notes = ra.analyze_repo_tree(
            FILES, TEXTS, REPO)
        self.ids = {c["label"]: c["id"] for kind in self.groups.values()
                    for c in kind}
        self.links = {(l["from"], l["to"], l["type"]): l
                      for l in self.suggestions["links"]}

    def link(self, source, target, kind):
        return self.links.get((self.ids[source], self.ids[target], kind))

    def test_every_png_and_pdf_is_a_figure(self):
        charts = by_label(self.groups, "charts")
        for path in ("paper/fig2_bands.pdf", "paper/dos_300K.png",
                     "paper/dos_600K.png", "results/phonons.png",
                     "results/unrelated.png", "docs/images/screenshot-ui.png"):
            self.assertIn(path, charts)
        # Logos, CI and test baselines are not figures.
        for path in ("docs/_static/logo.png", "tests/baseline.png"):
            self.assertNotIn(path, charts)

    def test_a_script_that_saves_a_figure_is_linked_to_it(self):
        self.assertEqual("high", self.link(
            "analysis/plot_bands.py", "paper/fig2_bands.pdf", "generates")["confidence"])

    def test_names_built_with_placeholders_match(self):
        for figure in ("paper/dos_300K.png", "paper/dos_600K.png"):
            self.assertIsNotNone(self.link("analysis/make_dos.py", figure, "generates"))

    def test_notebooks_are_read_for_their_code(self):
        self.assertIsNotNone(self.link(
            "notebooks/phonons.ipynb", "results/phonons.png", "generates"))
        # The notebook that makes a figure is its notebook file.
        chart = by_label(self.groups, "charts")["results/phonons.png"]
        self.assertEqual("notebooks/phonons.ipynb", chart["proposal"]["notebookFile"])

    def test_figure_numbers_come_from_file_names(self):
        chart = by_label(self.groups, "charts")["paper/fig2_bands.pdf"]
        self.assertEqual("2", chart["proposal"]["number"])

    def test_what_nothing_writes_is_listed_but_not_selected(self):
        charts = by_label(self.groups, "charts")
        self.assertTrue(charts["paper/fig2_bands.pdf"]["selected"])
        self.assertFalse(charts["docs/images/screenshot-ui.png"]["selected"])
        scripts = by_label(self.groups, "scripts")
        self.assertTrue(scripts["analysis/plot_bands.py"]["selected"])
        self.assertFalse(scripts["analysis/helpers.py"]["selected"])
        # Library modules and setup are not scripts.
        self.assertNotIn("setup.py", scripts)
        self.assertNotIn("mycode/__init__.py", scripts)

    def test_data_a_figure_script_reads_feeds_it(self):
        datasets = by_label(self.groups, "datasets")
        self.assertTrue(datasets["data/si_bands.dat"]["selected"])
        self.assertIsNotNone(self.link(
            "data/si_bands.dat", "analysis/plot_bands.py", "consumes"))
        # Read only by a script that makes no figure: listed, not selected.
        self.assertFalse(datasets["data/lattice.csv"]["selected"])

    def test_tools_are_what_the_figure_scripts_import(self):
        tools = by_label(self.groups, "tools")
        self.assertIn("mycode v1.2.0", tools)
        self.assertIn("numpy 1.26.4", tools)
        # A range is kept as stated; mpl_toolkits is matplotlib, listed once.
        self.assertIn("matplotlib >=3.8", tools)
        self.assertEqual(1, sum(1 for label in tools if label.startswith("matplotlib")))
        # No version declared: listed, version left to fill in.
        self.assertEqual("", tools["seaborn"]["proposal"]["version"])
        self.assertIn("version", tools["seaborn"]["needs_input"])
        # The repository's own package is not a dependency of itself.
        self.assertNotIn("solver", tools)
        self.assertTrue(tools["matplotlib >=3.8"]["selected"])
        self.assertFalse(tools["scipy"]["selected"])

    def test_tools_link_to_the_scripts_that_use_them(self):
        self.assertIsNotNone(self.link(
            "numpy 1.26.4", "analysis/plot_bands.py", "uses_tool"))
        self.assertIsNotNone(self.link(
            "matplotlib >=3.8", "analysis/make_dos.py", "uses_tool"))
        self.assertIsNotNone(self.link(
            "mycode v1.2.0", "analysis/plot_bands.py", "uses_tool"))

    def test_tests_and_tooling_are_left_out(self):
        paths = [p for kind in self.groups.values() for c in kind for p in c["paths"]]
        for left_out in ("tests/test_solver.py", ".github/workflows/ci.yml"):
            self.assertNotIn(left_out, paths)
        self.assertTrue(any("test file" in note for note in self.notes))

    def test_a_folder_that_moved_still_matches_by_name_with_lower_confidence(self):
        texts = dict(TEXTS, **{"analysis/plot_bands.py":
                               "plt.savefig('../output/fig2_bands.pdf')\n"})
        groups, suggestions, _n = ra.analyze_repo_tree(FILES, texts, REPO)
        ids = {c["label"]: c["id"] for kind in groups.values() for c in kind}
        link = [l for l in suggestions["links"]
                if l["from"] == ids["analysis/plot_bands.py"]
                and l["to"] == ids["paper/fig2_bands.pdf"]][0]
        self.assertEqual("medium", link["confidence"])

    def test_a_common_name_does_not_link_everything(self):
        files = FILES + ["run%d/out.png" % i for i in range(10)]
        texts = dict(TEXTS, **{"analysis/helpers.py": "plt.savefig('out.png')\n"})
        groups, suggestions, _n = ra.analyze_repo_tree(files, texts, REPO)
        helper = by_label(groups, "scripts")["analysis/helpers.py"]
        self.assertFalse([l for l in suggestions["links"] if l["from"] == helper["id"]
                          and l["type"] == "generates"])

    def test_a_truncated_notebook_still_gives_its_code(self):
        cut = NOTEBOOK[: NOTEBOOK.index("results/phonons.png") + 30]
        self.assertIn("savefig", ra.script_code("x.ipynb", cut))

    def test_no_release_leaves_the_version_to_the_curator(self):
        groups, _s, _n = ra.analyze_repo_tree(FILES, TEXTS, dict(REPO, version=""))
        tool = groups["tools"][0]
        self.assertEqual("", tool["proposal"]["version"])
        self.assertIn("version", tool["needs_input"])

    def test_reads_manifests_first_then_likely_plotting_scripts(self):
        plan = ra.plan_repo_reads(FILES)
        self.assertEqual("requirements.txt", plan[0])
        self.assertLess(plan.index("analysis/plot_bands.py"),
                        plan.index("analysis/helpers.py"))
        self.assertNotIn("tests/test_solver.py", plan)
        # requirements.txt and setup.py, then at most 2 scripts.
        self.assertEqual(4, len(ra.plan_repo_reads(FILES, limit=2)))


def fake_github(path):
    return {"host": "github", "path": path, "name": "mycode",
            "url": "https://github.com/" + path, "branch": "main",
            "commit": SHA, "version": "v1.2.0", "files": FILES,
            "truncated": False,
            "files_base": "https://github.com/%s/blob/%s" % (path, SHA),
            "raw_base": "https://raw.githubusercontent.com/%s/%s" % (path, SHA)}


class TestAnalyzeRepoUrl(CurationTestBase):
    def test_pins_every_read_and_link_to_one_commit(self):
        read = []

        def read_text(url):
            read.append(url)
            return TEXTS.get(url.split(SHA + "/", 1)[1], "")

        out = ra.analyze_repo_url("https://github.com/org/mycode",
                                  fetchers={"github.com": fake_github},
                                  read_text=read_text)
        self.assertEqual("https://github.com/org/mycode/blob/" + SHA,
                         out["root"])
        self.assertEqual(SHA, out["repo"]["commit"])
        self.assertTrue(read)
        for url in read:
            self.assertTrue(url.startswith(
                "https://raw.githubusercontent.com/org/mycode/%s/" % SHA), url)
        # The same candidate format as the folder analysis.
        self.assertTrue(out["candidates"]["charts"])
        self.assertEqual({"charts", "datasets", "scripts", "tools"},
                         set(out["candidates"]))
        self.assertIn("links", out["suggestions"])

    def test_an_unreadable_file_costs_only_its_own_evidence(self):
        def read_text(url):
            raise RuntimeError("boom")

        out = ra.analyze_repo_url("github.com/org/mycode",
                                  fetchers={"github.com": fake_github},
                                  read_text=read_text)
        # Nothing was readable: the images are still listed.
        self.assertTrue(out["candidates"]["charts"])


class TestAnalyzeRepoEndpoint(CurationTestBase):
    def post(self, url="https://github.com/org/mycode", csrf=True):
        headers = ({"X-CSRF-Token": self.csrf}
                   if csrf and getattr(self, "csrf", None) else {})
        with mock.patch.dict(ra.FETCHERS, {"github.com": fake_github}), \
                mock.patch("project.repoanalysis._read_text",
                           side_effect=lambda url: ""):
            return self.client.post("/api/curation/analyze-repo",
                                    json={"url": url}, headers=headers)

    def test_requires_sign_in(self):
        self.assertEqual(401, self.post(csrf=False).status_code)

    def test_requires_csrf(self):
        self.login()
        self.assertEqual(403, self.post(csrf=False).status_code)

    def test_analyzes_a_repository(self):
        self.login()
        response = self.post()
        self.assertEqual(200, response.status_code)
        self.assertEqual(SHA, response.json()["repo"]["commit"])

    def test_other_hosts_are_a_400_without_any_request(self):
        self.login()
        with mock.patch("project.repoanalysis.requests.get") as get:
            response = self.post(url="https://example.org/org/repo")
        self.assertEqual(400, response.status_code)
        get.assert_not_called()
