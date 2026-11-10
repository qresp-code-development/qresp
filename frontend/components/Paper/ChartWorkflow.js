import PropTypes from "prop-types";

import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
} from "@mui/material";

import Graph from "../Workflow/Graph";
import Legend from "../Workflow/Legend";
import { formatWorkflow } from "../Workflow/util";

const ChartWorkflow = ({
  showChartWorkflow,
  setShowChartWorkflow,
  workflow,
  data,
}) => {
  const handleClose = () => {
    setShowChartWorkflow(false);
  };

  return (
    <Dialog
      onClose={handleClose}
      open={showChartWorkflow}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>Workflow for this figure</DialogTitle>
      <DialogContent dividers>
        <Legend />
        <Graph workflow={formatWorkflow(workflow)} data={data} />
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={handleClose} color="primary">
          Dismiss
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ChartWorkflow.propTypes = {
  showChartWorkflow: PropTypes.bool.isRequired,
  setShowChartWorkflow: PropTypes.func.isRequired,
  workflow: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
};

export default ChartWorkflow;
