"""Reader feedback on the Related Research list.

Five things are pinned here, and each is a way the measurement could be
quietly wrong rather than visibly broken:

* AUTHENTICATION -- rating requires an account. Anonymous rating was keyed by
  a per-session token a reader could reset at will, so "one opinion per
  reader" was false and one person could move the average as far as they
  liked. That policy is reversed, and these tests are what stop it coming
  back.
* A VERIFIED CONTEXT -- what a rating is ABOUT comes from a signed token the
  server minted after resolving a real public record and computing a
  non-empty list, never from the request body.
* ONE OPINION PER ACCOUNT -- a second submission UPDATES the first.
* PERMISSIONS -- a reader can read their OWN rating and nothing else; the
  summary is admin-only and aggregate-only.
* WHAT IS NOT STORED -- no IP, no User-Agent, no header, no email, no gate
  score, no recommended title or DOI. A privacy promise that lives only in a
  docstring is not a promise.
"""
import time
import unittest
from unittest import mock

import mongoengine
import mongomock

from project import connexionapp, feedback, feedback_context
from project.models import RecommendationFeedback

PAPER = "5983afce759061384c1aae48"
PEER = "https://paperstack.uchicago.edu"
ENDPOINT = "/api/paper/%s/related/feedback" % PAPER
SUMMARY = "/api/related/feedback/summary"

ADMIN = {"email": "admin@example.org", "is_admin": True,
         "account_id": "acct-admin"}
READER = {"email": "reader@example.org", "account_id": "acct-reader"}
OTHER = {"email": "other@example.org", "account_id": "acct-other"}


# The test configuration ships no Flask secret, and this feature fails CLOSED
# without one -- which is the point of `TestNoSecretMeansNoFallbackKey`. Every
# other test needs a working deployment, so one is supplied here rather than a
# constant being baked into the code.
TEST_SECRET = "test-only-feedback-signing-secret"


class SecretMixin(object):
    def give_the_app_a_secret(self):
        previous = connexionapp.app.secret_key
        connexionapp.app.secret_key = TEST_SECRET
        self.addCleanup(setattr, connexionapp.app, "secret_key", previous)


def context_for(cache_key=PAPER, source="external", results=25, pages=5,
                now=None):
    """A token exactly as `related_research` would have issued one."""
    previous = connexionapp.app.secret_key
    connexionapp.app.secret_key = connexionapp.app.secret_key or TEST_SECRET
    try:
        with connexionapp.app.test_request_context():
            return feedback_context.issue(cache_key, source, results, pages,
                                          now=now)
    finally:
        connexionapp.app.secret_key = previous


class FeedbackTestCase(unittest.TestCase, SecretMixin):
    @classmethod
    def setUpClass(cls):
        cls.client = connexionapp.test_client()

    def setUp(self):
        self.give_the_app_a_secret()
        mongoengine.disconnect_all()
        mongoengine.connect('mongoenginetest',
                            mongo_client_class=mongomock.MongoClient)
        self.context = context_for()

    def tearDown(self):
        RecommendationFeedback.drop_collection()
        mongoengine.disconnect_all()

    def body(self, **overrides):
        payload = {"rating": 4, "feedback_context": self.context}
        payload.update(overrides)
        return payload

    def post(self, body=None, params=None, user=READER):
        """Submit as a signed-in reader unless a user is named.

        The session is patched rather than logged in: what is under test is
        the handler's own rules, and `get_current_user` is the seam the rest
        of the app already uses. CSRF has its own tests below, through the
        real session.
        """
        with mock.patch.object(feedback, "get_current_user",
                               return_value=user):
            return self.client.post(ENDPOINT,
                                    json=self.body() if body is None else body,
                                    params=params or {})

    def get_mine(self, params=None, user=READER):
        with mock.patch.object(feedback, "get_current_user",
                               return_value=user):
            return self.client.get(ENDPOINT, params=params or {})

    def rows(self):
        return list(RecommendationFeedback.objects())


# ---------------------------------------------------------- authentication

