"""Workflow V1 graph validation.

The graph is curator input, so every test here is about what it REFUSES and
what it must keep accepting. The second half matters as much as the first: a
record written before V1 has untyped edges and no workflow at all, and neither
may become unstorable.
"""

import unittest

from project.workflow import (
    CONSUMES,
    FEEDS_INTO,
    GENERATES,
    LINKS_TO,
    RELATED_TO,
    USES_TOOL,
    WorkflowError,
    artifact_ids,
    artifact_types,
    normalize_edge,
    validate_workflow,
)
from project.workflow import _has_cycle


def paper(edges=None, **overrides):
    """A paper holding one of each artifact, so ids c0/s0/d0/t0/h0 all exist."""
    data = {
        "charts": [{"id": "c0"}],
        "scripts": [{"id": "s0"}],
        "datasets": [{"id": "d0"}],
        "tools": [{"id": "t0"}],
        "heads": [{"id": "h0"}],
    }
    data.update(overrides)
    if edges is not None:
        data["workflow"] = {"nodes": sorted(artifact_ids(data)),
                            "edges": edges}
    return data


def edge(source, target, kind=None):
    built = {"from": source, "to": target}
    if kind:
        built["type"] = kind
    return built


class TestAcceptedGraphs(unittest.TestCase):
    def test_a_paper_with_no_workflow_at_all(self):
        # The overwhelmingly common legacy record.
        validate_workflow({"charts": [{"id": "c0"}]})
        validate_workflow(paper())

    def test_an_empty_workflow(self):
        validate_workflow(paper(edges=[]))
        validate_workflow({"workflow": {"nodes": [], "edges": []}})

    def test_the_three_relationships_v1_understands(self):
        validate_workflow(paper(edges=[
            edge("d0", "s0", CONSUMES),
            edge("h0", "s0", CONSUMES),
            edge("t0", "s0", USES_TOOL),
            edge("s0", "c0", GENERATES),
        ]))

    def test_data_may_be_consumed_by_a_chart_directly(self):
        # Not every figure goes through a script.
        validate_workflow(paper(edges=[edge("d0", "c0", CONSUMES)]))

    def test_legacy_untyped_pairs_are_still_accepted(self):
        # What every record written before V1 holds. Nothing infers a type
        # for one; it is stored exactly as it is.
        validate_workflow(paper(edges=[["s0", "c0"], ["d0", "s0"]]))

    def test_typed_and_untyped_edges_can_coexist(self):
        # A curator who edits half an old graph does not have to finish it.
        validate_workflow(paper(edges=[["d0", "s0"],
                                       edge("s0", "c0", GENERATES)]))

    def test_one_artifact_may_serve_several_figures(self):
        # A script feeding two charts is ordinary, not a duplicate.
        data = paper()
        data["charts"] = [{"id": "c0"}, {"id": "c1"}]
        data["workflow"] = {"nodes": [], "edges": [
            edge("s0", "c0", GENERATES),
            edge("s0", "c1", GENERATES),
            edge("d0", "s0", CONSUMES),
        ]}
        validate_workflow(data)


