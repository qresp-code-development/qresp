import { useState, useContext, Fragment } from "react";

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

import CuratorContext from "../../Context/Curator/curatorContext";

const WorkflowInfoForm = () => {
  const {
    charts,
    tools,
    scripts,
    datasets,
    heads,
    workflow,
    setNodes,
    setEdges,
    addNode,
    deleteNode,
    addEdge,
    deleteEdge,
    add,
    del,
  } = useContext(CuratorContext);

  const theme = useTheme();
  const direction = useMediaQuery(theme.breakpoints.down("sm"))
    ? "row"
    : "column";

  const [open, setOpen] = useState(false);

  const manipulate = {
    manipulation: {
      enabled: true,
      initiallyActive: true,
      addNode: false,
      addEdge: true,
      deleteNode: (data, callback) => {
        const { nodes } = data;
        if (nodes && nodes.length > 0) {
          if (nodes[0].charAt(0) == "h") {
            del("head", nodes[0]);
          }
        }
        callback(null);
      },
      deleteEdge: true,
    },
  };

  const data = formatData(charts, tools, heads, datasets, scripts);

  const { register, handleSubmit, errors } = useForm();

  const onSubmit = (values) => {
    values["id"] = `h${heads.length}`;
    add("head", values);
    setOpen(false);
  };

  const [state, setState] = useState({ reArrange: false, showLabels: false });

  return (
    <Fragment>
      <Drawer heading="Workflow" defaultOpen={true}>
        <Grid container direction="row" spacing={1}>
          <Grid item xs={12} sm={4}>
            <RegularStyledButton onClick={() => setOpen(true)} fullWidth>
              Add an External Node
            </RegularStyledButton>
          </Grid>
          <Grid item xs={6} sm={4}>
            <RegularStyledButton
              fullWidth
              onClick={() => {
                setState({ ...state, reArrange: true });
                setTimeout(setState({ ...state, reArrange: false }), 100);
              }}
            >
              Re Arrange
            </RegularStyledButton>{" "}
          </Grid>
          <Grid item xs={12} sm={4}>
            <RegularStyledButton fullWidth>Show Labels</RegularStyledButton>{" "}
          </Grid>
        </Grid>

        <Box mt={1}>
          <Grid container direction="row">
            <Grid item xs={12} md={10}>
              <Graph
                workflow={workflow}
                data={data}
                manipulate={manipulate}
                fitNow={state.fitNow}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Legend direction={direction} />
            </Grid>
          </Grid>
        </Box>
        <Box my={1}>
          <RegularStyledButton onClick={() => setOpen(false)} fullWidth>
            Save
          </RegularStyledButton>
        </Box>
      </Drawer>
      <Dialog open={open} onClose={() => setOpen(false)}>
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
            <RegularStyledButton onClick={() => setOpen(false)} fullWidth>
              Close
            </RegularStyledButton>
          </DialogActions>
        </form>
      </Dialog>
    </Fragment>
  );
};

export default WorkflowInfoForm;