class TestRatingRequiresAnAccount(FeedbackTestCase):
    """The policy reversal. Anonymous rating was keyed by a session token,
    which a reader could reset -- so it was never one vote per person."""

    def test_an_anonymous_post_is_refused(self):
        response = self.post(user=None)
        self.assertEqual(401, response.status_code)
        self.assertEqual([], self.rows())

    def test_an_anonymous_read_of_my_rating_is_refused(self):
        self.assertEqual(401, self.get_mine(user=None).status_code)

    def test_no_session_token_identity_survives_anywhere(self):
        # The seam the old behaviour hung on. If any of this comes back, so
        # does the defect.
        import io
        source = io.open(feedback.__file__, encoding="utf-8").read()
        self.assertNotIn("_session_token", source)
        self.assertNotIn("feedback_respondent", source)
        self.assertNotIn("qresp-feedback", source)
        self.assertFalse(hasattr(feedback, "_session_token"))

    def test_a_signed_in_reader_is_keyed_by_the_account_not_the_email(self):
        with connexionapp.app.test_request_context():
            by_account = feedback.respondent_key(READER)
            # Same person, same account, a renamed institutional address.
            renamed = dict(READER, email="reader.new@example.org")
            self.assertEqual(by_account, feedback.respondent_key(renamed))
            # A different account is a different respondent.
            self.assertNotEqual(by_account, feedback.respondent_key(OTHER))

    def test_a_session_without_an_account_id_falls_back_to_the_email(self):
        with connexionapp.app.test_request_context():
            key = feedback.respondent_key({"email": "Dev@Example.org"})
            self.assertEqual(64, len(key))
            # Case-folded, so one person is one respondent.
            self.assertEqual(
                key, feedback.respondent_key({"email": "dev@example.org"}))

    def test_a_session_with_nothing_durable_cannot_rate(self):
        response = self.post(user={"name": "No identity"})
        self.assertEqual(403, response.status_code)
        self.assertEqual([], self.rows())

    def test_the_respondent_key_is_not_reversible_to_an_account(self):
        self.post()
        stored = self.rows()[0].respondent
        for leak in ("reader@example.org", "acct-reader", "@"):
            self.assertNotIn(leak, stored)
        self.assertEqual(64, len(stored))


class TestNoSecretMeansNoFallbackKey(FeedbackTestCase):
    """A hardcoded fallback key is a published key: anybody reading the source
    could mint tokens and forge respondents, while the signature went on
    looking like it proved something. Fail closed instead."""

    def without_a_secret(self):
        """Assignment, not `mock.patch.object`: Flask's `secret_key` is a
        config-backed property, and patch cannot delete it on exit."""
        previous = connexionapp.app.secret_key
        connexionapp.app.secret_key = ""
        self.addCleanup(setattr, connexionapp.app, "secret_key", previous)

    def test_the_respondent_key_refuses_rather_than_using_a_constant(self):
        self.without_a_secret()
        with connexionapp.app.test_request_context():
            with self.assertRaises(feedback.ConfigurationError):
                feedback.respondent_key(READER)

    def test_a_token_cannot_be_signed_without_a_secret(self):
        self.without_a_secret()
        with connexionapp.app.test_request_context():
            with self.assertRaises(feedback_context.ConfigurationError):
                feedback_context.issue(PAPER, "external", 5, 1)

    def test_a_token_cannot_be_verified_without_a_secret(self):
        token = self.context
        self.without_a_secret()
        with connexionapp.app.test_request_context():
            with self.assertRaises(feedback_context.ConfigurationError):
                feedback_context.verify(token, PAPER, "external")

    def test_a_post_without_a_secret_stores_nothing(self):
        self.without_a_secret()
        response = self.post()
        self.assertEqual(503, response.status_code)
        self.assertEqual([], self.rows())

    def test_the_known_fallback_string_appears_in_no_source_file(self):
        import io as _io
        for module in (feedback, feedback_context):
            source = _io.open(module.__file__, encoding="utf-8").read()
            self.assertNotIn("qresp-feedback", source)


# ------------------------------------------------------------------- CSRF

