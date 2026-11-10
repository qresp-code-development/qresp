"""What Related Research costs, and what it tells you when it is empty.

Two contracts are pinned here.

**API economy.** A reader pressing reload, and five readers arriving at once,
must not multiply the requests this feature makes to a federated peer or to
Semantic Scholar. The call counts below are the contract; they are exact
numbers, not upper bounds, because a regression here is invisible in the UI
and only shows up as somebody else's rate limit.

**Why the external list is empty.** "No external papers" has five different
causes and used to have one sentence. Each cause is now its own reason code,
and the four provider outcomes are told apart.
"""
import json
import threading
import unittest
from unittest import mock

import mongoengine
import mongomock

from project import federation, related, relatedcache
from project.models import Paper, RelatedResearchCache
from project.tests.test_related_research import (ENABLED, INTERNAL_ONLY,
                                                 PEER, REGISTRY, PeerStub,
                                                 ProviderStub, RelatedTestCase,
                                                 peer_corpus)


class CacheTestCase(RelatedTestCase):
    def setUp(self):
        super(CacheTestCase, self).setUp()
        federation._allowlist = {"origins": frozenset(), "at": None}
        federation._dns_cache.clear()
        self._dns = mock.patch.object(federation, "_resolve_addresses",
                                      return_value={"93.184.216.34"})
        self._dns.start()
        self.addCleanup(self._dns.stop)
        # Stale-while-revalidate refreshes run INLINE here, so the requests
        # they make are counted in the same assertions as everything else.
        self._spawn = mock.patch.object(
            relatedcache, "spawn_background",
            side_effect=lambda function: function())
        self._spawn.start()
        self.addCleanup(self._spawn.stop)

    def tearDown(self):
        federation._allowlist = {"origins": frozenset(), "at": None}
        federation._dns_cache.clear()
        super(CacheTestCase, self).tearDown()

    def views(self, count, paper_id="remote-subject", server=PEER,
              env=None, peer=None, provider=None):
        """`count` page views of the same record. Returns (peer, provider)."""
        peer = peer if peer is not None else PeerStub()
        provider = provider if provider is not None else ProviderStub()
        with mock.patch.dict('os.environ', env or INTERNAL_ONLY):
            with mock.patch.object(related, 'requests', provider):
                with mock.patch.object(federation, 'requests', peer):
                    with mock.patch.object(federation, '_registry_servers',
                                           return_value=REGISTRY):
                        for _ in range(count):
                            response = self.client.get(
                                '/api/paper/%s/related' % paper_id,
                                params={"server": server})
                            self.assertEqual(200, response.status_code)
        return peer, provider

    def external(self, provider=None, peer=None):
        """ONE view, so the pipeline counts come from the live computation
        rather than from the stored answer."""
        provider = provider if provider is not None else ProviderStub()
        peer = peer if peer is not None else PeerStub()
        with mock.patch.dict('os.environ', ENABLED):
            with mock.patch.object(related, 'requests', provider):
                with mock.patch.object(federation, 'requests', peer):
                    with mock.patch.object(federation, '_registry_servers',
                                           return_value=REGISTRY):
                        response = self.client.get(
                            '/api/paper/remote-subject/related',
                            params={"server": PEER})
        self.assertEqual(200, response.status_code)
        return response.json()["external"]


