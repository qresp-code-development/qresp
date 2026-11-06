import base64
import gzip
import io
import tarfile
import unittest
import zipfile
from unittest import mock

from project import latex as L
from project.tests.test_curation import CurationTestBase

MAIN = r"""
\documentclass{article}
\begin{document}
% \begin{figure}\includegraphics{commented}\caption{Never}\end{figure}
\input{sections/results}
\begin{table}
\caption{Optical properties of the NV$^-$ defect (see Ref.~\cite{x}).}
\label{tab:optical}
\end{table}
\end{document}
"""

RESULTS = r"""
\begin{figure*}[t]
  \centering
  \includegraphics[width=\textwidth]{figures/Figure1}
  \caption[Short]{\justifying \textbf{Screening} of spin defects in MgO, $\alpha \times 2$.}
  \label{fig:screen}
\end{figure*}
\begin{figure}
  \includegraphics{Figure2.pdf}
  \caption{Ground state \textcolor{red}{properties}.}
\end{figure}
"""

SI = r"""
\documentclass{article}
\captionsetup[figure]{name=Supplementary Figure}
\captionsetup[table]{name=Supplementary Table}
\renewcommand{\thetable}{\arabic{table}}
\begin{document}
\begin{figure}\includegraphics{mo_diagram}\caption{Molecular orbital diagram.}\end{figure}
\begin{table}\caption{Band gaps of MgO.}\end{table}
\end{document}
"""

TEXTS = {"main.tex": MAIN, "sections/results.tex": RESULTS, "si.tex": SI}


def zipped(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)
        archive.writestr("figures/Figure1.pdf", b"%PDF-1.4 not text")
    return buffer.getvalue()


def tarred(files):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name, text in files.items():
            data = text.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class ExtractTest(unittest.TestCase):
    def setUp(self):
        self.main, self.figures = L.extract_figures(TEXTS)
        self.by_number = {(f["kind"], f["number"]): f for f in self.figures}

    def test_main_document_and_inputs_in_order(self):
        self.assertEqual("main.tex", self.main)
        self.assertEqual(
            [("figure", "1"), ("figure", "2"), ("table", "1"),
             ("figure", "S1"), ("table", "S1")],
            [(f["kind"], f["number"]) for f in self.figures])

    def test_commented_out_figures_are_ignored(self):
        self.assertFalse(any("Never" in f["caption"] for f in self.figures))

    def test_caption_is_plain_text(self):
        caption = self.by_number[("figure", "1")]["caption"]
        self.assertEqual("Screening of spin defects in MgO, α × 2.", caption)
        self.assertEqual("Ground state properties.", self.by_number[("figure", "2")]["caption"])
        self.assertEqual("Optical properties of the NV^- defect (see Ref.).",
                         self.by_number[("table", "1")]["caption"])

    def test_graphics_and_label(self):
        figure = self.by_number[("figure", "1")]
        self.assertEqual(["figures/Figure1"], figure["graphics"])
        self.assertEqual("fig:screen", figure["label"])

    def test_supplementary_document_numbers_with_s(self):
        self.assertEqual("Molecular orbital diagram.",
                         self.by_number[("figure", "S1")]["caption"])
        self.assertEqual("Band gaps of MgO.", self.by_number[("table", "S1")]["caption"])

    def test_explicit_prefix_in_main_document(self):
        texts = {"main.tex": r"""\documentclass{x}\begin{document}
\begin{figure}\caption{A}\end{figure}
\appendix\setcounter{figure}{0}\renewcommand{\thefigure}{S\arabic{figure}}
\begin{figure}\caption{B}\end{figure}
\end{document}"""}
        _main, figures = L.extract_figures(texts)
        self.assertEqual(["1", "S1"], [f["number"] for f in figures])


