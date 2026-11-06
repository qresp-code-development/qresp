import { useContext, useMemo, useState } from "react";

import { Alert, Box, Chip, Grid, Typography } from "@mui/material";

import { RegularStyledButton, SmallStyledButton } from "../button";
import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import { displayUrl, externalLabel, noteFor } from "../../Utils/externalData";
import { figureLabel } from "../../Utils/artifactLabel";
import {
  CHART,
  DATASET,
  EXTERNAL,
  INPUTS,
  OUTPUTS,
  PROCESS,
  SCRIPT,
  TOOL,
  edgeProblem,
  fromStoredEdge,
  hasEdge,
  inferEdgeType,
  prefixOf,
} from "../../Utils/workflowGraph";

// The workflow board.
//
// THE POINT IS THAT NOBODY HAS TO DRAW A DIAGRAM. Building a workflow by
// dragging boxes and pulling arrows between them is a drawing task, and
// curating a paper is not. So the ordinary path here is: select the thing you
// are working on, press the button for what fed it, and the connection is
// made. Drawing remains available on the existing graph surface for the cases
// this cannot express, but no ordinary curation needs it.
//
// WHAT A BUTTON DOES. It appends a draft to the Curator's own state and
// nothing else. No request is made, no record is created, and an abandoned
// draft leaves nothing behind -- everything here is saved by the same
// Save/Publish that saves the rest of the form.
//
// THREE LANES, because a workflow reads left to right and that is the whole
// story a reader needs: what went in, what was run, what came out.

const LANES = [
  {
    key: INPUTS,
    title: "Inputs",
    hint: "Data this work started from",
    prefixes: [DATASET, EXTERNAL],
  },
  {
    key: PROCESS,
    title: "Process",
    hint: "Software that did the work",
    prefixes: [SCRIPT, TOOL],
  },
  {
    key: OUTPUTS,
    title: "Outputs",
    hint: "Figures the work produced",
    prefixes: [CHART],
  },
];

// One empty draft per artifact type, in the shape that type really has.
// Blank is fine: a draft is not a published record, and the existing forms
// and publish validation are what decide when it is complete.
const DRAFTS = {
  chart: () => ({
    caption: "", number: "", imageFile: "", notebookFile: "",
    files: [], properties: [], extraFields: [],
  }),
  script: () => ({ readme: "", files: [], URLs: [], extraFields: [] }),
  dataset: () => ({ readme: "", files: [], URLs: [], extraFields: [] }),
  tool: () => ({
    kind: "software", packageName: "", version: "", programName: "",
    facilityName: "", measurement: "", description: "", patches: [],
    URLs: [], extraFields: [],
  }),
  head: () => ({ label: "", readme: "", URLs: [] }),
};

const TYPE_BY_PREFIX = {
  [CHART]: "chart",
  [SCRIPT]: "script",
  [DATASET]: "dataset",
  [TOOL]: "tool",
  [EXTERNAL]: "head",
};

const ADD_BUTTONS = [
  { type: "chart", label: "+ Chart" },
  { type: "script", label: "+ Script" },
  { type: "dataset", label: "+ Dataset" },
  { type: "tool", label: "+ Tool" },
  { type: "head", label: "+ External Data" },
];

/**
 * What a node is CALLED on the board.
 *
 * Always something a curator can recognise, and never a bare id. A brand-new
 * draft has no title yet, so it says what it is and which one it is rather
 * than rendering an empty chip.
 */
export const labelFor = (artifact, id) => {
  if (prefixOf(id) === EXTERNAL) return externalLabel(artifact, id);
  if (prefixOf(id) === CHART && artifact && figureLabel(artifact.number)) {
    return figureLabel(artifact.number);
  }
  const named =
    (artifact &&
      (artifact.label ||
        artifact.caption ||
        artifact.packageName ||
        artifact.programName ||
        artifact.facilityName ||
        artifact.readme)) ||
    "";
  const trimmed = String(named).trim();
  if (trimmed) {
    return trimmed.length > 48 ? `${trimmed.slice(0, 47)}…` : trimmed;
  }
  const kind = TYPE_BY_PREFIX[prefixOf(id)] || "node";
  return `Untitled ${kind === "head" ? "external data" : kind} (${id})`;
};