class TestCsrfIsActuallyApplied(FeedbackTestCase):
    """`csrf_protect` enforces only when a session is authenticated, and the
    endpoint is now authenticated-only -- so it enforces always.

    A REAL session, through dev-login, which is how the rest of the suite
    exercises CSRF. Patching `get_current_user` (what the other tests here do)
    deliberately does not create one, so it would test the handler and not the
    decorator.
    """

    def setUp(self):
        super(TestCsrfIsActuallyApplied, self).setUp()
        import os
        os.environ["QRESP_ENABLE_DEV_LOGIN"] = "1"
        self.addCleanup(os.environ.pop, "QRESP_ENABLE_DEV_LOGIN", None)
        self.client = connexionapp.test_client()
        self.client.post("/api/auth/dev-login",
                         json={"email": "reader@example.org"})
        self.csrf = self.client.get("/api/auth/me").json()["csrf_token"]

    def test_the_endpoint_is_wrapped(self):
        # The decorator is what makes a cookie-authenticated POST safe; an
        # unwrapped handler would accept a cross-site form post.
        self.assertTrue(hasattr(feedback.submit_feedback, "__wrapped__"))

    def test_a_missing_csrf_header_is_refused(self):
        response = self.client.post(ENDPOINT, json=self.body())
        self.assertEqual(403, response.status_code)
        self.assertIn("CSRF", response.json()["error"])
        self.assertEqual([], self.rows())

    def test_a_wrong_csrf_header_is_refused(self):
        response = self.client.post(ENDPOINT, json=self.body(),
                                    headers={"X-CSRF-Token": "not-the-token"})
        self.assertEqual(403, response.status_code)
        self.assertEqual([], self.rows())

    def test_the_right_csrf_header_is_accepted(self):
        response = self.client.post(ENDPOINT, json=self.body(),
                                    headers={"X-CSRF-Token": self.csrf})
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, len(self.rows()))

    def test_reading_my_own_rating_needs_no_csrf(self):
        # A GET changes nothing, so requiring a token would only break the
        # widget's restore on a fresh page.
        self.assertEqual(200, self.client.get(ENDPOINT).status_code)


# -------------------------------------------------------- the context token

class TestOnlyAVerifiedContextIsStored(FeedbackTestCase):
    def test_a_valid_context_is_accepted(self):
        self.assertEqual(200, self.post().status_code)
        self.assertEqual(1, len(self.rows()))

    def test_a_missing_context_is_refused(self):
        response = self.post({"rating": 4})
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_an_empty_context_is_refused(self):
        response = self.post(self.body(feedback_context=""))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_a_tampered_payload_is_refused(self):
        # Rewrite the claimed result count and keep the old signature.
        body, signature = self.context.split(".")
        forged = feedback_context._b64(
            b'{"exp":9999999999,"iat":1,"k":"%s","n":5,"p":"related-feedback"'
            b',"r":9999,"s":"external","v":1}' % PAPER.encode())
        response = self.post(
            self.body(feedback_context="%s.%s" % (forged, signature)))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_a_self_signed_token_is_refused(self):
        # Signed under a key that is not this deployment's.
        import hashlib
        import hmac as hmaclib
        body = self.context.split(".")[0]
        forged = feedback_context._b64(
            hmaclib.new(b"attacker", body.encode(), hashlib.sha256).digest())
        response = self.post(
            self.body(feedback_context="%s.%s" % (body, forged)))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_a_malformed_token_is_refused(self):
        for token in ("nonsense", "a.b.c", ".", "no-dot", "!!!.???"):
            response = self.post(self.body(feedback_context=token))
            self.assertEqual(400, response.status_code, token)
        self.assertEqual([], self.rows())

    def test_an_expired_context_is_refused_with_410(self):
        stale = context_for(now=int(time.time())
                            - feedback_context.TTL_SECONDS - 10)
        response = self.post(self.body(feedback_context=stale))
        self.assertEqual(410, response.status_code)
        self.assertEqual([], self.rows())

    def test_a_context_for_another_record_is_refused(self):
        other = context_for(cache_key="60316fb93f58fc9075286688")
        response = self.post(self.body(feedback_context=other))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_a_context_for_another_server_is_refused(self):
        # Same 24-hex id, different Qresp server: a different paper.
        remote = context_for(cache_key="%s|%s" % (PEER, PAPER))
        response = self.post(self.body(feedback_context=remote))
        self.assertEqual(400, response.status_code)
        # ...and it IS accepted when the request names that server.
        ok = self.post(self.body(feedback_context=remote),
                       params={"server": PEER})
        self.assertEqual(200, ok.status_code)
        self.assertEqual("%s|%s" % (PEER, PAPER), self.rows()[0].paper_id)

    def test_a_context_for_another_list_is_refused(self):
        internal = context_for(source="internal")
        response = self.post(self.body(feedback_context=internal))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_no_token_is_issued_for_an_empty_list(self):
        # An empty list cannot be rated, because there is nothing to sign.
        with connexionapp.app.test_request_context():
            self.assertEqual("", feedback_context.issue(PAPER, "external", 0, 0))
            self.assertEqual("", feedback_context.issue("", "external", 5, 1))

    def test_a_token_claiming_no_results_is_refused(self):
        # Belt and braces: `issue` will not mint one, so a payload that says
        # zero did not come from this server.
        with connexionapp.app.test_request_context():
            body = feedback_context._b64(
                b'{"exp":9999999999,"iat":1,"k":"%s","n":1,'
                b'"p":"related-feedback","r":0,"s":"external","v":1}'
                % PAPER.encode())
            token = "%s.%s" % (
                body, feedback_context._b64(
                    feedback_context._sign(body.encode())))
        response = self.post(self.body(feedback_context=token))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_a_token_from_another_purpose_is_refused(self):
        with connexionapp.app.test_request_context():
            body = feedback_context._b64(
                b'{"exp":9999999999,"iat":1,"k":"%s","n":1,'
                b'"p":"some-other-feature","r":5,"s":"external","v":1}'
                % PAPER.encode())
            token = "%s.%s" % (
                body, feedback_context._b64(
                    feedback_context._sign(body.encode())))
        self.assertEqual(400,
                         self.post(self.body(feedback_context=token)).status_code)

    def test_the_token_carries_no_recommendation_detail_or_identity(self):
        import base64
        body = self.context.split(".")[0]
        padded = body + "=" * (-len(body) % 4)
        payload = base64.urlsafe_b64decode(padded).decode("utf-8")
        for leak in ("doi", "title", "10.", "score", "reason", "email",
                     "reader", "acct-", "session"):
            self.assertNotIn(leak, payload.lower(), leak)

    def test_verification_makes_no_outbound_request(self):
        # A rating must be cheap: no provider, no peer, no cache read.
        import requests
        with mock.patch.object(requests, "get",
                               side_effect=AssertionError("no request")):
            self.assertEqual(200, self.post().status_code)


