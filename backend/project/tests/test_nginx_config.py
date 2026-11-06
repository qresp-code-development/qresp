import io
import os
import re
import unittest

# The staging failure after a successful Google sign-in was NOT an auth bug:
# nginx applied one server-wide limit_req to every request, so a single page
# load (dozens of /_next/static chunks at once) drained the burst and the
# page came back 503. These tests pin the fixed shape of the config so the
# server-wide limiter cannot come back by accident.

CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))))),
    "nginx", "default.conf")


def read_config():
    with io.open(CONFIG_PATH, encoding="utf-8") as handle:
        return handle.read()


def location_blocks(text):
    """{location matcher: block body} for the top-level location blocks."""
    blocks = {}
    for match in re.finditer(r"^\s{2}location\s+([^{]+?)\s*\{", text,
                             re.MULTILINE):
        start = match.end()
        depth = 1
        index = start
        while index < len(text) and depth:
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
            index += 1
        blocks[match.group(1).strip()] = text[start:index - 1]
    return blocks


class TestNginxRateLimiting(unittest.TestCase):
    def setUp(self):
        self.text = read_config()
        self.blocks = location_blocks(self.text)

    def test_no_server_wide_request_limiter(self):
        # A limit_req that is NOT inside a location block applies to
        # everything, including static assets. That is the regression.
        outside = re.sub(r"^\s{2}location[^{]*\{.*?^\s{2}\}", "", self.text,
                         flags=re.DOTALL | re.MULTILINE)
        self.assertNotIn("limit_req zone=", outside)

    def test_static_assets_are_never_rate_limited(self):
        for matcher in ("^~ /_next/", "^~ /images/", "= /favicon.ico"):
            self.assertIn(matcher, self.blocks, matcher)
            self.assertNotIn("limit_req", self.blocks[matcher], matcher)

    def test_page_navigation_has_a_generous_limit_not_the_api_one(self):
        page = self.blocks["/"]
        self.assertIn("limit_req zone=pages", page)
        # 20 r/s with a 200 burst: a page load and a provider redirect are
        # nowhere near it.
        self.assertRegex(self.text,
                         r"zone=pages:\d+m\s+rate=(\d+)r/m")
        rate = int(re.search(r"zone=pages:\d+m\s+rate=(\d+)r/m",
                             self.text).group(1))
        self.assertGreaterEqual(rate, 600)
        self.assertIn("burst=200", page)

    def test_sensitive_and_expensive_apis_keep_a_scoped_limit(self):
        expected = {
            "^~ /api/auth/": "api_auth",
            "^~ /api/assist/": "api_costly",
            "^~ /api/curation/": "api_costly",
            "^~ /api/import/": "api_costly",
            "= /api/publish": "api_costly",
            "/api": "api_general",
        }
        for matcher, zone in expected.items():
            self.assertIn(matcher, self.blocks, matcher)
            self.assertIn("limit_req zone=%s" % zone, self.blocks[matcher],
                          matcher)

    def test_related_research_reads_have_their_own_scoped_limit(self):
        # GET /api/paper/{id}/related renders with the detail page, so the
        # tight api_costly zone would throttle ordinary browsing; it can also
        # reach an external provider on a cache miss, so it must not ride the
        # general API allowance either. It gets a zone of its own, and a
        # regex location so it wins over the /api prefix.
        matcher = "~ ^/api/paper/[^/]+/related$"
        self.assertIn(matcher, self.blocks)
        self.assertIn("limit_req zone=api_related", self.blocks[matcher])
        rate = int(re.search(r"zone=api_related:\d+m\s+rate=(\d+)r/m",
                             self.text).group(1))
        general = int(re.search(r"zone=api_general:\d+m\s+rate=(\d+)r/m",
                                self.text).group(1))
        costly = int(re.search(r"zone=api_costly:\d+m\s+rate=(\d+)r/m",
                               self.text).group(1))
        self.assertLess(rate, general)
        self.assertGreater(rate, costly)

    def test_the_session_probe_is_not_throttled_as_a_sign_in_attempt(self):
        # /api/auth/me runs on every page mount; an exact-match location
        # keeps it off the tight sign-in zone.
        probe = self.blocks["= /api/auth/me"]
        self.assertIn("limit_req zone=api_general", probe)
        self.assertNotIn("api_auth", probe)

    def test_every_declared_zone_exists(self):
        declared = set(re.findall(r"limit_req_zone[^;]*zone=(\w+):", self.text))
        used = set(re.findall(r"limit_req zone=(\w+)", self.text))
        self.assertTrue(used)
        self.assertEqual(set(), used - declared)

    def test_throttling_answers_429_not_503(self):
        # 503 made a limiter indistinguishable from an outage, which is what
        # sent the staging diagnosis down the wrong path.
        self.assertIn("limit_req_status 429;", self.text)


class TestNginxLogRedaction(unittest.TestCase):
    def setUp(self):
        self.text = read_config()

    def test_auth_query_strings_are_redacted_in_the_access_log(self):
        self.assertIn("map $request_uri $safe_request_uri", self.text)
        self.assertIn("[redacted]", self.text)
        # The log format must use the sanitized variable, never $request
        # (which embeds the raw query string).
        log_format = re.search(r"log_format\s+redacted(.*?);", self.text,
                               re.DOTALL).group(1)
        self.assertIn("$safe_request_uri", log_format)
        self.assertNotIn("$request ", log_format)
        self.assertIn("access_log /var/log/nginx/access.log redacted;",
                      self.text)

    def test_useful_fields_are_still_logged(self):
        log_format = re.search(r"log_format\s+redacted(.*?);", self.text,
                               re.DOTALL).group(1)
        for field in ("$remote_addr", "$request_method", "$status",
                      "$server_protocol", "$http_user_agent"):
            self.assertIn(field, log_format)

    def test_the_redaction_pattern_matches_a_real_callback(self):
        pattern = re.search(
            r'"~\^\(\?<auth_path>(.*?)\)\\\?"', self.text).group(1)
        compiled = re.compile("^" + pattern + r"\?")
        self.assertTrue(compiled.match(
            "/api/auth/google/callback?code=SECRET&state=ALSO"))
        self.assertTrue(compiled.match(
            "/api/auth/microsoft/callback?code=x&session_state=y"))
        # Ordinary requests keep their query string.
        self.assertIsNone(compiled.match("/api/search?searchWord=water"))


if __name__ == "__main__":
    unittest.main()
