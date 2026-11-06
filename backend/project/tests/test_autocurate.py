import unittest

from project import autocurate as ac


def chart(cid, image):
    return {"id": cid, "kind": "chart", "proposal": {"imageFile": image}}


def boundary(kind, cid, path):
    return {"id": cid, "kind": kind, "proposal": {"files": [path]}}


# Shaped like a real RCC paper folder (10.1038/s41524-025-01558-w).
FILES = [
    "Figures_Tables/Figure1.pdf",
    "Figures_Tables/Figure2.pdf",
    "Figures_Tables/Figure4.pdf",
    "Figures_Tables/SI_Figure3.pdf",
    "Figures_Tables/Table1.png",
    "Data/Figure_2_data/NV/energies.dat",
    "Data/Figure_4_data/singlet_ccd_qeff",
    "Data/Figure_4_data/input.dat",
    "Data/SI_data/input.dat",
    "Scripts/ccd_qeff.py",
    "Scripts/plot_figure1.py",
    "Scripts/unrelated.py",
]

RESULT = {
    "charts": [
        chart("chart-0", "Figures_Tables/Figure1.pdf"),
        chart("chart-1", "Figures_Tables/Figure2.pdf"),
        chart("chart-2", "Figures_Tables/Figure4.pdf"),
        chart("chart-3", "Figures_Tables/SI_Figure3.pdf"),
        chart("chart-4", "Figures_Tables/Table1.png"),
    ],
    "datasets": [
        boundary("dataset", "dataset-0", "Data/Figure_2_data"),
        boundary("dataset", "dataset-1", "Data/Figure_4_data"),
        boundary("dataset", "dataset-2", "Data/SI_data"),
    ],
    "scripts": [
        boundary("script", "script-0", "Scripts/ccd_qeff.py"),
        boundary("script", "script-1", "Scripts/plot_figure1.py"),
        boundary("script", "script-2", "Scripts/unrelated.py"),
    ],
}

TEXTS = {
    "Scripts/ccd_qeff.py": (
        "import numpy as np\n"
        "gs = np.loadtxt('./singlet_ccd_qeff', skiprows=1)\n"
        "other = np.loadtxt('input.dat')\n"
    ),
    "Scripts/plot_figure1.py": "plt.savefig('out.png')\n",
    "Scripts/unrelated.py": "print('hello world')\n",
}


def links_of(result):
    return {(l["from"], l["to"], l["type"]): l
            for l in result["links"]}


class FigureNumberTest(unittest.TestCase):
    def test_numbers_from_file_names(self):
        cases = {
            "Figures_Tables/Figure1.pdf": "1",
            "SI_Figure3.pdf": "S3",
            "FigureS3.png": "S3",
            "figure-S1.png": "S1",
            "fig_2b.png": "2b",
            "Table1.png": "Table 1",
            "SI_Table10.png": "Table S10",
            "Figure2edited.png": "2",
        }
        for path, expected in cases.items():
            self.assertEqual(expected, ac.suggest_number(path), path)

    def test_no_number_without_a_figure_label(self):
        for path in ("config2.py", "photolumin.py", "plot.png", "SI_data"):
            self.assertEqual("", ac.suggest_number(path), path)


class SuggestionsTest(unittest.TestCase):
    def setUp(self):
        self.out = ac.suggestions(RESULT, FILES, TEXTS)
        self.links = links_of(self.out)

    def test_every_numbered_image_gets_a_number(self):
        self.assertEqual(
            {"chart-0": "1", "chart-1": "2", "chart-2": "4", "chart-3": "S3",
             "chart-4": "Table 1"},
            self.out["numbers"])

    def test_data_folder_named_after_a_figure_feeds_it(self):
        link = self.links[("dataset-0", "chart-1", ac.CONSUMES)]
        self.assertEqual(ac.HIGH, link["confidence"])
        self.assertIn("Figure_2_data", link["reason"])
        self.assertIn(("dataset-1", "chart-2", ac.CONSUMES), self.links)

    def test_script_reading_a_unique_data_file_consumes_that_dataset(self):
        link = self.links[("dataset-1", "script-0", ac.CONSUMES)]
        self.assertIn("singlet_ccd_qeff", link["reason"])

    def test_an_ambiguous_file_name_links_nothing(self):
        # input.dat is in two datasets, so it cannot say which one is read.
        self.assertNotIn(("dataset-2", "script-0", ac.CONSUMES), self.links)

    def test_script_reading_a_figures_data_probably_generates_it(self):
        link = self.links[("script-0", "chart-2", ac.GENERATES)]
        self.assertEqual(ac.MEDIUM, link["confidence"])

    def test_script_named_after_a_figure_generates_it(self):
        link = self.links[("script-1", "chart-0", ac.GENERATES)]
        self.assertEqual(ac.HIGH, link["confidence"])

    def test_unrelated_scripts_and_data_get_no_links(self):
        self.assertFalse([k for k in self.links if "script-2" in k])
        self.assertFalse([k for k in self.links if "dataset-2" in k])

    def test_every_link_explains_itself(self):
        for link in self.out["links"]:
            self.assertTrue(link["reason"])
            self.assertIn(link["confidence"], (ac.HIGH, ac.MEDIUM))

    def test_empty_analysis(self):
        self.assertEqual({"numbers": {}, "links": []},
                         ac.suggestions({}, [], {}))


if __name__ == "__main__":
    unittest.main()