class TestRefusedGraphs(unittest.TestCase):
    def refuses(self, edges, fragment, **overrides):
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(paper(edges=edges, **overrides))
        self.assertIn(fragment, str(caught.exception).lower())

    def test_a_node_linked_to_itself(self):
        self.refuses([edge("s0", "s0", GENERATES)], "itself")
        # ...in the legacy shape too.
        self.refuses([["c0", "c0"]], "itself")

    def test_an_artifact_this_paper_does_not_have(self):
        self.refuses([edge("s0", "c9", GENERATES)], "not part of this paper")

    def test_another_paper_s_artifact(self):
        # A cross-paper reference presents exactly as a dangling one: an id
        # this paper's artifact lists do not contain.
        self.refuses([edge("s0", "c0", GENERATES)], "not part of this paper",
                     charts=[])

    def test_a_direct_two_node_cycle_is_kept(self):
        # A FEEDBACK LOOP the curator confirmed. Storage keeps what they
        # confirmed; the Curator is where it is questioned and marked.
        validate_workflow(paper([edge("s0", "c0", GENERATES), ["c0", "s0"]]))

    def test_a_longer_cycle_is_kept(self):
        data = paper()
        data["scripts"] = [{"id": "s0"}, {"id": "s1"}]
        data["workflow"] = {"nodes": [], "edges": [
            ["s0", "s1"], ["s1", "c0"], ["c0", "s0"],
        ]}
        validate_workflow(data)

    def test_an_artifact_may_not_join_itself(self):
        # The one shape with no reading at all, loops or not.
        self.refuses([["s0", "s0"]], "itself")

    def test_the_cycle_check_is_still_available_to_callers(self):
        # It stops being a refusal, not a fact. The Curator asks with it.
        self.assertTrue(_has_cycle([("s0", "c0", GENERATES),
                                    ("c0", "s0", None)]))
        self.assertFalse(_has_cycle([("d0", "s0", CONSUMES),
                                     ("s0", "c0", GENERATES)]))

    def test_a_relationship_its_endpoints_cannot_hold(self):
        # A tool does not generate a figure, and a chart does not consume.
        self.refuses([edge("t0", "c0", GENERATES)], "cannot be connected")
        self.refuses([edge("c0", "s0", CONSUMES)], "cannot be connected")
        self.refuses([edge("d0", "c0", USES_TOOL)], "cannot be connected")

    def test_an_id_whose_prefix_lies_about_its_type(self):
        # A `c` id stored among the datasets is a corrupt reference. The edge
        # would describe a relationship between things that are not what the
        # graph says they are, so the prefix is CHECKED rather than trusted.
        data = {
            "charts": [],
            "scripts": [{"id": "s0"}],
            "datasets": [{"id": "c0"}],       # a chart id, in the wrong list
            "workflow": {"nodes": [], "edges": [
                {"from": "s0", "to": "c0", "type": GENERATES}]},
        }
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(data)
        self.assertIn("holds it in datasets", str(caught.exception))

    def test_an_id_with_a_prefix_qresp_does_not_use(self):
        data = {
            "charts": [{"id": "c0"}],
            "scripts": [{"id": "x9"}],        # not one of c/s/d/t/h
            "workflow": {"nodes": [], "edges": [["x9", "c0"]]},
        }
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(data)
        self.assertIn("not a kind of artifact", str(caught.exception))

    def test_a_relationship_name_v1_does_not_know(self):
        self.refuses([edge("s0", "c0", "produces")], "unknown workflow")

    def test_an_edge_with_a_missing_endpoint(self):
        self.refuses([{"from": "s0"}], "missing its endpoints")
        self.refuses([["s0"]], "missing its endpoints")
        self.refuses([{}], "missing its endpoints")

    def test_a_workflow_that_is_not_an_object(self):
        with self.assertRaises(WorkflowError):
            validate_workflow({"workflow": ["s0", "c0"]})

    def test_edges_that_are_not_a_list(self):
        with self.assertRaises(WorkflowError):
            validate_workflow({"workflow": {"edges": "s0->c0"}})


