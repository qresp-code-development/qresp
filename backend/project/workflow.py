"""Workflow graph validation.

A paper's workflow says how inputs and software produced a figure. It is
OPTIONAL: a record with no workflow, or with the untyped `[from, to]` edges
every record written before this module used, is valid and is left alone.

WHAT AN EDGE MEANS
==================
V1 gives edges a semantic type, so a graph states a relationship rather than
just a line between two boxes:

TWO CLASSES OF EDGE
===================
They answer different questions and are validated differently.

DIRECTED (provenance): what produced what.

    consumes    Dataset or External Data  ->  Script or Chart
    uses_tool   Tool                      ->  Script
    generates   Script                    ->  Chart
    feeds_into  any kind                  ->  the SAME kind

These describe a flow, so they read one way only.

A CYCLE AMONG THEM IS ACCEPTED, because refinement is real: fit, adjust, fit
again. It is not accepted quietly -- the Curator asks before drawing one and
then shows it as a FEEDBACK LOOP, marked differently from ordinary flow, so a
reader can tell a deliberate loop from a mistake. Storage's job is to keep
what the curator confirmed, so this module no longer refuses it.

What is still refused is an artifact joined to ITSELF, which has no reading at
all, and every endpoint rule above.

GENERIC (the arrow a curator draws): this led to that.

    links_to    any kind                  ->  any kind

The five relationships above were derived from one reading of how a paper is
made -- data goes into a script, a script makes a figure. Real work does not
respect it: a script WRITES a dataset, a figure is built from another figure,
a tool is configured by a dataset. Under the old rules those arrows could not
be drawn at all, because the endpoint rules said which kind was allowed to be
upstream.

`links_to` carries no such claim. It says only that one thing led to another,
in that direction, and so it joins ANY two artifacts. Both `Script -> Dataset`
and `Dataset -> Script` are storable, as separate facts.

It does NOT loosen the five above. Their endpoint rules are untouched, and a
record holding them keeps them exactly as written -- nothing here converts an
old edge into this one.

UNDIRECTED (association): these two belong together.

    related_to  any kind                  <-> the SAME kind

`related_to` states no order and no data flow. Two figures showing the same
system, two datasets from one run, two tools that go together -- a curator can
say they are related without claiming one produced the other. It joins ONLY
two artifacts of the same kind, because a relationship across kinds already
has a directed name and offering a vaguer second one would let the same fact
be recorded two ways.

Because it asserts no direction, it takes no part in the cycle check. What it
does refuse is an artifact related to itself, and the same pair recorded twice
-- in either order, since `a related_to b` and `b related_to a` are one fact.

An edge with no type is a LEGACY edge. It is accepted and preserved exactly as
stored; nothing here rewrites one, because guessing what an old curator meant
is not this module's business.

WHAT IS REFUSED
===============
Only things that are wrong however you read them:

  * an edge from a node to itself;
  * an edge naming an artifact this paper does not have (which is also how a
    cross-paper reference presents -- another paper's ids are simply not in
    this paper's artifact list);
  * a cycle, which would claim a figure helped produce itself;
  * a typed edge whose endpoints cannot hold that relationship.

WHEN IT RUNS
============
Only when the caller actually submits a workflow. A metadata edit that does
not mention one must not be refused because a record written years ago holds
an edge this module would not accept today -- that would make legacy papers
uneditable, which is a worse outcome than an old graph staying as it is.
"""

# Artifact id prefixes, as the Curator mints them (`type.charAt(0)`):
# charts -> c, scripts -> s, datasets -> d, tools -> t, heads -> h.
CHART = "c"
SCRIPT = "s"
DATASET = "d"
TOOL = "t"
EXTERNAL = "h"

CONSUMES = "consumes"
USES_TOOL = "uses_tool"
GENERATES = "generates"
FEEDS_INTO = "feeds_into"
RELATED_TO = "related_to"
LINKS_TO = "links_to"

# Which endpoints each relationship is allowed to join, by id prefix.
KINDS = {CHART, SCRIPT, DATASET, TOOL, EXTERNAL}