class MatchTest(unittest.TestCase):
    def test_matches_by_file_then_by_number(self):
        _main, figures = L.extract_figures(TEXTS)
        charts = [
            {"id": "c0", "imageFile": "/Figures_Tables/Figure1.pdf", "number": "1"},
            {"id": "c1", "imageFile": "/Figures_Tables/Figure2.png", "number": ""},
            {"id": "c2", "imageFile": "/Figures_Tables/SI_Figure1.pdf", "number": "S1"},
            {"id": "c3", "imageFile": "/Figures_Tables/Table1.png", "number": "Table 1"},
            {"id": "c4", "imageFile": "/Figures_Tables/SI_Table1.png", "number": "Table S1"},
            {"id": "c5", "imageFile": "/Figures_Tables/other.png", "number": "9"},
        ]
        matches = {m["id"]: m for m in L.match_captions(figures, charts)}
        self.assertEqual("file", matches["c0"]["how"])
        self.assertEqual("file", matches["c1"]["how"])
        self.assertEqual("2", matches["c1"]["number"])
        self.assertEqual("number", matches["c2"]["how"])
        self.assertEqual("Optical properties of the NV^- defect (see Ref.).", matches["c3"]["caption"])
        self.assertEqual("Table S1", matches["c4"]["number"])
        self.assertNotIn("c5", matches)


class ReadSourceTest(unittest.TestCase):
    def test_zip_reads_only_tex(self):
        texts = L.read_source("paper.zip", zipped(TEXTS))
        self.assertEqual(set(TEXTS), set(texts))

    def test_tar_gz(self):
        texts = L.read_source("arxiv.tar.gz", tarred(TEXTS))
        self.assertEqual(set(TEXTS), set(texts))

    def test_gzipped_single_tex_like_arxiv(self):
        texts = L.read_source("arxiv.tar.gz", gzip.compress(MAIN.encode()))
        self.assertEqual(["main.tex"], list(texts))

    def test_plain_tex(self):
        self.assertIn("main.tex", L.read_source("main.tex", MAIN.encode()))

    def test_rejects_pdf_and_non_latex(self):
        with self.assertRaises(L.LatexError):
            L.read_source("paper.pdf", b"%PDF-1.4")
        with self.assertRaises(L.LatexError):
            L.read_source("notes.txt", b"just words")

    def test_archive_paths_cannot_escape(self):
        texts = L.read_source("x.zip", zipped({"../../etc/evil.tex": "\\x"}))
        self.assertEqual(["etc/evil.tex"], list(texts))


class ArxivIdTest(unittest.TestCase):
    def test_ids_and_links(self):
        cases = {
            "2409.00246": "2409.00246",
            "arXiv:2409.00246v2": "2409.00246v2",
            "https://arxiv.org/abs/2409.00246": "2409.00246",
            "https://arxiv.org/pdf/2409.00246v1.pdf": "2409.00246v1",
            "cond-mat/0601001": "cond-mat/0601001",
        }
        for raw, expected in cases.items():
            self.assertEqual(expected, L.arxiv_id(raw), raw)

    def test_non_arxiv(self):
        for raw in ("", "hello", "https://www.overleaf.com/read/abc",
                    "https://evil.example/2409.00246"):
            self.assertIsNone(L.arxiv_id(raw), raw)

    def test_title_normalization(self):
        self.assertEqual(L.normalize_title("An NV− center, in MgO!"),
                         L.normalize_title("An NV- Center in MgO"))


class EndpointTest(CurationTestBase):
    def post(self, path, body, csrf=True):
        headers = {"X-CSRF-Token": self.csrf} if csrf and getattr(self, "csrf", None) else {}
        return self.client.post(path, json=body, headers=headers)

    def test_requires_sign_in(self):
        self.assertEqual(401, self.post("/api/curation/latex-captions",
                                        {"arxiv": "2409.00246"}, csrf=False).status_code)

    def test_upload(self):
        self.login()
        response = self.post("/api/curation/latex-captions", {
            "filename": "paper.zip",
            "content_b64": base64.b64encode(zipped(TEXTS)).decode(),
            "charts": [{"id": "c0", "imageFile": "Figure2.pdf", "number": ""}],
        })
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual(5, len(body["figures"]))
        self.assertEqual([{"id": "c0", "caption": "Ground state properties.",
                           "number": "2", "label": "", "how": "file"}], body["matches"])

    def test_arxiv_fetch_is_mocked_and_used(self):
        self.login()
        with mock.patch("project.latex.fetch_arxiv", return_value=tarred(TEXTS)) as fetch:
            response = self.post("/api/curation/latex-captions", {"arxiv": "arXiv:2409.00246"})
        self.assertEqual(200, response.status_code, response.text)
        fetch.assert_called_once_with("2409.00246")
        self.assertEqual("arXiv:2409.00246", response.json()["source"])

    def test_overleaf_link_explains_how_to_download(self):
        self.login()
        response = self.post("/api/curation/latex-captions",
                             {"arxiv": "https://www.overleaf.com/project/abc"})
        self.assertEqual(400, response.status_code)
        self.assertIn("Download", response.json()["error"])

    def test_bad_upload_is_a_clean_400(self):
        self.login()
        response = self.post("/api/curation/latex-captions",
                             {"filename": "x.zip", "content_b64": base64.b64encode(b"PKnotazip").decode()})
        self.assertEqual(400, response.status_code)

    def test_find_arxiv(self):
        self.login()
        with mock.patch("project.latex.search_arxiv", return_value="2409.00246"):
            response = self.post("/api/curation/find-arxiv", {"title": "An NV- center in MgO"})
        self.assertEqual({"found": True, "arxiv": "2409.00246",
                          "url": "https://arxiv.org/abs/2409.00246"}, response.json())


