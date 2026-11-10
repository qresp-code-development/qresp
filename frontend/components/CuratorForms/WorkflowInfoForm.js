import { useEffect, useContext, useState, Fragment } from "react";

import {
  Box,
  Grid,
  Dialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import { useForm } from "react-hook-form";

import Drawer from "../drawer";
import { RegularStyledButton } from "../button";
import {
  FormConnection,
  confirmLabel,
  useRowLink,
} from "./ConnectionSection";
import { TextInputField } from "../Form/InputFields";

import Graph from "../Workflow/Graph";
import Legend from "../Workflow/Legend";
import { formatData } from "../Workflow/util";
import { isGraph } from "../../Utils/graph";
import {
  LINKS_TO,
  closesLoop,
  edgeProblem,
  fromStoredEdge,
} from "../../Utils/workflowGraph";
import { changedUrlProblem } from "../../Utils/externalData";
import { sectionsCollapsing } from "../../Utils/sectionCollapse";
import { guidedChangesAccepted } from "../../Utils/savedSection";

import AlertContext from "../../Context/Alert/alertContext";
import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

/**
 * The External Data form.
 *
 * `dialogOnly` mounts the DIALOG and nothing else. That dialog is the only
 * way to enter external data anywhere in the Curator, and it used to live
 * inside a section that was hidden until the workflow already had nodes --
 * so the one path to creating external data disappeared exactly when a
 * curator had none of it yet. The workspace mounts this the way it mounts
 * the other four forms: hidden, for its dialog.
 */
// WHAT WAS SAVED, so a saved workflow stays saved when this section mounts
// again -- after a trip to the preview, for one. Kept per browser tab.
export const WORKFLOW_SAVED_KEY = "qresp:workflowSaved";

/** The workflow's content, independent of order and stored edge shape. */
export const workflowSignature = (workflow) =>
  JSON.stringify({
    nodes: [...((workflow && workflow.nodes) || [])].map(String).sort(),
    edges: ((workflow && workflow.edges) || [])
      .map((edge) => JSON.stringify(fromStoredEdge(edge)))
      .sort(),
  });

const readSaved = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem(WORKFLOW_SAVED_KEY)) || null;
  } catch (e) {
    return null;
  }
};