class TestPeerRequestsAreNotMultiplied(CacheTestCase):
    def test_five_reloads_of_one_record_read_the_peer_once(self):
        # Before: 2 requests per view, 10 for five views.
        peer, _ = self.views(5)
        self.assertEqual(2, len(peer.calls))
        self.assertEqual(
            ["%s/api/paper/remote-subject" % PEER, "%s/api/search" % PEER],
            sorted(call["url"] for call in peer.calls))

    def test_five_concurrent_readers_read_the_peer_once(self):
        peer = PeerStub()
        provider = ProviderStub()
        errors = []
        start = threading.Barrier(5)

        def view():
            try:
                start.wait(timeout=10)
                self.client.get('/api/paper/remote-subject/related',
                                params={"server": PEER})
            except Exception as e:  # pragma: no cover - surfaced below
                errors.append(e)

        with mock.patch.dict('os.environ', INTERNAL_ONLY):
            with mock.patch.object(related, 'requests', provider):
                with mock.patch.object(federation, 'requests', peer):
                    with mock.patch.object(federation, '_registry_servers',
                                           return_value=REGISTRY):
                        threads = [threading.Thread(target=view)
                                   for _ in range(5)]
                        for thread in threads:
                            thread.start()
                        for thread in threads:
                            thread.join(timeout=30)
        self.assertEqual([], errors)
        # Single-flight: one round of reads for all five.
        self.assertEqual(2, len(peer.calls))

    def test_a_second_record_on_the_same_peer_reuses_the_corpus(self):
        # The corpus is per ORIGIN, so the expensive read is shared by every
        # record on that server.
        peer, _ = self.views(1)
        self.views(1, paper_id="remote-near", peer=peer)
        urls = [call["url"] for call in peer.calls]
        self.assertEqual(1, urls.count("%s/api/search" % PEER))
        self.assertEqual(2, len([u for u in urls if "/api/paper/" in u]))

    def test_a_peer_failure_is_not_retried_on_every_reload(self):
        peer, _ = self.views(5, peer=PeerStub(record_mode="timeout"))
        # One attempt, then the short negative cache absorbs the rest.
        self.assertEqual(1, len(peer.calls))

    def test_a_local_record_is_computed_every_time_and_reads_no_peer(self):
        # Local answers come from this server's own database, cost no peer or
        # provider request, and must keep the immediacy the product promises:
        # deactivate a record and it is gone on the next reload.
        peer = PeerStub()
        provider = ProviderStub()
        with mock.patch.dict('os.environ', INTERNAL_ONLY):
            with mock.patch.object(related, 'requests', provider):
                with mock.patch.object(federation, 'requests', peer):
                    for _ in range(5):
                        response = self.client.get(
                            '/api/paper/%s/related' % self.subject_id)
                        self.assertEqual(200, response.status_code)
                    self.assertTrue(response.json()["internal"]["results"])
                    Paper.objects(id=self.subject_id).update_one(
                        set__is_active=False)
                    hidden = self.client.get(
                        '/api/paper/%s/related' % self.subject_id)
        self.assertEqual([], peer.calls)
        self.assertEqual(404, hidden.status_code)


class TestProviderRequestsAreNotMultiplied(CacheTestCase):
    def test_five_reloads_ask_semantic_scholar_once(self):
        _, provider = self.views(5, env=ENABLED)
        # Two calls: resolve this paper, then ask for recommendations.
        self.assertEqual(2, len(provider.calls))

    def test_the_existing_mongo_cache_is_what_serves_the_second_view(self):
        # No second cache layer was added for the provider: the durable
        # RelatedResearchCache row is still the thing that prevents the call.
        _, provider = self.views(1, env=ENABLED)
        self.assertEqual(1, RelatedResearchCache.objects.count())
        related.reset_caches()          # drop only the in-process caches
        _, provider2 = self.views(1, env=ENABLED)
        self.assertEqual([], provider2.calls)


class TestAlgorithmVersionInvalidation(CacheTestCase):
    def test_a_version_bump_discards_a_stored_answer(self):
        self.views(1, env=ENABLED)
        entry = RelatedResearchCache.objects.first()
        self.assertEqual(related.ALGORITHM_VERSION, entry.algorithm_version)
        related.reset_caches()
        with mock.patch.object(related, "ALGORITHM_VERSION", "999"):
            _, provider = self.views(1, env=ENABLED)
        # The stored answer describes rules that no longer exist, so the
        # provider is asked again rather than the old answer being served.
        self.assertTrue(provider.calls)

    def test_an_entry_written_before_the_field_existed_is_a_miss(self):
        self.views(1, env=ENABLED)
        RelatedResearchCache.objects.update(unset__algorithm_version=1)
        related.reset_caches()
        _, provider = self.views(1, env=ENABLED)
        self.assertTrue(provider.calls)

    def test_the_version_is_part_of_the_in_process_key(self):
        first = related._result_key(PEER, "abc")
        with mock.patch.object(related, "ALGORITHM_VERSION", "999"):
            second = related._result_key(PEER, "abc")
        self.assertNotEqual(first, second)

    def test_an_entry_written_under_the_three_result_behaviour_is_a_miss(self):
        # The specific migration this bump is for. An entry stamped "3" holds
        # at most three external results chosen from a 20-candidate pool.
        # Serving it now would show a reader a one-page list and present it as
        # the whole answer, which is the exact failure the version exists to
        # prevent -- so the stored answer must be discarded, not topped up.
        self.views(1, env=ENABLED)
        RelatedResearchCache.objects.update(set__algorithm_version="3")
        related.reset_caches()
        _, provider = self.views(1, env=ENABLED)
        self.assertTrue(provider.calls)
        self.assertEqual(related.ALGORITHM_VERSION,
                         RelatedResearchCache.objects.first().algorithm_version)
        self.assertNotEqual("3", related.ALGORITHM_VERSION)

    def test_an_entry_written_under_the_gate_filtered_external_list_is_a_miss(self):
        # The migration THIS bump is for. An entry stamped "4" holds an
        # external list the quality gate filtered: often far shorter than the
        # 25 the same record yields now, and sometimes empty for a record that
        # today has results. Serving it would present the old policy's answer
        # under the new one's contract, so the stored answer is discarded and
        # recomputed rather than topped up.
        self.views(1, env=ENABLED)
        RelatedResearchCache.objects.update(set__algorithm_version="4")
        related.reset_caches()
        _, provider = self.views(1, env=ENABLED)
        self.assertTrue(provider.calls)
        self.assertEqual(related.ALGORITHM_VERSION,
                         RelatedResearchCache.objects.first().algorithm_version)
        self.assertNotEqual("4", related.ALGORITHM_VERSION)

    def test_the_bumped_key_still_namespaces_a_federated_record(self):
        # A version bump must not flatten the server namespace: the same
        # 24-hex id on two Qresp servers is two different papers, and one of
        # them must never be served the other's recommendations.
        local = related._result_key(None, "abc")
        remote = related._result_key(PEER, "abc")
        self.assertNotEqual(local, remote)
        self.assertIn(related.ALGORITHM_VERSION, local)
        self.assertIn(related.ALGORITHM_VERSION, remote)
        self.assertIn(PEER, remote)