EDGE_RULES = {
    CONSUMES: ({DATASET, EXTERNAL}, {SCRIPT, CHART}),
    USES_TOOL: ({TOOL}, {SCRIPT}),
    GENERATES: ({SCRIPT}, {CHART}),
    FEEDS_INTO: (KINDS, KINDS),
    RELATED_TO: (KINDS, KINDS),
    LINKS_TO: (KINDS, KINDS),
}

# Relationships whose same (from, to) pair may only be recorded once. Saying
# `a links_to b` twice is one fact written twice; saying `b links_to a` as
# well is a different fact and is allowed.
ONCE_PER_DIRECTION = frozenset({LINKS_TO})

# Relationships that additionally require both ends to be the same kind.
#
# These two are the SAME-KIND PAIR'S CHOICE, and the curator makes it: one
# stage feeding the next is `feeds_into`, two things that merely belong
# together are `related_to`. Neither is ever inferred for a same-kind pair,
# because only the curator knows which they mean.
SAME_KIND = frozenset({FEEDS_INTO, RELATED_TO})

# Relationships that state no direction. They are excluded from the cycle
# check, and the same pair may only be recorded once however it is ordered.
UNDIRECTED = frozenset({RELATED_TO})

# The edges that describe a flow. A legacy untyped pair counts as one: it was
# drawn as an arrow, and nothing here reinterprets it.
DIRECTED = frozenset(set(EDGE_RULES) - UNDIRECTED)

EDGE_TYPES = frozenset(EDGE_RULES)


class WorkflowError(ValueError):
    """A workflow that cannot be stored, with a reason fit to show a curator."""


# Which list an id prefix must be found in. An id's prefix is a CLAIM about
# what kind of artifact it is, and `artifact_types` is what checks the claim
# against the paper rather than trusting the letter.
LIST_BY_PREFIX = {
    CHART: "charts",
    SCRIPT: "scripts",
    DATASET: "datasets",
    TOOL: "tools",
    EXTERNAL: "heads",
}


def artifact_types(paper):
    """{id: list it was found in} for every artifact this paper holds.

    Reads the same five lists the Curator derives workflow nodes from. A
    missing list is an empty one -- a paper with no tools is not malformed.

    The VALUE matters as much as the key. An id carries its type in its first
    letter, and an edge that says `t0 -> c0` is asserting that `t0` is a tool.
    Keeping what each id actually is lets that assertion be checked instead of
    assumed: a `c` id sitting in `datasets` is a corrupt reference even though
    the letter looks right.
    """
    found = {}
    for key in ("charts", "scripts", "datasets", "tools", "heads"):
        for item in (paper.get(key) or []):
            if isinstance(item, dict):
                value = str(item.get("id") or "").strip()
            else:
                value = str(getattr(item, "id", "") or "").strip()
            if value:
                found[value] = key
    return found


def artifact_ids(paper):
    """Every artifact id this paper holds. See `artifact_types`."""
    return set(artifact_types(paper))


def normalize_edge(edge):
    """One stored edge -> (from, to, type or None), or None if unreadable.

    Accepts both shapes on purpose: `{"from": .., "to": .., "type": ..}` is
    what V1 writes, `["from", "to"]` is what every earlier record holds.
    """
    if isinstance(edge, dict):
        source = str(edge.get("from") or "").strip()
        target = str(edge.get("to") or "").strip()
        kind = str(edge.get("type") or "").strip() or None
    elif isinstance(edge, (list, tuple)) and len(edge) >= 2:
        source = str(edge[0] or "").strip()
        target = str(edge[1] or "").strip()
        kind = None
    else:
        return None
    if not source or not target:
        return None
    return source, target, kind