class TestTheClientCannotInventTheContext(FeedbackTestCase):
    def test_a_claimed_result_count_is_ignored(self):
        # The body says 999; the token says 25. The token wins -- and the
        # field is not even in the contract any more.
        token = context_for(results=25, pages=5)
        self.post(self.body(feedback_context=token, results_shown=999))
        self.assertEqual(25, self.rows()[0].results_shown)

    def test_the_stored_count_comes_from_the_token_for_a_short_list(self):
        token = context_for(results=3, pages=1)
        self.post(self.body(feedback_context=token))
        self.assertEqual(3, self.rows()[0].results_shown)

    def test_a_page_beyond_the_list_is_clamped(self):
        token = context_for(results=7, pages=2)
        self.post(self.body(feedback_context=token, page_at_submit=5,
                            pages_viewed=5))
        row = self.rows()[0]
        self.assertEqual(2, row.page_at_submit)
        self.assertEqual(2, row.pages_viewed)

    def test_pages_viewed_is_never_below_the_page_submitted_from(self):
        token = context_for(results=25, pages=5)
        self.post(self.body(feedback_context=token, page_at_submit=4,
                            pages_viewed=1))
        row = self.rows()[0]
        self.assertEqual(4, row.page_at_submit)
        self.assertEqual(4, row.pages_viewed)

    def test_junk_page_context_is_refused_at_the_contract(self):
        response = self.post(self.body(pages_viewed="lots"))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_the_handler_defaults_junk_pages_rather_than_failing(self):
        # Behind the contract: the number is context for a rating, and losing
        # the rating over an unreadable one would be the wrong trade.
        with connexionapp.app.test_request_context():
            with mock.patch.object(feedback, "get_current_user",
                                   return_value=READER):
                _body, status = feedback.submit_feedback(
                    PAPER, self.body(page_at_submit=None, pages_viewed="lots"))
        self.assertEqual(200, status)
        row = self.rows()[0]
        self.assertEqual(1, row.page_at_submit)
        self.assertEqual(1, row.pages_viewed)


# --------------------------------------------------------------- validation

