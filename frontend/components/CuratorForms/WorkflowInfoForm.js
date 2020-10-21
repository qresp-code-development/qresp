import { useEffect, useContext, Fragment } from "react";

import {
  Box,
  Grid,
  useTheme,
  useMediaQuery,
  Dialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@material-ui/core";

import { useForm } from "react-hook-form";

import Drawer from "../drawer";
import { RegularStyledButton } from "../button";
import { TextInputField } from "../Form/InputFields";

import Graph from "../Workflow/Graph";
import Legend from "../Workflow/Legend";
import { formatData } from "../Workflow/util";
import { isGraph } from "../../Utils/graph";

import AlertContext from "../../Context/Alert/alertContext";
import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

const WorkflowInfoForm = () => {
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
    add,
    del,
    setEdges,
  } = useContext(CuratorContext);

  const {
    workflowHelper: { open, fit, showLabels },
    setExternalNodeFormOpen,
    setShowLabels,
    setWorkflowFit,
    setWorkflowOnClick,
    setEditing,
    editing,
  } = useContext(CuratorHelperContext);

  const theme = useTheme();
  const direction = useMediaQuery(theme.breakpoints.down("sm"))
    ? "row"
    : "column";

  useEffect(() => {
    setWorkflowOnClick(false);
    setShowLabels(true);
    return () => {
      setWorkflowOnClick(true);
      setShowLabels(false);
    };
  }, []);

  useEffect(() => {
    setEditing("workflowInfo", true);
  }, [workflow]);

  const manipulate = {
    manipulation: {
      enabled: true,
      initiallyActive: true,
      addNode: false,
      addEdge: (data, callback) => {
        if (data.to == data.from) {
          setAlert(
            "Self Edge Alert",
            "You are adding a self edge, if you want to proceed click Go Ahead",
            <RegularStyledButton
              onClick={() => {
                unsetAlert();
                addEdge(data);
              }}
            >
              Go Ahead
            </RegularStyledButton>
          );
        } else addEdge(data);
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
        deleteEdge(data.edges[0]);
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

  const { register, handleSubmit, errors } = useForm();

  const onSubmit = (values) => {
    values["id"] = `h${heads.length}`;
    values.URLs = values.URLs.split(",").map((el) => el.trim());
    add("head", values);
    setExternalNodeFormOpen(false);
    setWorkflowFit(!fit);
  };

  const onSaveInDialog = () => {
    unsetAlert();
    setEditing("workflowInfo", false);
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
        setEditing("workflowInfo", false);
      }
  };

  return (
    <Fragment>
      <Drawer heading="Build your workflow" defaultOpen={true}>
        <Grid container direction="row" spacing={1}>
          <Grid item xs={12} sm={4}>
            <RegularStyledButton
              onClick={() => setExternalNodeFormOpen(true)}
              fullWidth
            >
              Add an External Node
            </RegularStyledButton>
          </Grid>
          <Grid item xs={6} sm={4}>
            <RegularStyledButton
              fullWidth
              onClick={() => {
                setWorkflowFit(!fit);
              }}
            >
              Rearrange
            </RegularStyledButton>{" "}
          </Grid>
          <Grid item xs={12} sm={4}>
            <RegularStyledButton
              fullWidth
              onClick={() => setShowLabels(!showLabels)}
            >
              {showLabels ? "Hide" : "Show"} Labels
            </RegularStyledButton>{" "}
          </Grid>
        </Grid>

        <Box mt={1}>
          <Grid container direction="row">
            <Grid item xs={12} md={10}>
              <Graph workflow={workflow} data={data} manipulate={manipulate} />
            </Grid>
            <Grid item xs={12} md={2}>
              <Legend direction={direction} />
            </Grid>
          </Grid>
        </Box>
        <Box my={1}>
          <RegularStyledButton onClick={onSave} fullWidth>
            Save
          </RegularStyledButton>
        </Box>
      </Drawer>
      <Dialog open={open} onClose={() => setExternalNodeFormOpen(false)}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            <Typography variant="h6" component="div">
              Add an External Node
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
            <Grid container direction="column" spacing={1}>
              <Grid item>
                <TextInputField
                  id="headDescription"
                  inputRef={register({ required: "Required" })}
                  error={errors && errors.description}
                  label="Description"
                  name="readme"
                  placeholder="Enter description of the external resource"
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="headURLs"
                  inputRef={register}
                  error={errors && errors.URLs}
                  label="URLs"
                  name="URLs"
                  placeholder="Enter links to the external resource"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <RegularStyledButton type="submit" fullWidth>
              Save
            </RegularStyledButton>
            <RegularStyledButton
              onClick={() => setExternalNodeFormOpen(false)}
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