class AbstractTest(unittest.TestCase):
    def test_abstract_environment(self):
        texts = {"main.tex": r"\documentclass{x}\begin{document}"
                             r"\begin{abstract}We study NV$^-$ centers~\cite{a}.\end{abstract}"
                             r"\end{document}"}
        self.assertEqual("We study NV^- centers.", L.extract_abstract(texts))

    def test_abstract_command(self):
        texts = {"main.tex": r"\documentclass{nature}\abstract{Short \textbf{bold} text.}"
                             r"\begin{document}\end{document}"}
        self.assertEqual("Short bold text.", L.extract_abstract(texts))

    def test_no_abstract(self):
        self.assertEqual("", L.extract_abstract(TEXTS))


ATOM_ENTRY = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2409.00246v2</id>
    <published>2024-08-30T17:00:00Z</published>
    <title>An NV- center in magnesium
      oxide</title>
    <summary>  Recent predictions suggest. </summary>
    <author><name>Vrindaa Somjit</name></author>
    <author><name>Giulia Galli</name></author>
  </entry>
</feed>"""


class ArxivRecordTest(CurationTestBase):
    def response(self, status, json_body=None, content=b""):
        r = mock.Mock(status_code=status, content=content)
        r.json.return_value = json_body
        r.raise_for_status.return_value = None
        return r

    def test_datacite_first(self):
        record = {"title": "From DataCite", "DOI": "10.48550/ARXIV.2409.00246"}
        with mock.patch.object(L.requests, "get", return_value=self.response(200, record)) as get:
            res = self.client.get("/api/curation/arxiv-record", params={"id": "https://arxiv.org/abs/2409.00246v2"})
        self.assertEqual(200, res.status_code, res.text)
        self.assertEqual("datacite", res.json()["source"])
        self.assertEqual("https://doi.org/10.48550/arXiv.2409.00246", get.call_args[0][0])

    def test_falls_back_to_the_arxiv_api_for_an_unregistered_preprint(self):
        with mock.patch.object(L.requests, "get", side_effect=[
                self.response(404), self.response(200, content=ATOM_ENTRY)]):
            res = self.client.get("/api/curation/arxiv-record", params={"id": "2409.00246"})
        self.assertEqual(200, res.status_code, res.text)
        record = res.json()["record"]
        self.assertEqual("arxiv", res.json()["source"])
        self.assertEqual("An NV- center in magnesium oxide", record["title"])
        self.assertEqual([{"given": "Vrindaa", "family": "Somjit"}, {"given": "Giulia", "family": "Galli"}],
                         record["author"])
        self.assertEqual([[2024]], record["issued"]["date-parts"])
        self.assertEqual("10.48550/arXiv.2409.00246", record["DOI"])
        self.assertEqual("Recent predictions suggest.", record["abstract"])

    def test_unknown_paper_and_bad_input(self):
        error_feed = (b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Error</title>'
                      b'</entry></feed>')
        with mock.patch.object(L.requests, "get", side_effect=[
                self.response(404), self.response(200, content=error_feed)]):
            res = self.client.get("/api/curation/arxiv-record", params={"id": "2409.99999"})
        self.assertEqual(404, res.status_code)
        with mock.patch.object(L.requests, "get") as get:
            res = self.client.get("/api/curation/arxiv-record", params={"id": "https://evil.example/abs/1"})
        self.assertEqual(400, res.status_code)
        get.assert_not_called()