class TestStaleWhileRevalidate(CacheTestCase):
    def test_a_stale_answer_is_served_and_refreshed_behind_the_reader(self):
        clock = {"now": 1000.0}
        cache = relatedcache.TTLCache(clock=lambda: clock["now"])
        with mock.patch.object(related, "_result_cache", cache):
            peer, _ = self.views(1)
            self.assertEqual(2, len(peer.calls))
            # Past fresh, inside the stale window.
            clock["now"] += related.RESULT_TTL_SECONDS + 1
            related._remote_record_cache.clear()
            related._remote_corpus_cache.clear()
            self.views(1, peer=peer)
        # The reader got an answer, and a refresh happened behind them.
        self.assertEqual(4, len(peer.calls))

    def test_past_the_stale_window_the_entry_is_gone(self):
        clock = {"now": 1000.0}
        cache = relatedcache.TTLCache(clock=lambda: clock["now"])
        with mock.patch.object(related, "_result_cache", cache):
            self.views(1)
            clock["now"] += (related.RESULT_TTL_SECONDS
                             + related.RESULT_STALE_TTL_SECONDS + 1)
            _, state = cache.get(related._result_key(PEER, "remote-subject"))
        self.assertEqual("miss", state)


class TestWhyTheExternalListIsEmpty(CacheTestCase):
    """Requirement B: five causes, five reason codes, and the pipeline counts
    that let an operator see where the candidates went."""

    def test_a_healthy_answer_with_results(self):
        section = self.external()
        self.assertEqual("ok", section["status"])
        self.assertEqual(related.REASON_OK, section["reason"])
        self.assertTrue(section["results"])

    def test_the_provider_had_nothing_to_propose(self):
        section = self.external(provider=ProviderStub(recommendations=[]))
        self.assertEqual("ok", section["status"])
        self.assertEqual(related.REASON_PROVIDER_EMPTY, section["reason"])
        self.assertEqual(0, section["pipeline"]["raw_candidates"])

    def test_a_gate_rejected_candidate_is_shown_ranked_low_not_removed(self):
        # The policy this task implements: the evidence gate no longer
        # empties this list. A candidate with no nameable evidence is still
        # scored, still ranked, and still shown -- it simply carries no
        # `reasons`. `REASON_ALL_FILTERED` ("all_candidates_below_quality_
        # gate") does not fire any more; see
        # `test_the_provider_proposed_only_the_paper_itself` for what still
        # empties this list.
        from project.tests.test_related_research import UNRELATED_EXTERNAL
        section = self.external(
            provider=ProviderStub(recommendations=[UNRELATED_EXTERNAL]))
        self.assertEqual("ok", section["status"])
        self.assertEqual(related.REASON_OK, section["reason"])
        self.assertEqual(1, len(section["results"]))
        self.assertEqual([], section["results"][0]["reasons"])
        # The counts say exactly where it went: proposed, deduplicated,
        # SCORED (not filtered -- `scored_candidates == after_dedupe` is the
        # proof), and shown.
        self.assertEqual(1, section["pipeline"]["raw_candidates"])
        self.assertEqual(1, section["pipeline"]["valid_candidates"])
        self.assertEqual(1, section["pipeline"]["after_dedupe"])
        self.assertEqual(1, section["pipeline"]["scored_candidates"])
        self.assertEqual(1, section["pipeline"]["shown"])

    def test_the_provider_proposed_only_the_paper_itself(self):
        # What STILL empties this list under the current policy: nothing
        # survived de-duplication, not "the gate rejected everything".
        from project.tests.test_related_research import recommendation
        self_reference = recommendation(
            "Rareword resonance of gadgetite lattices",  # the subject's own
            "A different abstract under the same title.",  # title
            doi="10.9999/not-the-real-doi")
        section = self.external(
            provider=ProviderStub(recommendations=[self_reference]))
        self.assertEqual("ok", section["status"])
        self.assertEqual(related.REASON_NO_VALID_CANDIDATES,
                         section["reason"])
        self.assertEqual([], section["results"])
        self.assertEqual(1, section["pipeline"]["raw_candidates"])
        self.assertEqual(1, section["pipeline"]["valid_candidates"])
        self.assertEqual(0, section["pipeline"]["after_dedupe"])
        self.assertEqual(0, section["pipeline"]["scored_candidates"])
        self.assertEqual(0, section["pipeline"]["shown"])

    def test_this_paper_is_not_in_the_providers_index(self):
        stub = ProviderStub()
        stub.resolution_mode = "not_found"
        section = self.external(provider=stub)
        self.assertEqual("unresolved", section["status"])
        self.assertEqual(related.REASON_SOURCE_UNRESOLVED, section["reason"])
        self.assertFalse(section["pipeline"]["resolved"])

    def test_a_rate_limit_is_not_an_empty_answer(self):
        stub = ProviderStub()
        stub.resolution_mode = "rate_limited"
        section = self.external(provider=stub)
        self.assertEqual("unavailable", section["status"])
        self.assertEqual(related.REASON_RATE_LIMITED, section["reason"])

    def test_a_timeout_is_told_apart_from_a_rate_limit(self):
        stub = ProviderStub()
        stub.resolution_mode = "timeout"
        section = self.external(provider=stub)
        self.assertEqual("unavailable", section["status"])
        self.assertEqual(related.REASON_TIMEOUT, section["reason"])

    def test_an_empty_answer_and_a_failure_are_cached_differently(self):
        self.external(provider=ProviderStub(recommendations=[]))
        empty = RelatedResearchCache.objects.first()
        self.assertEqual("ok", empty.status)
        self.assertEqual(related.REASON_PROVIDER_EMPTY, empty.reason)
        empty_expiry = empty.expires_at

        RelatedResearchCache.drop_collection()
        related.reset_caches()   # otherwise the response cache answers first
        stub = ProviderStub()
        stub.resolution_mode = "rate_limited"
        self.external(provider=stub)
        failed = RelatedResearchCache.objects.first()
        self.assertEqual("unavailable", failed.status)
        self.assertEqual(related.REASON_RATE_LIMITED, failed.reason)
        # A healthy empty answer is kept for days; a failure for an hour.
        self.assertGreater(empty_expiry, failed.expires_at)

    def test_no_provider_body_or_credential_reaches_the_diagnosis(self):
        stub = ProviderStub()
        stub.resolution_mode = "rate_limited"
        section = self.external(provider=stub)
        text = json.dumps(section)
        for leak in ("x-api-key", "Authorization", "test-s2-super-secret",
                     "Too Many Requests", "error"):
            self.assertNotIn(leak, text, leak)


