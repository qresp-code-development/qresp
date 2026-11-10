import json
import os
import unittest
from unittest import mock

from project import curation_ai as cai
from project.tests.test_curation import FOLDER, CurationTestBase

GEMINI_ENV = {
    "QRESP_GEMINI_ENABLED": "1",
    "QRESP_GEMINI_API_KEY": "test-gemini-super-secret",
    "QRESP_GEMINI_MODEL": "gemini-test",
}

FIGURES = [
    {"id": "c0", "number": "1", "caption": "High-throughput screening of spin defects in MgO."},
    {"id": "c1", "number": "2", "caption": "Formation energies and defect levels of the NV center."},
    {"id": "c2", "number": "3", "caption": ""},
]


class AiTestBase(CurationTestBase):
    def setUp(self):
        super().setUp()
        for key, value in GEMINI_ENV.items():
            os.environ[key] = value

    def tearDown(self):
        for key in GEMINI_ENV:
            os.environ.pop(key, None)
        super().tearDown()

    def post(self, path, body):
        return self.client.post(path, json=body, headers={"X-CSRF-Token": self.csrf})


class TestFigureKeywords(AiTestBase):
    def test_requires_consent_before_any_provider_call(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            response = self.post("/api/curation/suggest-figure-keywords",
                                 {"consent": False, "figures": FIGURES})
        self.assertEqual(400, response.status_code)
        gemini.assert_not_called()

    def test_off_when_not_configured(self):
        self.login()
        os.environ.pop("QRESP_GEMINI_API_KEY")
        response = self.post("/api/curation/suggest-figure-keywords",
                             {"consent": True, "figures": FIGURES})
        self.assertEqual(503, response.status_code)

    def test_needs_captions(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            response = self.post("/api/curation/suggest-figure-keywords",
                                 {"consent": True, "figures": [FIGURES[2]]})
        self.assertEqual(400, response.status_code)
        gemini.assert_not_called()

    def test_keywords_are_cleaned_and_only_for_known_figures(self):
        self.login()
        answer = json.dumps({
            "paper_keywords": ["spin qubit", "MgO", "data"],
            "figures": [
                {"id": "c0", "keywords": ["high-throughput screening", "spin defects",
                                          "Figure", "screen.png", "spin defects"]},
                {"id": "c1", "keywords": ["formation energy", "defect levels"]},
                {"id": "c9", "keywords": ["invented"]},
            ],
        })
        with mock.patch("project.assist.call_gemini", return_value=(answer, None)) as gemini:
            response = self.post("/api/curation/suggest-figure-keywords", {
                "consent": True,
                "paper": {"title": "An NV center in MgO", "abstract": "We identify...", "keywords": ["DFT"]},
                "figures": FIGURES,
            })
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual(
            {"c0": ["high-throughput screening", "spin defects"],
             "c1": ["formation energy", "defect levels"]},
            {f["id"]: f["keywords"] for f in body["figures"]})
        self.assertEqual(["spin qubit", "MgO"], body["paper_keywords"])
        self.assertEqual(["gemini-test"], body["models"])
        payload = gemini.call_args[0][1]
        # Only captioned figures, and nothing about the curator, are sent.
        self.assertEqual(["c0", "c1"], [f["id"] for f in payload["figures"]])
        self.assertNotIn("curator", json.dumps(payload))

    def test_provider_rate_limit_is_passed_through(self):
        from project import assist
        self.login()
        error = assist.ProviderError("You have reached the AI usage limit.",
                                     assist.ERROR_RATE_LIMITED)
        with mock.patch("project.assist.call_gemini", return_value=(None, error)):
            response = self.post("/api/curation/suggest-figure-keywords",
                                 {"consent": True, "figures": FIGURES})
        self.assertEqual(429, response.status_code)
        self.assertEqual("You have reached the AI usage limit.", response.json()["error"])

    def test_unusable_answer_is_a_502(self):
        self.login()
        with mock.patch("project.assist.call_gemini", return_value=("not json", None)):
            response = self.post("/api/curation/suggest-figure-keywords",
                                 {"consent": True, "figures": FIGURES})
        self.assertEqual(502, response.status_code)


SCRIPT_TEXT = '''"""Plot the configuration coordinate diagram."""
import numpy as np
import matplotlib.pyplot as plt
API_KEY = "abcdefghijklmnopqrstuvwxyz123456"
gs = np.loadtxt('./singlet_ccd_qeff')
plt.plot(gs[:, 0], gs[:, 1])
plt.xlabel("Q (amu^1/2 A)")
plt.savefig('ccd.pdf')
'''


class TestSuggestLinks(AiTestBase):
    def body(self, **extra):
        body = {
            "consent": True,
            "path": FOLDER,
            "paper": {"title": "An NV center in MgO"},
            "figures": FIGURES[:2],
            "scripts": [{"id": "s0", "files": ["/Scripts/ccd_qeff.py"]}],
            "datasets": [{"id": "d0", "name": "Figure_2_data", "files": ["Data/Figure_2_data/energies.dat"]}],
            "existing_links": [{"from": "d0", "to": "c1"}],
        }
        body.update(extra)
        return body

    def test_reads_scripts_and_returns_only_valid_new_links(self):
        self.login()
        answer = json.dumps({"links": [
            {"from": "s0", "to": "c1", "reason": "Plots defect levels.", "confidence": "medium"},
            {"from": "d0", "to": "c1", "reason": "Already linked.", "confidence": "high"},
            {"from": "c0", "to": "s0", "reason": "Wrong direction.", "confidence": "high"},
            {"from": "s7", "to": "c0", "reason": "Unknown script.", "confidence": "high"},
            {"from": "d0", "to": "s0", "reason": "Reads its data.", "confidence": "bogus"},
            {"from": "d0", "to": "c0", "reason": "Same system.", "confidence": "High"},
        ]})
        with mock.patch("project.curation_ai._fetch_text_sized",
                        return_value=(SCRIPT_TEXT, False)) as fetch, \
                mock.patch("project.assist.call_gemini", return_value=(answer, None)) as gemini:
            response = self.post("/api/curation/suggest-links", self.body())
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(
            [("s0", "c1", "generates", "medium"), ("d0", "s0", "consumes", "low"),
             ("d0", "c0", "consumes", "high")],
            [(l["from"], l["to"], l["type"], l["confidence"]) for l in response.json()["links"]])
        fetch.assert_called_once_with(FOLDER + "/Scripts/ccd_qeff.py")
        sent = json.dumps(gemini.call_args[0][1])
        self.assertIn("savefig", sent)
        self.assertNotIn("abcdefghijklmnopqrstuvwxyz123456", sent)

    def test_requires_consent(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            response = self.post("/api/curation/suggest-links", self.body(consent=False))
        self.assertEqual(400, response.status_code)
        gemini.assert_not_called()

    def test_folder_outside_allowed_roots_is_refused(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            response = self.post("/api/curation/suggest-links",
                                 self.body(path="https://evil.example/files/x"))
        self.assertEqual(400, response.status_code)
        gemini.assert_not_called()


class TestSchemas(unittest.TestCase):
    def test_only_schema_features_gemini_accepts(self):
        # Gemini's responseSchema rejects a bare "enum" (HTTP 400); the
        # working keyword schema uses only these keys.
        allowed = {"type", "properties", "items", "required", "maxItems", "maxLength"}

        def walk(node):
            if isinstance(node, dict):
                keys = set(node) - {"properties"}
                self.assertTrue(keys <= allowed | {"properties"}, keys - allowed)
                for key, value in node.items():
                    if key == "properties":
                        for child in value.values():
                            walk(child)
                    elif isinstance(value, (dict, list)):
                        walk(value)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        walk(cai.LINK_SCHEMA)
        walk(cai.FIGURE_KEYWORD_SCHEMA)
        walk(cai.CURATE_SCHEMA)


class TestScriptExcerpt(unittest.TestCase):
    def test_keeps_what_the_script_reads_writes_and_plots(self):
        text = "\n".join(["# header"] + ["x = %d" % i for i in range(60)] +
                         ["data = np.loadtxt('a.dat')", "plt.savefig('fig2.pdf')"])
        excerpt = cai.script_excerpt(text)
        self.assertIn("# header", excerpt)
        self.assertIn("loadtxt('a.dat')", excerpt)
        self.assertIn("savefig('fig2.pdf')", excerpt)
        self.assertNotIn("x = 59", excerpt)


class TestBusyProviderRetry(unittest.TestCase):
    CFG = {"API_KEY": "k", "MODEL": "m", "TIMEOUT": 5, "MAX_OUTPUT_TOKENS": 256}

    def response(self, status, body=None):
        r = mock.Mock()
        r.status_code = status
        r.json.return_value = body if body is not None else {}
        return r

    def ok(self):
        return self.response(200, {"candidates": [{
            "content": {"parts": [{"text": '{"links": []}'}]},
            "finishReason": "STOP"}]})

    def test_a_busy_503_is_retried_then_succeeds(self):
        from project import assist
        with mock.patch.object(assist.requests, "post",
                               side_effect=[self.response(503), self.ok()]) as post, \
                mock.patch.object(assist.time, "sleep") as sleep:
            answer, error = assist.call_gemini(self.CFG, {}, "p", {})
        self.assertIsNone(error)
        self.assertEqual('{"links": []}', answer)
        self.assertEqual(2, post.call_count)
        sleep.assert_called_once()

    def test_other_errors_are_never_retried(self):
        from project import assist
        with mock.patch.object(assist.requests, "post",
                               return_value=self.response(400)) as post, \
                mock.patch.object(assist.time, "sleep"):
            _answer, error = assist.call_gemini(self.CFG, {}, "p", {})
        self.assertEqual(1, post.call_count)
        self.assertEqual(assist.ERROR_OTHER, assist.error_kind(error))

    def rate_limited(self, quota, delay=None):
        details = [{"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    "violations": [{"quotaId": quota}]}]
        if delay:
            details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo",
                            "retryDelay": delay})
        return self.response(429, {"error": {"code": 429, "message": "secret prompt echo",
                                             "details": details}})

    def test_a_per_minute_limit_says_how_long_to_wait(self):
        from project import assist
        with mock.patch.object(assist.requests, "post", return_value=self.rate_limited(
                "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "37.2s")):
            _answer, error = assist.call_gemini(self.CFG, {}, "p", {})
        self.assertEqual(assist.ERROR_RATE_LIMITED, assist.error_kind(error))
        self.assertIn("about 38 seconds", error)
        self.assertNotIn("secret prompt echo", error)

    def test_a_per_day_limit_says_try_tomorrow(self):
        from project import assist
        with mock.patch.object(assist.requests, "post", return_value=self.rate_limited(
                "GenerateRequestsPerDayPerProjectPerModel-FreeTier")):
            _answer, error = assist.call_gemini(self.CFG, {}, "p", {})
        self.assertIn("daily usage limit", error)
        self.assertIn("tomorrow", error)

    def test_gives_up_after_the_retries(self):
        from project import assist
        with mock.patch.object(assist.requests, "post",
                               return_value=self.response(503)) as post, \
                mock.patch.object(assist.time, "sleep"):
            _answer, error = assist.call_gemini(self.CFG, {}, "p", {})
        self.assertEqual(1 + len(assist.UNAVAILABLE_RETRY_DELAYS), post.call_count)
        self.assertEqual(assist.ERROR_UNAVAILABLE, assist.error_kind(error))


class TestPartialKeywords(AiTestBase):
    def test_a_failed_batch_marks_the_answer_incomplete(self):
        from project import assist
        self.login()
        figures = [{"id": "c%d" % i, "number": str(i), "caption": "Caption %d" % i}
                   for i in range(25)]
        good = json.dumps({"figures": [{"id": "c0", "keywords": ["spin defects"]}]})
        busy = assist.ProviderError("busy", assist.ERROR_UNAVAILABLE)
        with mock.patch("project.assist.call_gemini",
                        side_effect=[(good, None), (None, busy)]):
            response = self.post("/api/curation/suggest-figure-keywords",
                                 {"consent": True, "figures": figures})
        self.assertEqual(200, response.status_code, response.text)
        self.assertTrue(response.json()["incomplete"])


class TestQuotaRefund(AiTestBase):
    def test_a_failed_provider_call_does_not_use_up_the_daily_limit(self):
        from project import assist
        from project.models import AssistUsage
        self.login()
        busy = assist.ProviderError("busy", assist.ERROR_UNAVAILABLE)
        with mock.patch("project.assist.call_gemini", return_value=(None, busy)):
            response = self.post("/api/curation/suggest-figure-keywords",
                                 {"consent": True, "figures": FIGURES})
        self.assertEqual(503, response.status_code)
        usage = AssistUsage.objects(email="curator@example.com").first()
        self.assertEqual(0, usage.count if usage else 0)

    def test_a_successful_call_is_counted(self):
        from project.models import AssistUsage
        self.login()
        answer = json.dumps({"figures": [{"id": "c0", "keywords": ["spin defects"]}]})
        with mock.patch("project.assist.call_gemini", return_value=(answer, None)):
            self.post("/api/curation/suggest-figure-keywords",
                      {"consent": True, "figures": FIGURES})
        self.assertEqual(1, AssistUsage.objects(email="curator@example.com").first().count)


class TestModelFallback(unittest.TestCase):
    def setUp(self):
        from project import assist
        self.assist = assist
        assist._EXHAUSTED.clear()
        self.cfg = {"API_KEY": "k", "MODEL": "primary", "TIMEOUT": 5,
                    "MAX_OUTPUT_TOKENS": 256, "MODELS": ["primary", "backup"]}

    def tearDown(self):
        self.assist._EXHAUSTED.clear()

    def daily(self):
        error = self.assist.ProviderError("daily", self.assist.ERROR_RATE_LIMITED)
        error.daily = True
        return None, error

    def test_falls_back_when_the_daily_quota_runs_out_and_remembers_it(self):
        calls = []

        def fake(cfg, *args, **kwargs):
            calls.append(cfg["MODEL"])
            return self.daily() if cfg["MODEL"] == "primary" else ("ok", None)

        with mock.patch.object(self.assist, "_call_model", side_effect=fake):
            self.assertEqual(("ok", None), self.assist.call_gemini(self.cfg, {}, "p", {}))
            self.assertEqual(("ok", None), self.assist.call_gemini(self.cfg, {}, "p", {}))
        # The exhausted model is skipped for the rest of the day.
        self.assertEqual(["primary", "backup", "backup"], calls)

    def test_other_failures_do_not_switch_models(self):
        bad = (None, self.assist.ProviderError("bad", self.assist.ERROR_OTHER))
        with mock.patch.object(self.assist, "_call_model", return_value=bad) as call:
            _answer, error = self.assist.call_gemini(self.cfg, {}, "p", {})
        self.assertEqual(1, call.call_count)
        self.assertEqual("bad", error)

    def test_every_model_exhausted_reports_the_daily_limit(self):
        with mock.patch.object(self.assist, "_call_model", side_effect=lambda *a, **k: self.daily()):
            self.assist.call_gemini(self.cfg, {}, "p", {})
        with mock.patch.object(self.assist, "_call_model") as call:
            _answer, error = self.assist.call_gemini(self.cfg, {}, "p", {})
        call.assert_not_called()
        self.assertIn("daily usage limit", error)

    def test_chain_comes_from_the_environment(self):
        with mock.patch.dict(os.environ, {
                "QRESP_GEMINI_MODEL": "m1",
                "QRESP_GEMINI_FALLBACK_MODELS": " m2, m1 ,bad/name, m3 "}):
            self.assertEqual(["m1", "m2", "m3"], self.assist._gemini_config()["MODELS"])


class TestThinkingLevelFallback(unittest.TestCase):
    CFG = {"API_KEY": "k", "MODEL": "gemini-new", "TIMEOUT": 5, "MAX_OUTPUT_TOKENS": 256}

    def setUp(self):
        from project import assist
        self.assist = assist
        assist._THINKING_LEVEL.clear()

    def tearDown(self):
        self.assist._THINKING_LEVEL.clear()

    def response(self, status, body):
        r = mock.Mock()
        r.status_code = status
        r.json.return_value = body
        return r

    def ok(self):
        return self.response(200, {"candidates": [{
            "content": {"parts": [{"text": '{"a": "ok"}'}]}, "finishReason": "STOP"}]})

    def refused(self):
        return self.response(400, {"error": {"status": "INVALID_ARGUMENT", "message":
            "Thinking level MINIMAL is not supported for this model."}})

    def levels(self, post):
        return [call.kwargs["json"]["generationConfig"].get("thinkingConfig", {}).get("thinkingLevel")
                for call in post.call_args_list]

    def test_a_refused_level_is_retried_with_the_next_and_remembered(self):
        with mock.patch.object(self.assist.requests, "post",
                               side_effect=[self.refused(), self.ok(), self.ok()]) as post:
            first = self.assist._call_model(self.CFG, {}, "p", {})
            second = self.assist._call_model(self.CFG, {}, "p", {})
        self.assertEqual(('{"a": "ok"}', None), first)
        self.assertEqual(('{"a": "ok"}', None), second)
        self.assertEqual(["minimal", "low", "low"], self.levels(post))

    def test_an_unrelated_400_is_not_retried(self):
        bad = self.response(400, {"error": {"status": "INVALID_ARGUMENT", "message": "Bad schema."}})
        with mock.patch.object(self.assist.requests, "post", return_value=bad) as post:
            _answer, error = self.assist._call_model(self.CFG, {}, "p", {})
        self.assertEqual(1, post.call_count)
        self.assertEqual(self.assist.ERROR_OTHER, self.assist.error_kind(error))


INVENTORY_FILES = [
    "plots/fig_energy.png", "plots/logo.png", "plots/notes.txt",
    "raw/run1/out.dat", "raw/run2/out.dat", "code/make_plots.py", "README.md",
    "Figures/Figure1.pdf",
]
INVENTORY_DIRS = ["plots", "raw", "raw/run1", "raw/run2", "code", "Figures"]
EXISTING = {"charts": [{"id": "c0", "imageFile": "/Figures/Figure1.pdf", "number": "1", "caption": "x"}],
            "datasets": [], "scripts": [], "tools": []}


class TestValidateCuration(unittest.TestCase):
    def run_it(self, data):
        existing, taken = cai._existing({"existing": EXISTING})
        return cai.validate_curation(data, INVENTORY_FILES, INVENTORY_DIRS, existing, taken)

    def test_keeps_only_real_new_paths_of_the_right_kind(self):
        proposal, _links = self.run_it({
            "charts": [
                {"key": "n1", "imageFile": "plots/fig_energy.png", "number": "2", "keywords": ["energy"], "reason": "r"},
                {"key": "n2", "imageFile": "plots/invented.png", "reason": "not in folder"},
                {"key": "n3", "imageFile": "plots/notes.txt", "reason": "not an image"},
                {"key": "n4", "imageFile": "Figures/Figure1.pdf", "reason": "already in record"},
            ],
            "datasets": [{"key": "n5", "files": ["raw", "nope"], "description": "Runs.", "reason": "r"}],
            "scripts": [{"key": "n6", "files": ["/code/make_plots.py"], "description": "Plots.", "reason": "r"}],
            "tools": [{"key": "n7", "packageName": "numpy", "version": "1.26.4", "reason": "r"},
                      {"key": "n8", "packageName": "scipy", "version": "", "reason": "no version"}],
            "links": [],
        })
        self.assertEqual(["plots/fig_energy.png"], [c["imageFile"] for c in proposal["charts"]])
        self.assertEqual([["raw"]], [d["files"] for d in proposal["datasets"]])
        self.assertEqual([["code/make_plots.py"]], [s["files"] for s in proposal["scripts"]])
        self.assertEqual(["numpy"], [t["packageName"] for t in proposal["tools"]])

    def test_links_need_known_ends_an_allowed_direction_and_a_new_item(self):
        _proposal, links = self.run_it({
            "charts": [{"key": "n1", "imageFile": "plots/fig_energy.png", "reason": "r"}],
            "datasets": [{"key": "n2", "files": ["raw"], "description": "d", "reason": "r"}],
            "scripts": [{"key": "n3", "files": ["code/make_plots.py"], "description": "s", "reason": "r"}],
            "tools": [],
            "links": [
                {"from": "n3", "to": "n1", "reason": "plots it", "confidence": "high"},
                {"from": "n2", "to": "n3", "reason": "reads it", "confidence": "Medium"},
                {"from": "n3", "to": "c0", "reason": "existing figure", "confidence": "low"},
                {"from": "n1", "to": "n3", "reason": "wrong way", "confidence": "high"},
                {"from": "n9", "to": "n1", "reason": "unknown", "confidence": "high"},
                {"from": "c0", "to": "c0", "reason": "existing only", "confidence": "high"},
            ],
        })
        self.assertEqual(
            [("n3", "n1", "generates", "high"), ("n2", "n3", "consumes", "medium"),
             ("n3", "c0", "generates", "low")],
            [(l["from"], l["to"], l["type"], l["confidence"]) for l in links])

    def test_inventory_summarizes_big_folders(self):
        files = ["data/f%03d.dat" % i for i in range(40)] + ["a.py"]
        text = cai.summarize_inventory(files, ["data"])
        self.assertIn("data/  40 files (40 .dat)", text)
        self.assertIn("./  a.py", text)


class TestAiCurateEndpoint(AiTestBase):
    def test_reads_the_folder_and_returns_validated_proposals(self):
        self.login()
        answer = json.dumps({
            "charts": [{"key": "n1", "imageFile": "plots/fig_energy.png", "reason": "A results figure."}],
            "datasets": [], "scripts": [], "tools": [], "links": [],
        })
        with mock.patch("project.curation_ai.walk_folder",
                        return_value=(INVENTORY_FILES, INVENTORY_DIRS, [], False)), \
                mock.patch("project.curation_ai._fetch_text_sized", return_value=("print(1)", False)), \
                mock.patch("project.assist.call_gemini", return_value=(answer, None)) as gemini:
            response = self.post("/api/curation/ai-curate", {
                "consent": True, "path": FOLDER, "paper": {"title": "T"}, "existing": EXISTING})
        self.assertEqual(200, response.status_code, response.text)
        body = response.json()
        self.assertEqual(["plots/fig_energy.png"], [c["imageFile"] for c in body["proposal"]["charts"]])
        sent = gemini.call_args[0][1]
        self.assertIn("plots/", sent["inventory"])
        self.assertEqual("c0", sent["existing"]["charts"][0]["id"])

    def test_requires_consent(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            response = self.post("/api/curation/ai-curate", {"consent": False, "path": FOLDER})
        self.assertEqual(400, response.status_code)
        gemini.assert_not_called()


REVIEW_EXISTING = {
    "charts": [{"id": "c0", "imageFile": "/Figures/Figure1.pdf", "number": "", "caption": "x",
                "properties": ["energy"]}],
    "datasets": [{"id": "d0", "files": ["raw"], "readme": "raw"}],
    "scripts": [{"id": "s0", "files": ["code/make_plots.py"], "readme": "", "keywords": []}],
    "tools": [{"id": "t0", "packageName": "numpy", "version": "1.26"}],
}


class TestAiCurateFocusAndReview(AiTestBase):
    def run_curate(self, answer, **extra):
        self.login()
        body = {"consent": True, "path": FOLDER, "paper": {"title": "T"}, "existing": REVIEW_EXISTING}
        body.update(extra)
        with mock.patch("project.curation_ai.walk_folder",
                        return_value=(INVENTORY_FILES, INVENTORY_DIRS, [], False)), \
                mock.patch("project.curation_ai._fetch_text_sized", return_value=("print(1)", False)), \
                mock.patch("project.assist.call_gemini", return_value=(json.dumps(answer), None)) as gemini:
            response = self.post("/api/curation/ai-curate", body)
        self.assertEqual(200, response.status_code, response.text)
        return response.json(), gemini

    ANSWER = {
        "charts": [{"key": "n1", "imageFile": "plots/fig_energy.png", "reason": "r"}],
        "datasets": [{"key": "n2", "files": ["raw/run1"], "description": "Run 1.", "reason": "r"}],
        "scripts": [], "tools": [], "links": [],
        "edits": [
            {"id": "c0", "field": "number", "value": "1", "reason": "Named Figure1."},
            {"id": "c0", "field": "caption", "value": "Invented", "reason": "never allowed"},
            {"id": "c0", "field": "keywords", "value": "Energy", "reason": "unchanged"},
            {"id": "d0", "field": "description", "value": "Raw outputs of runs 1 and 2.", "reason": "Only repeated the name."},
            {"id": "s0", "field": "keywords", "value": "plotting, band structure", "reason": "r"},
            {"id": "t0", "field": "version", "value": "1.26", "reason": "unchanged"},
            {"id": "s9", "field": "description", "value": "Unknown item.", "reason": "r"},
            {"id": "c0", "field": "number", "value": "Figure one", "reason": "bad form"},
        ],
        "notes": ["Figure 3 is in the captions but has no image in the record.", ""],
    }

    def test_focus_returns_only_the_kinds_asked_for_and_no_review(self):
        body, gemini = self.run_curate(self.ANSWER, focus=["charts"], review=True)
        self.assertEqual(["plots/fig_energy.png"], [c["imageFile"] for c in body["proposal"]["charts"]])
        self.assertEqual([], body["proposal"]["datasets"])
        self.assertEqual([], body["edits"])
        self.assertIn("ONLY for these kinds of new items: charts", gemini.call_args[0][2])

    def test_review_keeps_only_real_changes_to_allowed_fields(self):
        body, gemini = self.run_curate(self.ANSWER, review=True)
        self.assertEqual(
            [("c0", "number", "1"), ("d0", "readme", "Raw outputs of runs 1 and 2."),
             ("s0", "keywords", ["plotting", "band structure"])],
            [(e["id"], e["field"], e["value"]) for e in body["edits"]])
        self.assertEqual("raw", body["edits"][1]["current"])
        self.assertEqual(["Figure 3 is in the captions but has no image in the record."], body["notes"])
        self.assertIn("REVIEW", gemini.call_args[0][2])
        sent = gemini.call_args[0][1]["existing"]
        self.assertEqual("raw", sent["datasets"][0]["description"])
        self.assertEqual(["energy"], sent["charts"][0]["keywords"])

    def test_no_review_unless_asked(self):
        body, gemini = self.run_curate(self.ANSWER)
        self.assertEqual([], body["edits"])
        self.assertNotIn("REVIEW", gemini.call_args[0][2])


class TestSuggestDescriptions(AiTestBase):
    def body(self, **extra):
        body = {
            "consent": True, "path": FOLDER, "paper": {"title": "An NV center in MgO"},
            "figures": FIGURES[:2],
            "datasets": [{"id": "d0", "files": ["Data/energies.dat", "Data/big.h5"], "readme": ""}],
            "scripts": [{"id": "s0", "files": ["/Scripts/ccd_qeff.py"], "readme": "old"}],
            "existing_links": [{"from": "d0", "to": "c1"}, {"from": "x", "to": "c1"}],
        }
        body.update(extra)
        return body

    def test_reads_files_and_returns_descriptions_for_known_items(self):
        self.login()
        answer = json.dumps({"descriptions": [
            {"id": "d0", "description": "Formation energies plotted in Figure 2.", "confidence": "High"},
            {"id": "s0", "description": "Plots the configuration coordinate diagram.", "confidence": "odd"},
            {"id": "d7", "description": "Not in the record.", "confidence": "high"},
            {"id": "s0", "description": "A duplicate answer.", "confidence": "high"},
        ]})
        with mock.patch("project.curation_ai._fetch_text_sized",
                        return_value=("# E (eV)  q\n1.0 0\n", False)) as fetch, \
                mock.patch("project.assist.call_gemini", return_value=(answer, None)) as gemini:
            response = self.post("/api/curation/suggest-descriptions", self.body())
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(
            [("d0", "high"), ("s0", "low")],
            [(d["id"], d["confidence"]) for d in response.json()["descriptions"]])
        fetched = [call[0][0] for call in fetch.call_args_list]
        self.assertIn(FOLDER + "/Data/energies.dat", fetched)
        self.assertNotIn(FOLDER + "/Data/big.h5", fetched)
        sent = gemini.call_args[0][1]
        self.assertEqual([{"from": "d0", "to": "c1"}], sent["links"])
        self.assertEqual("old", sent["scripts"][0]["current_description"])
        self.assertIn("E (eV)", sent["datasets"][0]["file_heads"][0]["head"])

    def test_drafts_descriptions_for_figures_without_a_caption(self):
        self.login()
        answer = json.dumps({"descriptions": [
            {"id": "c2", "description": "Likely the configuration coordinate diagram.", "confidence": "medium"},
            {"id": "c0", "description": "Has a caption already.", "confidence": "high"},
        ]})
        figures = FIGURES + [dict(FIGURES[2], id="c3")]
        figures[2] = dict(FIGURES[2], imageFile="/plots/ccd.png")
        with mock.patch("project.curation_ai._fetch_text_sized", return_value=("x", False)), \
                mock.patch("project.assist.call_gemini", return_value=(answer, None)) as gemini:
            response = self.post("/api/curation/suggest-descriptions",
                                 self.body(figures=figures, datasets=[], scripts=[]))
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(["c2"], [d["id"] for d in response.json()["descriptions"]])
        sent = gemini.call_args[0][1]
        self.assertEqual(["c2", "c3"], [f["id"] for f in sent["figures_to_describe"]])
        self.assertEqual("plots/ccd.png", sent["figures_to_describe"][0]["image"])
        self.assertEqual(["c0", "c1"], [f["id"] for f in sent["figures"]])

    def test_requires_consent_and_something_to_describe(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            self.assertEqual(400, self.post("/api/curation/suggest-descriptions",
                                            self.body(consent=False)).status_code)
            self.assertEqual(400, self.post("/api/curation/suggest-descriptions",
                                            self.body(datasets=[], scripts=[])).status_code)
            self.assertEqual(400, self.post("/api/curation/suggest-descriptions",
                                            self.body(path="https://evil.example/files/x")).status_code)
        gemini.assert_not_called()


LATEX_FIGURES = [
    {"kind": "figure", "number": "1", "graphics": ["fig1.pdf"], "caption": "Screening workflow.", "label": "fig:workflow"},
    {"kind": "figure", "number": "2", "graphics": ["fig2.pdf"], "caption": "Band structure of the NV center.", "label": "fig:bands"},
    {"kind": "table", "number": "1", "graphics": [], "caption": "Computed energies.", "label": ""},
]


class TestMatchCaptions(AiTestBase):
    def test_returns_the_papers_caption_for_each_valid_match(self):
        self.login()
        answer = json.dumps({"matches": [
            {"id": "c0", "figure": "f1", "reason": "Both about band structures.", "confidence": "medium"},
            {"id": "c1", "figure": "f2", "reason": "Energies table.", "confidence": "high"},
            {"id": "c0", "figure": "f0", "reason": "Duplicate.", "confidence": "high"},
            {"id": "c5", "figure": "f0", "reason": "Unknown chart.", "confidence": "high"},
            {"id": "c2", "figure": "f9", "reason": "Unknown figure.", "confidence": "high"},
        ]})
        with mock.patch("project.assist.call_gemini", return_value=(answer, None)) as gemini:
            response = self.post("/api/curation/match-captions", {
                "consent": True, "figures": LATEX_FIGURES,
                "charts": [{"id": "c0", "imageFile": "plots/band_structure.png"},
                           {"id": "c1", "imageFile": "plots/energies.png"},
                           {"id": "c2", "imageFile": "plots/other.png"}]})
        self.assertEqual(200, response.status_code, response.text)
        matches = response.json()["matches"]
        self.assertEqual(
            [("c0", "Band structure of the NV center.", "2", "ai"),
             ("c1", "Computed energies.", "Table 1", "ai")],
            [(m["id"], m["caption"], m["number"], m["how"]) for m in matches])
        sent = gemini.call_args[0][1]
        self.assertEqual(["fig2.pdf"], sent["latex_figures"][1]["graphics"])
        self.assertEqual("plots/band_structure.png", sent["record_figures"][0]["image"])

    def test_requires_consent_and_something_to_match(self):
        self.login()
        with mock.patch("project.assist.call_gemini") as gemini:
            self.assertEqual(400, self.post("/api/curation/match-captions", {
                "consent": False, "figures": LATEX_FIGURES, "charts": [{"id": "c0"}]}).status_code)
            self.assertEqual(400, self.post("/api/curation/match-captions", {
                "consent": True, "figures": [], "charts": [{"id": "c0"}]}).status_code)
        gemini.assert_not_called()


class TestNewSchemas(unittest.TestCase):
    def test_new_schemas_use_only_what_gemini_accepts(self):
        TestSchemas.test_only_schema_features_gemini_accepts  # same rules
        allowed = {"type", "properties", "items", "required", "maxItems", "maxLength"}

        def walk(node):
            if isinstance(node, dict):
                self.assertTrue(set(node) - {"properties"} <= allowed, set(node) - allowed)
                for key, value in node.items():
                    children = value.values() if key == "properties" else [value]
                    for child in children:
                        if isinstance(child, (dict, list)):
                            walk(child)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        for schema in (cai.DESCRIBE_SCHEMA, cai.MATCH_SCHEMA, cai.CURATE_SCHEMA):
            walk(schema)