class TestInputValidation(FeedbackTestCase):
    def test_a_rating_of_one_to_five_is_accepted(self):
        for rating in (1, 2, 3, 4, 5):
            RecommendationFeedback.drop_collection()
            response = self.post(self.body(rating=rating))
            self.assertEqual(200, response.status_code, rating)
            self.assertEqual(rating, response.json()["rating"])

    def test_a_rating_outside_the_scale_is_refused(self):
        for rating in (0, 6, -1, 99):
            self.assertEqual(400,
                             self.post(self.body(rating=rating)).status_code)
        self.assertEqual([], self.rows())

    def test_an_unknown_reason_code_is_refused_not_dropped(self):
        response = self.post(self.body(
            rating=1, reasons=["too_many_unrelated", "made_up"]))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_every_documented_reason_is_accepted(self):
        self.post(self.body(rating=1, reasons=list(feedback.REASONS)))
        self.assertEqual(sorted(feedback.REASONS),
                         sorted(self.rows()[0].reasons))

    def test_a_reason_is_dropped_from_a_high_rating(self):
        self.post(self.body(rating=5, reasons=["too_many_unrelated"]))
        self.assertEqual([], self.rows()[0].reasons)

    def test_an_over_long_comment_is_refused(self):
        response = self.post(self.body(
            rating=3, comment="x" * (feedback.MAX_COMMENT_CHARS + 1)))
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())

    def test_an_unknown_source_is_refused(self):
        self.assertEqual(
            400, self.post(self.body(source="somewhere_else")).status_code)
        self.assertEqual([], self.rows())

    def test_a_server_outside_the_federation_is_refused(self):
        response = self.post(params={"server": "https://evil.example.org"})
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.rows())


class TestTheHandlerValidatesToo(FeedbackTestCase):
    """The OpenAPI schema refuses most bad input at the edge, and the tests
    above pin that. These call the handler DIRECTLY, because the contract is
    also the thing that gets loosened -- and when it is, the handler is what
    still stands between junk and the average."""

    def call(self, body, user=READER, server=None):
        with connexionapp.app.test_request_context():
            with mock.patch.object(feedback, "get_current_user",
                                   return_value=user):
                return feedback.submit_feedback(PAPER, body, server=server)

    def test_the_handler_refuses_an_anonymous_caller(self):
        _body, status = self.call(self.body(), user=None)
        self.assertEqual(401, status)

    def test_the_handler_refuses_a_rating_outside_the_scale(self):
        for rating in (0, 6, -3, 42):
            body, status = self.call(self.body(rating=rating))
            self.assertEqual(400, status, rating)
            self.assertIn("1 to 5", body["error"])

    def test_the_handler_refuses_a_boolean_rating(self):
        _body, status = self.call(self.body(rating=True))
        self.assertEqual(400, status)

    def test_the_handler_names_an_unknown_reason(self):
        body, status = self.call(self.body(rating=1, reasons=["made_up"]))
        self.assertEqual(400, status)
        self.assertIn("made_up", body["error"])

    def test_the_handler_refuses_reasons_that_are_not_a_list(self):
        _body, status = self.call(self.body(rating=1, reasons="other"))
        self.assertEqual(400, status)

    def test_a_duplicate_reason_is_counted_once(self):
        self.call(self.body(rating=1, reasons=["other", "other"]))
        self.assertEqual(["other"], self.rows()[0].reasons)


# ------------------------------------------------------------------- upsert

class TestOneOpinionPerAccount(FeedbackTestCase):
    def test_a_second_submission_updates_the_first(self):
        self.post(self.body(rating=2, reasons=["already_knew_these"]))
        self.post(self.body(rating=5))
        rows = self.rows()
        self.assertEqual(1, len(rows))
        self.assertEqual(5, rows[0].rating)
        # Reasons that belonged to the old low score are gone from the
        # DATABASE, not merely from the screen.
        self.assertEqual([], rows[0].reasons)

    def test_created_at_survives_an_update(self):
        self.post(self.body(rating=1))
        created = self.rows()[0].created_at
        self.post(self.body(rating=4))
        row = self.rows()[0]
        self.assertEqual(created, row.created_at)
        self.assertGreaterEqual(row.updated_at, created)

    def test_two_accounts_are_two_rows(self):
        self.post(user=READER)
        self.post(self.body(rating=1), user=OTHER)
        self.assertEqual(2, len(self.rows()))

    def test_the_two_lists_are_rated_separately(self):
        self.post()
        self.post(self.body(feedback_context=context_for(source="internal"),
                            source="internal", rating=1))
        rows = {row.source: row.rating for row in self.rows()}
        self.assertEqual({"external": 4, "internal": 1}, rows)

    def test_every_stored_row_is_marked_as_an_account_respondent(self):
        self.post()
        self.assertEqual(feedback.RESPONDENT_ACCOUNT,
                         self.rows()[0].respondent_kind)