class TestHelpers(unittest.TestCase):
    def test_artifact_types_says_where_each_id_was_found(self):
        types = artifact_types(paper())
        self.assertEqual("charts", types["c0"])
        self.assertEqual("heads", types["h0"])
        self.assertEqual("tools", types["t0"])

    def test_artifact_ids_reads_all_five_lists(self):
        self.assertEqual({"c0", "s0", "d0", "t0", "h0"},
                         artifact_ids(paper()))

    def test_artifact_ids_tolerates_missing_lists(self):
        self.assertEqual(set(), artifact_ids({}))
        self.assertEqual({"c0"}, artifact_ids({"charts": [{"id": "c0"}]}))

    def test_normalize_edge_reads_both_shapes(self):
        self.assertEqual(("s0", "c0", GENERATES),
                         normalize_edge(edge("s0", "c0", GENERATES)))
        self.assertEqual(("s0", "c0", None), normalize_edge(["s0", "c0"]))
        self.assertIsNone(normalize_edge("s0->c0"))
        self.assertIsNone(normalize_edge(None))

    def test_a_deep_chain_does_not_blow_the_stack(self):
        # The walk is iterative on purpose: a graph is curator input, and a
        # long chain must produce a verdict rather than a crash.
        depth = 3000
        charts = [{"id": "c%d" % i} for i in range(depth)]
        edges = [["c%d" % i, "c%d" % (i + 1)] for i in range(depth - 1)]
        validate_workflow({"charts": charts,
                           "workflow": {"nodes": [], "edges": edges}})


class FeedsIntoTest(unittest.TestCase):
    """Script -> Script, the one relationship joining two of a kind.

    Analysis is written in stages: one script prepares what the next one
    plots. Every OTHER same-type pair stays refused, and the two guards that
    make this safe -- no self-edge, no cycle -- are the ones already there.
    """

    def two_scripts(self, edges=None):
        return paper(edges, scripts=[{"id": "s0"}, {"id": "s1"}])

    def test_a_script_may_feed_another(self):
        validate_workflow(self.two_scripts([edge("s1", "s0", FEEDS_INTO)]))

    def test_a_chain_of_scripts_is_fine(self):
        data = paper([edge("s0", "s1", FEEDS_INTO),
                      edge("s1", "s2", FEEDS_INTO),
                      edge("s2", "c0", GENERATES)],
                     scripts=[{"id": "s0"}, {"id": "s1"}, {"id": "s2"}])
        validate_workflow(data)

    def test_a_script_may_not_feed_itself(self):
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(self.two_scripts([edge("s0", "s0", FEEDS_INTO)]))
        self.assertIn("itself", str(caught.exception))

    def test_two_scripts_may_feed_each_other_once_confirmed(self):
        validate_workflow(self.two_scripts([
            edge("s0", "s1", FEEDS_INTO),
            edge("s1", "s0", FEEDS_INTO),
        ]))

    def test_a_longer_loop_is_kept(self):
        validate_workflow(paper([edge("s0", "s1", FEEDS_INTO),
                                 edge("s1", "s2", FEEDS_INTO),
                                 edge("s2", "s0", FEEDS_INTO)],
                                scripts=[{"id": "s0"}, {"id": "s1"},
                                         {"id": "s2"}]))

    def test_every_kind_may_feed_its_own_kind(self):
        # One stage feeding the next happens at every level. Which of the two
        # same-kind relationships is true -- this or `related_to` -- is the
        # curator's to say, so both are storable and neither is inferred.
        pairs = (
            ("charts", "c0", "c1"),
            ("datasets", "d0", "d1"),
            ("tools", "t0", "t1"),
            ("heads", "h0", "h1"),
        )
        for key, first, second in pairs:
            data = paper([edge(first, second, FEEDS_INTO)],
                         **{key: [{"id": first}, {"id": second}]})
            validate_workflow(data)

    def test_a_pair_may_hold_both_readings_only_once_each(self):
        # `feeds_into` and `related_to` are different claims, so a pair may
        # hold both -- but `related_to` still only once.
        validate_workflow(paper([edge("c0", "c1", FEEDS_INTO),
                                 edge("c0", "c1", RELATED_TO)],
                                charts=[{"id": "c0"}, {"id": "c1"}]))

    def test_it_refuses_two_different_kinds(self):
        for source, target in (("d0", "s0"), ("t0", "s0"), ("s0", "c0"),
                               ("h0", "s0"), ("c0", "s0")):
            with self.assertRaises(WorkflowError):
                validate_workflow(paper([edge(source, target, FEEDS_INTO)]))

    def test_the_other_relationships_are_unchanged(self):
        # What each of the three already meant, still meaning it.
        validate_workflow(paper([edge("d0", "s0", CONSUMES)]))
        validate_workflow(paper([edge("h0", "c0", CONSUMES)]))
        validate_workflow(paper([edge("t0", "s0", USES_TOOL)]))
        validate_workflow(paper([edge("s0", "c0", GENERATES)]))
        # And what none of them ever allowed.
        for source, target, kind in (("d0", "d0", CONSUMES),
                                     ("t0", "c0", USES_TOOL),
                                     ("c0", "s0", GENERATES)):
            with self.assertRaises(WorkflowError):
                validate_workflow(paper([edge(source, target, kind)]))