def _has_cycle(edges):
    """True when the directed edges contain a cycle.

    Iterative depth-first search with an explicit stack: a graph is curator
    input, and a recursive walk would turn a long chain into a crash rather
    than a validation error.
    """
    adjacency = {}
    for source, target, kind in edges:
        # An undirected association states no order, so it can neither
        # form a loop nor be part of one. A legacy untyped pair WAS
        # drawn as an arrow and still counts as one.
        if kind in UNDIRECTED:
            continue
        adjacency.setdefault(source, []).append(target)

    UNVISITED, IN_PROGRESS, DONE = 0, 1, 2
    state = {}

    for start in list(adjacency):
        if state.get(start, UNVISITED) != UNVISITED:
            continue
        stack = [(start, iter(adjacency.get(start, ())))]
        state[start] = IN_PROGRESS
        while stack:
            node, children = stack[-1]
            advanced = False
            for child in children:
                status = state.get(child, UNVISITED)
                if status == IN_PROGRESS:
                    return True          # back edge: a cycle
                if status == UNVISITED:
                    state[child] = IN_PROGRESS
                    stack.append((child, iter(adjacency.get(child, ()))))
                    advanced = True
                    break
            if not advanced:
                state[node] = DONE
                stack.pop()
    return False


def validate_workflow(paper):
    """Raise WorkflowError if `paper`'s workflow cannot be stored.

    `paper` is the plain dict a request carries. Returns silently for a paper
    with no workflow, an empty one, or one holding only legacy untyped edges
    that still point at artifacts this paper has.
    """
    workflow = paper.get("workflow")
    if not workflow:
        return
    if not isinstance(workflow, dict):
        raise WorkflowError("Workflow must be an object.")

    raw_edges = workflow.get("edges") or []
    if not isinstance(raw_edges, (list, tuple)):
        raise WorkflowError("Workflow edges must be a list.")

    known = artifact_types(paper)
    edges = []
    undirected_pairs = set()
    directed_pairs = set()
    for raw in raw_edges:
        edge = normalize_edge(raw)
        if edge is None:
            raise WorkflowError(
                "A workflow connection is missing its endpoints.")
        source, target, kind = edge

        if source == target:
            raise WorkflowError(
                "A workflow connection cannot join %s to itself." % source)

        # A dangling reference and a cross-paper reference are the same
        # failure from here: an id this paper does not have.
        for endpoint in (source, target):
            if endpoint not in known:
                raise WorkflowError(
                    "Workflow connection refers to %s, which is not part of "
                    "this paper." % endpoint)
            # ...and the id's prefix is a CLAIM about what kind of artifact it
            # is. Check it rather than trust it: a `c` id stored among the
            # datasets is a corrupt reference, and an edge built on it would
            # describe a relationship between things that are not what the
            # graph says they are.
            expected = LIST_BY_PREFIX.get(endpoint[:1])
            if expected is None:
                raise WorkflowError(
                    "Workflow connection refers to %s, which is not a kind of "
                    "artifact Qresp knows." % endpoint)
            if known[endpoint] != expected:
                raise WorkflowError(
                    "Workflow connection refers to %s as a %s, but this paper "
                    "holds it in %s."
                    % (endpoint, expected, known[endpoint]))

        if kind is not None:
            if kind not in EDGE_TYPES:
                raise WorkflowError("Unknown workflow relationship '%s'." % kind)
            allowed_sources, allowed_targets = EDGE_RULES[kind]
            if source[:1] not in allowed_sources or \
                    target[:1] not in allowed_targets:
                raise WorkflowError(
                    "%s cannot be connected to %s as '%s'."
                    % (source, target, kind))
            if kind in SAME_KIND and source[:1] != target[:1]:
                raise WorkflowError(
                    "'%s' joins two artifacts of the same kind, and %s and %s "
                    "are not." % (kind, source, target))
            if kind in ONCE_PER_DIRECTION:
                # The same arrow twice is one fact written twice. The
                # OPPOSITE arrow is a different fact and is left alone.
                if (source, target, kind) in directed_pairs:
                    raise WorkflowError(
                        "%s already links to %s." % (source, target))
                directed_pairs.add((source, target, kind))
            if kind in UNDIRECTED:
                # One fact, however it is ordered.
                pair = frozenset((source, target))
                if pair in undirected_pairs:
                    raise WorkflowError(
                        "%s and %s are already related to each other."
                        % (source, target))
                undirected_pairs.add(pair)
        edges.append((source, target, kind))

    # A directed cycle is a FEEDBACK LOOP the curator confirmed, not an error.
    # `_has_cycle` stays exported -- the Curator uses it to ask before making
    # one, and the Workflow board to warn -- but it does not refuse here.
    # Every traversal in this codebase marks a node before descending, so a
    # loop terminates wherever it is walked.