const WorkflowInfoForm = ({ dialogOnly = false }) => {
  const { setAlert, unsetAlert } = useContext(AlertContext);

  const {
    charts,
    tools,
    scripts,
    datasets,
    heads,
    workflow,
    addEdge,
    deleteEdge,
    unlink,
    add,
    edit,
    del,
    setEdges,
  } = useContext(CuratorContext);

  const {
    workflowHelper: { open, fit },
    setExternalNodeFormOpen,
    setDefault,
    externalHelper,
    setShowLabels,
    setWorkflowFit,
    setWorkflowOnClick,
    setEditing,
    editing,
  } = useContext(CuratorHelperContext);

  // Which external record the dialog is editing, or null when creating one.
  const editingHead = (externalHelper && externalHelper.def) || null;
  // What a NEW external record is for; row-scoped when opened from a row's
  // LINK. See ConnectionSection.
  const link = useRowLink("head", externalHelper && externalHelper.link);


  useEffect(() => {
    setWorkflowOnClick(false);
    setShowLabels(true);
    return () => {
      setWorkflowOnClick(true);
      setShowLabels(false);
    };
  }, []);

  const [savedAt, setSavedAt] = useState("");
  // Open like every other section, closed with them after a draft load or a
  // return from the preview (sectionsCollapsing), and collapsed by its own
  // Save. A change made elsewhere does not pop it open.
  const [drawerOpen, setDrawerOpen] = useState(() => !sectionsCollapsing());

  // Unsaved only when the workflow differs from the one last saved. A
  // change the guided setup made counts as saved (see savedSection), unless
  // it closes a loop, which the curator confirms on Save.
  useEffect(() => {
    const saved = readSaved();
    if (saved && saved.signature === workflowSignature(workflow)) {
      setEditing("workflowInfo", false);
      setSavedAt(saved.at || "");
    } else if (guidedChangesAccepted() && (workflow.nodes || []).length && !isGraph.cyclic(workflow)) {
      const at = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      try {
        window.sessionStorage.setItem(
          WORKFLOW_SAVED_KEY,
          JSON.stringify({ signature: workflowSignature(workflow), at })
        );
      } catch (e) {
        // Storage unavailable: still saved for this visit.
      }
      setEditing("workflowInfo", false);
      setSavedAt(at);
    } else {
      setEditing("workflowInfo", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow]);

  // Every artifact this paper holds, which is what an edge's endpoints are
  // checked against.
  const knownIds = [charts, scripts, datasets, tools, heads]
    .flatMap((list) => list || [])
    .map((item) => item && item.id)
    .filter(Boolean);

  const manipulate = {
    manipulation: {
      enabled: true,
      initiallyActive: true,
      addNode: false,
      addEdge: (data, callback) => {
        // ONE CONTRACT, TWO WAYS IN. An arrow dragged here is the same claim
        // as one ticked in "Organize figures and resources", so it is the
        // same edge type, checked the same way, and asks the same question
        // when it closes a loop.
        const edge = { from: data.from, to: data.to, type: LINKS_TO };
        const problem = edgeProblem(edge, knownIds, workflow.edges || []);
        if (problem) {
          setAlert("That connection cannot be made", problem, null);
          callback(null);
          return;
        }
        if (closesLoop(workflow.edges || [], edge)) {
          setAlert(
            "Make a feedback loop?",
            "This connection sends the workflow back to something earlier " +
              "in it. That is a real way to work \u2014 fit, adjust, fit " +
              "again \u2014 so Qresp will keep it and mark it as a feedback " +
              "loop.",
            <RegularStyledButton
              onClick={() => {
                unsetAlert();
                addEdge({ ...edge, feedback: true });
              }}
            >
              Make feedback loop
            </RegularStyledButton>
          );
          callback(null);
          return;
        }
        addEdge(edge);
        callback(null);
      },
      deleteNode: (data, callback) => {
        const { nodes, edges } = data;
        if (nodes && nodes.length > 0) {
          if (nodes[0].charAt(0) == "h") {
            setEdges(workflow.edges.filter((edge) => !edges.includes(edge.id)));
            del("head", nodes[0]);
          } else {
            setAlert(
              "Error",
              "Only external (red dots) nodes can be removed from here. In order to remove other nodes, please use the corresponding sections above.",
              null
            );
          }
        }
        callback(null);
      },
      deleteEdge: (data, callback) => {
        // Stored edges carry no id, so the graph hands over the endpoints.
        const endpoints = data.endpoints || [];
        if (endpoints.length && unlink) {
          endpoints.forEach(({ from, to }) => unlink(from, to));
        } else {
          deleteEdge(data.edges[0]);
        }
        callback(null);
      },
      editEdge: false,
      controlNodeStyle: {
        size: 8,
        color: "black",
        chosen: false,
      },
    },
    physics: false,
  };

  const data = formatData(charts, tools, heads, datasets, scripts);

  // Which external node the dialog is editing, or null when it is creating
  // one. `heads` stays the only model -- editing reuses the same record and
  // the same dialog rather than a second shape for "an external node that
  // already exists".

  const headDefaults = (head) => ({
    label: (head && head.label) || "",
    readme: (head && head.readme) || "",
    URLs: (head && (head.URLs || []).join(", ")) || "",
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm({ defaultValues: headDefaults(null) });

  // Re-seed on every open: this form outlives the dialog, and RHF only knows
  // values it was given or the user touched.
  useEffect(() => {
    if (open) reset(headDefaults(editingHead));
  }, [open, editingHead]);

  const openExternalNode = () => {
    setDefault("head", null);   // creating, not editing
    setExternalNodeFormOpen(true);
  };

  const closeExternalNode = () => {
    setDefault("head", null);
    setExternalNodeFormOpen(false);
  };

  const onSubmit = (values) => {
    const urls = String(values.URLs || "")
      .split(",")
      .map((el) => el.trim())
      .filter(Boolean);
    const previous = (editingHead && editingHead.URLs) || [];
    // HTTPS is required only for a URL that is NEW or CHANGED. A legacy
    // record may hold an http:// link or none at all, and refusing to let a
    // curator fix its LABEL because of a URL somebody else typed years ago
    // would make old records uneditable -- see `changedUrlProblem`.
    const problem = changedUrlProblem(urls, previous);
    if (problem) {
      setAlert("External data", problem, null);
      return;
    }
    const payload = {
      label: String(values.label || "").trim(),
      readme: values.readme,
      URLs: urls,
    };
    if (editingHead) {
      edit("head", { ...editingHead, ...payload });
    } else if (link.rowScoped) {
      // The record and its arrow, in one reducer change -- or neither, with
      // the dialog left open to say why.
      if (!link.createAndLink(payload)) return;
    } else {
      add("head", { ...payload, id: `h${heads.length}` });
    }
    closeExternalNode();
    setWorkflowFit(!fit);
  };

  // When the workflow was last saved, shown on the button until it changes.
  const markSaved = () => {
    const at = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setEditing("workflowInfo", false);
    setSavedAt(at);
    setDrawerOpen(false);
    try {
      window.sessionStorage.setItem(
        WORKFLOW_SAVED_KEY,
        JSON.stringify({ signature: workflowSignature(workflow), at })
      );
    } catch (e) {
      // Storage unavailable: still saved for this visit.
    }
  };
  const saved = !(editing && editing.workflowInfo);


  const onSaveInDialog = () => {
    unsetAlert();
    markSaved();
  };

  const onSave = () => {
    if (editing.workflowInfo)
      if (!isGraph.connected(workflow))
        setAlert(
          "Warning: Disconnected Nodes",
          "There are some disconnected nodes in the graph, please click save here if you want to still save the workflow",
          <RegularStyledButton onClick={onSaveInDialog}>
            Save
          </RegularStyledButton>
        );
      else if (isGraph.cyclic(workflow))
        setAlert(
          "Warning: Cycles Detected",
          "Cycles detected in the workflow, please click save here if you want to still save the workflow",
          <RegularStyledButton onClick={onSaveInDialog}>
            Save
          </RegularStyledButton>
        );
      else {
        markSaved();
      }
  };

  return (
    <Fragment>
      {dialogOnly ? null : (
      <Drawer
        heading="Build your workflow"
        open={drawerOpen}
        onToggle={setDrawerOpen}
        // The same pencil as every section: pressed while there are unsaved
        // changes, and an Edit that opens it again once saved.
        editing={!saved}
        unsaved={!saved}
        editor={() => setDrawerOpen(true)}
        // Closing it with unsaved changes saves it, like every section.
        onAutoSave={onSave}
      >
        {/* The ordinary path is "Organize figures and resources" above: the
            figure is the root and the connections are made for you. This is
            the picture of the result, and the place to draw a connection that
            section cannot express. Layout is presentation only, never saved.
            The board that used to live here moved into that section -- two
            button-driven editors side by side were two ways to do one thing. */}
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            flexDirection: { xs: "column", sm: "row" },
            gap: 1,
            mb: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            The workflow you built above, read left to right: inputs, the code
            and tools that used them, and the figures they made. Drag boxes to
            tidy the picture (positions are not saved), or draw a connection
            the section above cannot express.
          </Typography>
          <RegularStyledButton onClick={() => openExternalNode()}>
            Add external data
          </RegularStyledButton>
        </Box>
        <Legend />
        <Graph workflow={workflow} data={data} manipulate={manipulate} />
        {/* The same Save every other section has. */}
        <Box sx={{ mt: 1 }}>
          <Grid container direction="row" spacing={1}>
            <Grid size={{ xs: 6, sm: 2, md: 1 }}>
              <RegularStyledButton fullWidth onClick={onSave} data-testid="workflow-save">
                Save
              </RegularStyledButton>
            </Grid>
          </Grid>
        </Box>
      </Drawer>
      )}
      <Dialog open={open} onClose={closeExternalNode}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            <Typography variant="h6" component="div">
              {editingHead ? "Edit external data" : "Add external data"}
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
            <Grid container direction="column" spacing={1}>
              <Grid>
                {/* A short name, so a graph can be read without expanding
                    every description. Optional: legacy records have none and
                    fall back to their note. */}
                <TextInputField
                  id="headLabel"
                  register={register}
                  error={errors && errors.label}
                  label="Label"
                  name="label"
                  placeholder="e.g. Materials Project mp-21276"
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="headDescription"
                  register={register} registerOptions={{ required: "Required" }}
                  error={errors && errors.description}
                  label="Description"
                  name="readme"
                  placeholder="Enter description of the external resource"
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="headURLs"
                  register={register}
                  error={errors && errors.URLs}
                  label="URLs"
                  name="URLs"
                  placeholder="https://… (optional)"
                />
              </Grid>
              {editingHead ? null : (
                <Grid>
                  <FormConnection control={control} newType="head" link={link} />
                </Grid>
              )}
            </Grid>
          </DialogContent>
          <DialogActions>
            <RegularStyledButton type="submit" fullWidth>
              {editingHead ? "Save" : confirmLabel(link.intent, "Save")}
            </RegularStyledButton>
            <RegularStyledButton
              onClick={closeExternalNode}
              fullWidth
            >
              Close
            </RegularStyledButton>
          </DialogActions>
        </form>
      </Dialog>
    </Fragment>
  );
};

export default WorkflowInfoForm;