class RelatedToTest(unittest.TestCase):
    """The undirected half of the vocabulary.

    `related_to` says two artifacts belong together and nothing else -- no
    order, no data flow. So it joins only same-kind pairs, it cannot be said
    twice about one pair, and it takes no part in the cycle check.
    """

    def pair(self, key, first, second, edges=None):
        return paper(edges, **{key: [{"id": first}, {"id": second}]})

    def test_every_kind_may_relate_to_its_own_kind(self):
        pairs = (
            ("charts", "c0", "c1"),
            ("scripts", "s0", "s1"),
            ("datasets", "d0", "d1"),
            ("tools", "t0", "t1"),
            ("heads", "h0", "h1"),
        )
        for key, first, second in pairs:
            validate_workflow(
                self.pair(key, first, second,
                          [edge(first, second, RELATED_TO)]))

    def test_it_refuses_two_different_kinds(self):
        # A cross-kind relationship already has a directed name. Offering a
        # vaguer second one would let the same fact be recorded two ways.
        for source, target in (("c0", "s0"), ("d0", "s0"), ("t0", "c0"),
                               ("h0", "d0"), ("s0", "c0")):
            with self.assertRaises(WorkflowError) as caught:
                validate_workflow(paper([edge(source, target, RELATED_TO)]))
            self.assertIn("same kind", str(caught.exception))

    def test_an_artifact_may_not_relate_to_itself(self):
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(paper([edge("c0", "c0", RELATED_TO)]))
        self.assertIn("itself", str(caught.exception))

    def test_the_same_pair_may_not_be_related_twice(self):
        with self.assertRaises(WorkflowError):
            validate_workflow(self.pair("charts", "c0", "c1", [
                edge("c0", "c1", RELATED_TO),
                edge("c0", "c1", RELATED_TO),
            ]))

    def test_nor_twice_in_the_other_order(self):
        # `a related_to b` and `b related_to a` are one fact.
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(self.pair("charts", "c0", "c1", [
                edge("c0", "c1", RELATED_TO),
                edge("c1", "c0", RELATED_TO),
            ]))
        self.assertIn("already related", str(caught.exception))

    def test_it_takes_no_part_in_the_cycle_check(self):
        # Two figures related to each other is not a loop in any sense worth
        # refusing -- there is no direction to loop.
        validate_workflow(self.pair("charts", "c0", "c1", [
            edge("s0", "c0", GENERATES),
            edge("c0", "c1", RELATED_TO),
        ]))

    def test_it_is_not_counted_as_flow_when_a_loop_is_looked_for(self):
        # An association joins the graph but claims no direction, so it can
        # neither make a loop nor be part of one.
        self.assertFalse(_has_cycle([("c0", "c1", RELATED_TO),
                                     ("c1", "c0", RELATED_TO)]))

    def test_the_directed_relationships_are_unchanged(self):
        validate_workflow(paper([edge("d0", "s0", CONSUMES)]))
        validate_workflow(paper([edge("t0", "s0", USES_TOOL)]))
        validate_workflow(paper([edge("s0", "c0", GENERATES)]))
        validate_workflow(paper([edge("s0", "s1", FEEDS_INTO)],
                                scripts=[{"id": "s0"}, {"id": "s1"}]))

    def test_a_legacy_untyped_edge_is_still_read_as_a_flow(self):
        # Nothing infers `related_to` for an old pair: it was drawn as an
        # arrow and still counts as one when a loop is looked for.
        self.assertTrue(_has_cycle([("s0", "c0", None), ("c0", "s0", None)]))
        # And it stores unchanged.
        validate_workflow(paper([["s0", "c0"], ["c0", "s0"]]))