const WorkflowBoard = () => {
  const {
    charts, scripts, datasets, tools, heads,
    workflow, addMany, addEdge, unlink,
  } = useContext(CuratorContext);

  // The EXISTING Curator forms, opened on an existing artifact. Editing a
  // node is not a new surface: `setDefault` seeds the real form with the real
  // record and `openForm` shows it, so the fields, the validation and the
  // save path are the ones the rest of the Curator already uses. Cancelling
  // closes that form and changes nothing, here or in the record.
  const { openForm, setDefault, setExternalNodeFormOpen } =
    useContext(CuratorHelperContext) || {};

  // The node the next Add button will attach to. Selection is the whole
  // interaction model: it is what turns "+ Script" into "a script that made
  // THIS figure" without asking a question.
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");

  const byId = useMemo(() => {
    const map = {};
    [
      [charts, CHART], [scripts, SCRIPT], [datasets, DATASET],
      [tools, TOOL], [heads, EXTERNAL],
    ].forEach(([list]) =>
      (list || []).forEach((item) => {
        if (item && item.id) map[item.id] = item;
      })
    );
    return map;
  }, [charts, scripts, datasets, tools, heads]);

  const knownIds = useMemo(() => Object.keys(byId), [byId]);
  const edges = (workflow && workflow.edges) || [];

  // Which artifacts have no connection at all. They are NOT hidden: a dataset
  // nobody has linked yet is a normal mid-curation state, and burying it is
  // how it gets forgotten.
  const unlinked = knownIds.filter(
    (id) =>
      !edges.some((edge) => {
        const { from, to } = fromStoredEdge(edge);
        return from === id || to === id;
      })
  );

  /**
   * Open the artifact's own Curator form.
   *
   * External data is the one that does not have a section form of its own --
   * it is a `heads` record, and the workflow section's dialog is where it is
   * written -- so that dialog is what opens for it. Same record, same model.
   */
  const editNode = (id) => {
    const artifact = byId[id];
    if (!artifact) return;
    const kind = TYPE_BY_PREFIX[prefixOf(id)];
    if (!setDefault) return;
    // Same call for every type. External data has no section form, so its
    // dialog is opened instead of a section form -- but the record is seeded
    // through the one `setDefault` path either way.
    setDefault(kind, artifact);
    if (kind === "head") {
      if (setExternalNodeFormOpen) setExternalNodeFormOpen(true);
      return;
    }
    if (openForm) openForm(kind);
  };

  const connectionsFor = (id) =>
    edges
      .map(fromStoredEdge)
      .filter((edge) => edge.from === id || edge.to === id);

  /**
   * Add a draft, and connect it to the selection when that connection is
   * unambiguous.
   *
   * The direction is decided by what the two things ARE, never by the order
   * they were clicked: a Script added while a Chart is selected can only be
   * the thing that generated it, so `Script -> Chart` is the only edge that
   * could be meant. When the pair has no single lawful relationship, the node
   * is still created -- just unconnected, and the curator says what they meant.
   */
  const addNode = (type) => {
    setNotice("");
    const prefix = Object.keys(TYPE_BY_PREFIX).find(
      (key) => TYPE_BY_PREFIX[key] === type
    );
    // Ids are minted by the reducer against the list as it stands, so this
    // predicts the id the same way without racing it.
    const listFor = {
      [CHART]: charts, [SCRIPT]: scripts, [DATASET]: datasets,
      [TOOL]: tools, [EXTERNAL]: heads,
    }[prefix] || [];
    const taken = new Set((listFor || []).map((item) => item.id));
    let index = (listFor || []).length;
    while (taken.has(`${prefix}${index}`)) index += 1;
    const newId = `${prefix}${index}`;

    addMany(type, [DRAFTS[type]()]);

    if (!selected) {
      setSelected(newId);
      return;
    }
    // Try both directions; exactly one of them can be lawful.
    const forward = inferEdgeType(newId, selected);
    const backward = inferEdgeType(selected, newId);
    const candidate = forward
      ? { from: newId, to: selected, type: forward }
      : backward
      ? { from: selected, to: newId, type: backward }
      : null;

    if (!candidate) {
      setNotice(
        `Added, but ${labelFor(byId[selected], selected)} and this cannot be ` +
          "connected directly. Use Connect to say what you meant."
      );
      setSelected(newId);
      return;
    }
    const problem = edgeProblem(candidate, [...knownIds, newId], edges);
    if (problem) {
      setNotice(`Added, but not connected: ${problem}`);
    } else {
      addEdge(candidate);
    }
    setSelected(newId);
  };

  /** Connect the selection to an existing node, for the cases Add cannot express. */
  const connectTo = (otherId) => {
    setNotice("");
    if (!selected || selected === otherId) return;
    const forward = inferEdgeType(selected, otherId);
    const backward = inferEdgeType(otherId, selected);
    const candidate = forward
      ? { from: selected, to: otherId, type: forward }
      : backward
      ? { from: otherId, to: selected, type: backward }
      : null;
    if (!candidate) {
      setNotice("Those two cannot be connected directly.");
      return;
    }
    if (hasEdge(edges, candidate.from, candidate.to)) {
      setNotice("They are already connected.");
      return;
    }
    const problem = edgeProblem(candidate, knownIds, edges);
    if (problem) {
      setNotice(problem);
      return;
    }
    addEdge(candidate);
  };

  /**
   * Existing artifacts the selection can be joined to, and is not already.
   *
   * This is what "Attach existing" offers. It never creates anything -- the
   * whole point is to reuse the Chart, Script, Dataset, Tool or external
   * record that is already in the paper instead of adding a second one that
   * means the same thing. Opening the list creates nothing either.
   */
  const attachCandidates = () =>
    knownIds.filter((id) => {
      if (!selected || id === selected) return false;
      const type =
        inferEdgeType(selected, id) || inferEdgeType(id, selected);
      if (!type) return false;
      return !hasEdge(edges, selected, id) && !hasEdge(edges, id, selected);
    });

  const laneNodes = (lane) =>
    knownIds
      .filter((id) => lane.prefixes.includes(prefixOf(id)))
      .sort();

  return (
    <Box data-testid="workflow-board" sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Select a node, then add what fed it — the connection is made for you.
        Nothing here is saved until you save the record.
      </Typography>

      <Box
        sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}
        data-testid="workflow-add-buttons"
      >
        {ADD_BUTTONS.map((button) => (
          <RegularStyledButton
            key={button.type}
            onClick={() => addNode(button.type)}
            data-testid={`workflow-add-${button.type}`}
          >
            {button.label}
          </RegularStyledButton>
        ))}
      </Box>

      {notice ? (
        <Alert severity="info" sx={{ mb: 2 }} data-testid="workflow-notice">
          {notice}
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        {LANES.map((lane) => (
          <Grid key={lane.key} size={{ xs: 12, md: 4 }} sx={{ minWidth: 0 }}>
            <Box
              data-testid={`workflow-lane-${lane.key}`}
              sx={{
                border: 1, borderColor: "divider", borderRadius: 1,
                p: 1.5, height: "100%", minWidth: 0,
              }}
            >
              <Typography variant="subtitle2">{lane.title}</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mb: 1 }}
              >
                {lane.hint}
              </Typography>
              {/* A LIST, so the lane's size is announced rather than only
                  drawn, and the nodes stack on a narrow screen instead of
                  overlapping. */}
              <Box
                component="ul"
                aria-label={`${lane.title} nodes`}
                sx={{ listStyle: "none", m: 0, p: 0,
                      display: "flex", flexDirection: "column", gap: 1 }}
              >
                {laneNodes(lane).map((id) => (
                  <Box component="li" key={id} sx={{ minWidth: 0 }}>
                    <Chip
                      label={labelFor(byId[id], id)}
                      data-testid={`workflow-node-${id}`}
                      color={selected === id ? "primary" : "default"}
                      variant={selected === id ? "filled" : "outlined"}
                      onClick={() =>
                        setSelected(selected === id ? "" : id)
                      }
                      aria-pressed={selected === id}
                      sx={{ maxWidth: "100%" }}
                    />
                    {/* The artifact's OWN Curator form -- same fields, same
                        validation, same save. Cancel changes nothing. */}
                    <SmallStyledButton
                      onClick={() => editNode(id)}
                      data-testid={`workflow-edit-${id}`}
                    >
                      Edit
                    </SmallStyledButton>
                    {selected && selected !== id ? (
                      <SmallStyledButton
                        onClick={() => connectTo(id)}
                        data-testid={`workflow-connect-${id}`}
                      >
                        Connect
                      </SmallStyledButton>
                    ) : null}
                    {/* External data says what it references, briefly. It is
                        a reference to data held elsewhere, never a local
                        Dataset, and only an http(s) link is ever shown. */}
                    {prefixOf(id) === EXTERNAL ? (
                      <Box sx={{ mt: 0.5, minWidth: 0 }}>
                        {displayUrl(byId[id]) ? (
                          <Typography
                            variant="caption"
                            component="a"
                            href={displayUrl(byId[id])}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`workflow-external-url-${id}`}
                            sx={{ display: "block", overflowWrap: "anywhere" }}
                          >
                            {displayUrl(byId[id])}
                          </Typography>
                        ) : null}
                        {noteFor(byId[id]) ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            data-testid={`workflow-external-note-${id}`}
                            sx={{ overflowWrap: "anywhere" }}
                          >
                            {noteFor(byId[id])}
                          </Typography>
                        ) : null}
                      </Box>
                    ) : null}
                  </Box>
                ))}
                {laneNodes(lane).length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    Nothing here yet.
                  </Typography>
                ) : null}
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ATTACH EXISTING. One Dataset, Script or Tool often serves several
          figures, and the right move is to connect the one that is already
          in the paper rather than add a second that means the same thing.
          Nothing here creates a record -- not opening the list, not any of
          its buttons. */}
      {selected && attachCandidates().length ? (
        <Box sx={{ mt: 2 }} data-testid="workflow-attach">
          <Typography variant="subtitle2" gutterBottom>
            Attach existing to {labelFor(byId[selected], selected)}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {attachCandidates().map((id) => (
              <Chip
                key={id}
                size="small"
                variant="outlined"
                label={labelFor(byId[id], id)}
                onClick={() => connectTo(id)}
                data-testid={`workflow-attach-${id}`}
                sx={{ maxWidth: "100%" }}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      {/* The selected node's connections, each removable on its own. */}
      {selected ? (
        <Box sx={{ mt: 2 }} data-testid="workflow-connections">
          <Typography variant="subtitle2" gutterBottom>
            {labelFor(byId[selected], selected)}
          </Typography>
          {connectionsFor(selected).length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Not connected to anything yet.
            </Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {connectionsFor(selected).map((edge) => (
                <Box
                  component="li"
                  key={`${edge.from}-${edge.to}`}
                  sx={{ mb: 0.5 }}
                >
                  <Typography variant="body2" component="span">
                    {`${labelFor(byId[edge.from], edge.from)} → ${labelFor(
                      byId[edge.to],
                      edge.to
                    )}`}
                    {edge.type ? ` (${edge.type.replace("_", " ")})` : ""}
                  </Typography>{" "}
                  {/* Removes ONLY this connection. Both artifacts stay, and
                      so does every other connection they have. */}
                  <SmallStyledButton
                    onClick={() => unlink(edge.from, edge.to)}
                    data-testid={`workflow-unlink-${edge.from}-${edge.to}`}
                  >
                    Unlink
                  </SmallStyledButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ) : null}

      {/* Never hidden. A dataset nobody has connected yet is a normal
          mid-curation state, and burying it is how it gets forgotten. */}
      {unlinked.length ? (
        <Box sx={{ mt: 2 }} data-testid="workflow-unlinked">
          <Typography variant="subtitle2" gutterBottom>
            Unlinked resources
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {unlinked.map((id) => (
              <Chip
                key={id}
                size="small"
                variant="outlined"
                label={labelFor(byId[id], id)}
                onClick={() => setSelected(id)}
                data-testid={`workflow-unlinked-${id}`}
                sx={{ maxWidth: "100%" }}
              />
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};

export default WorkflowBoard;