# --------------------------------------------------------- reading my own

class TestReadingMyOwnRating(FeedbackTestCase):
    def test_an_unrated_record_answers_with_a_null_rating(self):
        body = self.get_mine().json()
        self.assertIsNone(body["rating"])
        self.assertEqual([], body["reasons"])
        self.assertEqual("", body["comment"])

    def test_my_rating_comes_back(self):
        self.post(self.body(rating=2, reasons=["need_more_variety"],
                            comment="too broad"))
        body = self.get_mine().json()
        self.assertEqual(2, body["rating"])
        self.assertEqual(["need_more_variety"], body["reasons"])
        self.assertEqual("too broad", body["comment"])

    def test_i_never_see_somebody_elses_rating(self):
        self.post(self.body(rating=1, comment="a private thought"),
                  user=OTHER)
        body = self.get_mine(user=READER).json()
        self.assertIsNone(body["rating"])
        self.assertNotIn("a private thought", str(body))

    def test_it_returns_no_respondent_key_and_no_aggregate(self):
        self.post(self.body(rating=3))
        body = self.get_mine().json()
        self.assertEqual({"paper_id", "source", "rating", "reasons",
                          "comment"}, set(body))
        self.assertNotIn(self.rows()[0].respondent, str(body))

    def test_the_two_lists_are_read_apart(self):
        self.post(self.body(rating=5))
        body = self.get_mine(params={"source": "internal"}).json()
        self.assertIsNone(body["rating"])

    def test_a_server_outside_the_federation_is_refused(self):
        response = self.get_mine(params={"server": "https://evil.example.org"})
        self.assertEqual(400, response.status_code)


# -------------------------------------------------------------- permissions

class TestWhoCanReadTheSummary(FeedbackTestCase):
    def summary(self, user=None, params=None):
        with mock.patch.object(feedback, "get_current_user",
                               return_value=user):
            return self.client.get(SUMMARY, params=params or {})

    def test_an_anonymous_reader_may_not_read_the_summary(self):
        self.assertEqual(401, self.summary().status_code)

    def test_a_signed_in_non_admin_may_not_read_the_summary(self):
        self.assertEqual(403, self.summary(user=READER).status_code)

    def test_an_admin_may_read_the_summary(self):
        self.assertEqual(200, self.summary(user=ADMIN).status_code)

    def test_the_summary_never_returns_a_comment_identifier_or_record(self):
        self.post(self.body(rating=1, reasons=["other"],
                            comment="a private thought"))
        body = self.summary(user=ADMIN).json()
        text = str(body)
        self.assertNotIn("a private thought", text)
        self.assertNotIn(self.rows()[0].respondent, text)
        self.assertNotIn("reader@example.org", text)
        self.assertNotIn(PAPER, text)
        self.assertEqual(
            {"responses", "average_rating", "rating_distribution",
             "low_ratings", "low_rating_reasons", "by_source", "note"},
            set(body))

    def test_a_submission_echoes_only_the_readers_own_answer(self):
        self.post(self.body(rating=1, comment="mine"), user=OTHER)
        body = self.post(self.body(rating=2, reasons=["other"]),
                         user=READER).json()
        self.assertEqual({"paper_id", "source", "rating", "reasons",
                          "comment", "saved"}, set(body))
        self.assertEqual(2, body["rating"])


