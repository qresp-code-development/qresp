"""The curation assistant's final scope, pinned.

Supervisor decision: no manuscript upload, and no AI for publication
metadata. A language model may be asked two things, both from metadata the
curator already wrote or reviewed: keywords for the record, and descriptions
for RCC folder candidates they selected. These tests keep the removed surface
removed -- above all the manuscript upload and the publication-metadata
endpoint, which must never come back.
"""
import io
import os
import unittest

import yaml

from project import assist, connexionapp, manuscript

BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
SWAGGER_PATH = os.path.join(BACKEND, "project", "swagger.yml")


def read(*parts):
    with io.open(os.path.join(BACKEND, *parts), encoding="utf-8") as handle:
        return handle.read()


class TestRemovedRoutes(unittest.TestCase):

    def setUp(self):
        with io.open(SWAGGER_PATH, encoding="utf-8") as handle:
            self.paths = (yaml.safe_load(handle).get("paths") or {})

    def test_manuscript_upload_is_not_routed(self):
        self.assertNotIn("/import/manuscript", self.paths)

    def test_the_publication_metadata_ai_endpoint_stays_gone(self):
        self.assertNotIn("/assist/publication-metadata", self.paths)

    def test_no_handler_survives_for_them(self):
        for name in ("import_manuscript", "extract_source_text",
                     "extract_from_pdf_text", "_process_pdf", "_process_zip",
                     "_extract_from_tex", "_merge_with_crossref"):
            self.assertFalse(hasattr(manuscript, name),
                             "manuscript.%s should be gone" % name)
        for name in ("suggest_publication_metadata",
                     "_prepare_manuscript_text", "_chunk_text",
                     "_ask_gemini"):
            self.assertFalse(hasattr(assist, name),
                             "assist.%s should be gone" % name)

    def test_the_routes_that_remain_are_the_intended_ones(self):
        for kept in ("/import/doi", "/assist/keywords",
                     "/curation/analyze-folder",
                     "/curation/describe-candidates"):
            self.assertIn(kept, self.paths)


class TestSharedGeminiPlumbingSurvives(unittest.TestCase):
    """curation.py imports these five for RCC candidate descriptions."""

    def test_rcc_imports_still_resolve(self):
        for name in ("call_gemini", "_gemini_config", "_gemini_ready",
                     "_normalize_keywords", "_consume_daily_quota"):
            self.assertTrue(hasattr(assist, name), name)

    def test_curation_module_imports_cleanly(self):
        from project import curation
        self.assertTrue(hasattr(curation, "describe_candidates"))

    def test_the_provider_host_is_still_fixed_in_code(self):
        self.assertEqual(
            assist.GEMINI_API_BASE,
            "https://generativelanguage.googleapis.com/v1beta/models")


class TestNoManuscriptParsingRemains(unittest.TestCase):

    def test_keyword_suggestion_never_accepts_a_file(self):
        # The endpoint exists again, but not the door the manuscript came
        # through: no filename, no base64, no extractor.
        source = read("project", "assist.py")
        for token in ("content_base64", "extract_source_text",
                      "MAX_UPLOAD_BYTES", "b64decode"):
            self.assertNotIn(token, source, token)

    def test_no_pdf_or_archive_machinery_is_imported(self):
        source = read("project", "manuscript.py")
        for token in ("pypdf", "PdfReader", "zipfile", "base64",
                      "posixpath"):
            self.assertNotIn(token, source, token)

    def test_the_upload_limits_are_gone_too(self):
        for name in ("MAX_UPLOAD_BYTES", "MAX_PDF_PAGES", "MAX_ZIP_ENTRIES",
                     "MAX_SOURCE_EXCERPT_CHARS"):
            self.assertFalse(hasattr(manuscript, name), name)


class TestDoiLayerSurvives(unittest.TestCase):

    def test_normalization_still_accepts_the_usual_shapes(self):
        for raw in ("10.1234/abcd", "doi:10.1234/abcd",
                    "https://doi.org/10.1234/abcd",
                    "https://dx.doi.org/10.1234/ABCD",
                    "  10.1234/abcd.  "):
            self.assertEqual(manuscript.normalize_doi(raw), "10.1234/abcd",
                             raw)

    def test_non_dois_are_still_refused(self):
        for raw in ("", "not a doi", "11.1234/abcd", "10.12/x y"):
            self.assertIsNone(manuscript.normalize_doi(raw), repr(raw))

    def test_crossref_still_maps_the_bibliographic_fields(self):
        fields = manuscript._crossref_fields({
            "type": "journal-article",
            "title": ["Registry Title"],
            "container-title": ["Journal of Computing"],
            "issued": {"date-parts": [[2021, 5]]},
            "volume": "12", "page": "100-110",
            "abstract": "<jats:p>Registry abstract.</jats:p>",
            "author": [{"given": "Ada B.", "family": "Lovelace"}],
        })
        self.assertEqual(fields["kind"], "journal")
        self.assertEqual(fields["journal"], "Journal of Computing")
        self.assertEqual(fields["year"], 2021)
        self.assertEqual(fields["volume"], "12")
        self.assertEqual(fields["pages"], "100-110")
        self.assertEqual(fields["abstract"], "Registry abstract.")
        self.assertEqual(fields["authors"][0]["lastName"], "Lovelace")

    def test_a_field_the_registry_omits_is_left_out(self):
        # It is the curator's to type. Nothing fills it in.
        fields = manuscript._crossref_fields({"title": ["Only A Title"]})
        for absent in ("journal", "volume", "pages", "year", "abstract"):
            self.assertNotIn(absent, fields)


if __name__ == "__main__":
    unittest.main()