class FeedbackFlagTest(unittest.TestCase):
    """A confirmed feedback loop is a fact the curator stated.

    It rides on the edge and is read back, rather than being recomputed from
    the shape of the graph -- which would lose the answer the moment another
    edge was removed. This module's job is to accept it and leave it alone.
    """

    def loop(self, feedback=False):
        edge = {"from": "s0", "to": "s1", "type": FEEDS_INTO}
        if feedback:
            edge["feedback"] = True
        return edge

    def paper_with(self, edges):
        return paper(edges, scripts=[{"id": "s0"}, {"id": "s1"}])

    def test_an_edge_may_carry_the_mark(self):
        validate_workflow(self.paper_with([
            edge("s1", "s0", FEEDS_INTO),
            self.loop(feedback=True),
        ]))

    def test_the_mark_is_left_exactly_as_it_arrived(self):
        # Validation reads the graph; it does not rewrite it. What the
        # Curator sent is what gets stored.
        data = self.paper_with([self.loop(feedback=True)])
        before = [dict(e) for e in data["workflow"]["edges"]]
        validate_workflow(data)
        self.assertEqual(data["workflow"]["edges"], before)
        self.assertTrue(data["workflow"]["edges"][0]["feedback"])

    def test_the_mark_does_not_change_what_the_edge_means(self):
        # Same endpoints, same rules. A marked edge to an impossible pair is
        # still refused.
        with self.assertRaises(WorkflowError):
            validate_workflow(paper([
                {"from": "t0", "to": "c0", "type": USES_TOOL, "feedback": True},
            ]))

    def test_an_unmarked_edge_gains_nothing(self):
        data = self.paper_with([self.loop()])
        validate_workflow(data)
        self.assertNotIn("feedback", data["workflow"]["edges"][0])

    def test_a_legacy_pair_is_never_marked(self):
        data = paper([["s0", "c0"]])
        validate_workflow(data)
        self.assertEqual(data["workflow"]["edges"], [["s0", "c0"]])