class TestNoLanguageModelIsInvolved(CacheTestCase):
    """Related Research uses no Gemini and consumes no Gemini quota. Qresp's
    two AI features live elsewhere (assist.py, curation.py); this path must
    never reach them, however the section is configured."""

    def test_the_serving_path_never_calls_gemini(self):
        import project.assist as assist
        with mock.patch.object(assist, "call_gemini") as gemini:
            with mock.patch.object(assist, "requests") as assist_requests:
                self.views(3, env=ENABLED)
                self.views(3, env=INTERNAL_ONLY)
                self.client.get('/api/paper/%s/related' % self.subject_id)
        self.assertEqual(0, gemini.call_count)
        self.assertEqual(0, assist_requests.post.call_count)

    def test_no_module_on_this_path_imports_the_assist_client(self):
        import project.related as related_module
        import project.relatedcache as cache_module
        import project.relatedness as scoring
        for module in (related_module, cache_module, scoring, federation):
            source = open(module.__file__, encoding="utf-8").read()
            self.assertNotIn("import assist", source, module.__name__)
            self.assertNotIn("call_gemini", source, module.__name__)
            self.assertNotIn("generativelanguage", source, module.__name__)

    def test_the_only_outbound_hosts_are_the_peer_and_semantic_scholar(self):
        peer, provider = self.views(2, env=ENABLED)
        for call in peer.calls:
            self.assertTrue(call["url"].startswith(PEER), call["url"])
        for call in provider.calls:
            self.assertTrue(
                call["url"].startswith(related.SEMANTIC_SCHOLAR_ORIGIN),
                call["url"])


if __name__ == "__main__":
    unittest.main()