class TestAggregate(FeedbackTestCase):
    def summary(self, params=None):
        with mock.patch.object(feedback, "get_current_user",
                               return_value=ADMIN):
            return self.client.get(SUMMARY, params=params or {}).json()

    def seed(self, *ratings, **kwargs):
        source = kwargs.get("source", "external")
        reasons = kwargs.get("reasons")
        token = context_for(source=source)
        for index, rating in enumerate(ratings):
            self.post({"rating": rating, "source": source,
                       "feedback_context": token,
                       "reasons": reasons or []},
                      user={"account_id": "acct-%d" % index,
                            "email": "reader%d@example.org" % index})

    def test_counts_average_and_distribution(self):
        self.seed(5, 4, 4, 1)
        body = self.summary()
        self.assertEqual(4, body["responses"])
        self.assertEqual(3.5, body["average_rating"])
        self.assertEqual({"1": 1, "2": 0, "3": 0, "4": 2, "5": 1},
                         body["rating_distribution"])

    def test_low_rating_reasons_are_tallied(self):
        self.seed(1, 2, reasons=["too_many_unrelated", "other"])
        body = self.summary()
        self.assertEqual(2, body["low_ratings"])
        self.assertEqual(2, body["low_rating_reasons"]["too_many_unrelated"])
        self.assertEqual(0, body["low_rating_reasons"]["need_more_variety"])

    def test_no_responses_gives_a_null_average_not_zero(self):
        body = self.summary()
        self.assertEqual(0, body["responses"])
        self.assertIsNone(body["average_rating"])

    def test_the_two_lists_are_reported_apart(self):
        self.seed(5, source="external")
        self.seed(1, source="internal")
        body = self.summary()
        self.assertEqual(5.0, body["by_source"]["external"]["average_rating"])
        self.assertEqual(1.0, body["by_source"]["internal"]["average_rating"])

    def test_an_unknown_source_filter_is_refused(self):
        with mock.patch.object(feedback, "get_current_user",
                               return_value=ADMIN):
            response = self.client.get(SUMMARY, params={"source": "nope"})
        self.assertEqual(400, response.status_code)

    def test_rows_from_the_anonymous_era_are_left_out_not_broken_on(self):
        # Rows written while anonymous rating was allowed have no
        # `respondent_kind`. They were never one-per-reader, so counting them
        # would carry that defect into the new figure -- and the summary must
        # not fall over on them either.
        RecommendationFeedback(paper_id=PAPER, source="external",
                               respondent="legacy-anonymous-hash",
                               rating=1).save()
        self.seed(5)
        body = self.summary()
        self.assertEqual(1, body["responses"])
        self.assertEqual(5.0, body["average_rating"])

    def test_a_legacy_row_does_not_collide_with_a_new_account_row(self):
        RecommendationFeedback(paper_id=PAPER, source="external",
                               respondent="legacy-anonymous-hash",
                               rating=1).save()
        self.assertEqual(200, self.post().status_code)
        self.assertEqual(2, len(self.rows()))


# ------------------------------------------------------- what is NOT stored

class TestNothingSensitiveIsStored(FeedbackTestCase):
    def test_no_request_metadata_reaches_the_document(self):
        with mock.patch.object(feedback, "get_current_user",
                               return_value=READER):
            self.client.post(
                ENDPOINT,
                json=self.body(rating=1, comment="too broad"),
                headers={"User-Agent": "SecretBrowser/9.9",
                         "X-Forwarded-For": "203.0.113.7",
                         "Referer": "https://example.org/paperdetails/x"})
        blob = str(self.rows()[0].to_mongo().to_dict()).lower()
        for leak in ("secretbrowser", "203.0.113.7", "x-forwarded-for",
                     "referer", "example.org", "reader@example.org",
                     "acct-reader", "user-agent"):
            self.assertNotIn(leak, blob, leak)

    def test_the_document_carries_only_the_documented_fields(self):
        self.post(self.body(rating=2, reasons=["other"], comment="hm",
                            page_at_submit=2, pages_viewed=3))
        self.assertEqual(
            {"_id", "paper_id", "source", "respondent", "respondent_kind",
             "rating", "reasons", "comment", "results_shown",
             "page_at_submit", "pages_viewed", "created_at", "updated_at"},
            set(self.rows()[0].to_mongo().to_dict()))

    def test_gate_scores_and_recommended_papers_are_not_accepted(self):
        self.post(self.body(
            rating=3, gate_score=11.4,
            reasons_shown=["Shares 3 specific research terms"],
            recommended=[{"title": "A paper", "doi": "10.1/x"}],
            email="someone@example.org", ip="203.0.113.7"))
        blob = str(self.rows()[0].to_mongo().to_dict())
        for leak in ("11.4", "specific research terms", "A paper", "10.1/x",
                     "someone@example.org", "203.0.113.7"):
            self.assertNotIn(leak, blob, leak)


if __name__ == "__main__":
    unittest.main()