class LinksToTest(unittest.TestCase):
    """The arrow a curator draws, between any two things.

    The five older relationships came from one reading of how a paper is
    made. Real work does not respect it -- a script writes a dataset, a
    figure is built from another figure -- and under those endpoint rules
    none of those arrows could be drawn. This one carries no claim beyond
    direction, so it joins anything to anything.
    """

    KINDS = ("c0", "s0", "d0", "t0", "h0")

    def arrow(self, source, target):
        return edge(source, target, LINKS_TO)

    # A paper holding TWO of every kind, so a same-kind arrow has two
    # distinct ids to join.
    TWO_OF_EACH = {
        "charts": [{"id": "c0"}, {"id": "c1"}],
        "scripts": [{"id": "s0"}, {"id": "s1"}],
        "datasets": [{"id": "d0"}, {"id": "d1"}],
        "tools": [{"id": "t0"}, {"id": "t1"}],
        "heads": [{"id": "h0"}, {"id": "h1"}],
    }

    def doubled(self, edges):
        data = dict((k, list(v)) for k, v in self.TWO_OF_EACH.items())
        data["workflow"] = {"nodes": [], "edges": edges}
        return data

    def test_the_whole_five_by_five_matrix(self):
        # Twenty-five cells, not twenty: an arrow between two artifacts of
        # the SAME kind is as ordinary as any other. Only the ids have to
        # differ.
        import itertools
        first = {"c": "c0", "s": "s0", "d": "d0", "t": "t0", "h": "h0"}
        second = {"c": "c1", "s": "s1", "d": "d1", "t": "t1", "h": "h1"}
        cells = 0
        for a, b in itertools.product("csdth", repeat=2):
            source = first[a]
            target = second[b] if a == b else first[b]
            validate_workflow(self.doubled([self.arrow(source, target)]))
            cells += 1
        self.assertEqual(cells, 25)

    def test_same_kind_needs_two_different_artifacts(self):
        for same in ("c0", "s0", "d0", "t0", "h0"):
            with self.assertRaises(WorkflowError) as caught:
                validate_workflow(self.doubled([self.arrow(same, same)]))
            self.assertIn("itself", str(caught.exception))

    def test_same_kind_refuses_the_same_arrow_twice(self):
        with self.assertRaises(WorkflowError):
            validate_workflow(self.doubled([self.arrow("d0", "d1"),
                                            self.arrow("d0", "d1")]))

    def test_same_kind_allows_the_opposite_arrow(self):
        validate_workflow(self.doubled([self.arrow("d0", "d1"),
                                        self.arrow("d1", "d0")]))

    def test_the_pair_the_old_rules_forbade_both_ways(self):
        # `consumes` said a dataset feeds a script and never the reverse.
        validate_workflow(paper([self.arrow("s0", "d0")]))
        validate_workflow(paper([self.arrow("d0", "s0")]))

    def test_both_directions_at_once(self):
        # Two different facts, not one written twice.
        validate_workflow(paper([self.arrow("s0", "d0"),
                                 self.arrow("d0", "s0")]))

    def test_the_same_direction_twice_is_refused(self):
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(paper([self.arrow("s0", "d0"),
                                     self.arrow("s0", "d0")]))
        self.assertIn("already links", str(caught.exception))

    def test_an_artifact_may_not_link_to_itself(self):
        with self.assertRaises(WorkflowError) as caught:
            validate_workflow(paper([self.arrow("s0", "s0")]))
        self.assertIn("itself", str(caught.exception))

    def test_a_confirmed_loop_is_kept(self):
        # Cycles follow the existing feedback flow: the Curator asks, and
        # storage keeps what was confirmed.
        validate_workflow(paper([
            self.arrow("s0", "c0"),
            {"from": "c0", "to": "s0", "type": LINKS_TO, "feedback": True},
        ]))

    def test_the_feedback_mark_rides_along_unchanged(self):
        data = paper([
            {"from": "s0", "to": "d0", "type": LINKS_TO, "feedback": True},
        ])
        before = [dict(e) for e in data["workflow"]["edges"]]
        validate_workflow(data)
        self.assertEqual(data["workflow"]["edges"], before)

    def test_it_does_not_loosen_the_older_relationships(self):
        # Adding a permissive type must not make the strict ones permissive.
        for source, target, kind in (("t0", "c0", USES_TOOL),
                                     ("c0", "s0", GENERATES),
                                     ("s0", "d0", CONSUMES)):
            with self.assertRaises(WorkflowError):
                validate_workflow(paper([edge(source, target, kind)]))

    def test_it_does_not_convert_an_older_edge(self):
        # What was written stays written. Nothing migrates.
        data = paper([edge("s0", "c0", GENERATES), ["d0", "s0"]])
        validate_workflow(data)
        self.assertEqual(
            data["workflow"]["edges"],
            [{"from": "s0", "to": "c0", "type": GENERATES}, ["d0", "s0"]])

    def test_it_still_answers_to_the_paper(self):
        with self.assertRaises(WorkflowError):
            validate_workflow(paper([self.arrow("s0", "s9")]))


if __name__ == "__main__":
    unittest.main()
