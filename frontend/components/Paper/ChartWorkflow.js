import PropTypes from "prop-types";

import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
  Grid,
  useTheme,
} from "@material-ui/core";

import useMediaQuery from "@material-ui/core/useMediaQuery";

import Graph from "../Workflow/Graph";
import Legend from "../Workflow/Legend";
import { formatWorkflow } from "../Workflow/util";

const ChartWorkflow = ({
  showChartWorkflow,
  setShowChartWorkflow,
  workflow,
  data,
}) => {
  const theme = useTheme();

  const direction = useMediaQuery(theme.breakpoints.down("sm"))
    ? "row"
    : "column";

  const handleClose = () => {
    setShowChartWorkflow(false);
  };

  return (
    <Dialog
      onClose={handleClose}
      open={showChartWorkflow}
      maxWidth="md"
      fullWidth
    >
      {/* <DialogTitle>{title}</DialogTitle> */}
      <DialogContent dividers>
        <Grid container direction="row">
          <Grid item xs={12} md={10}>
            <Graph workflow={formatWorkflow(workflow)} data={data} />
          </Grid>
          <Grid item xs={12} md={2}>
            <Legend direction={direction} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={handleClose} color="primary">
          Dismiss
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ChartWorkflow.poprTypes = {
  showChartWorkflow: PropTypes.bool.isRequired,
  setShowChartWorkflow: PropTypes.func.isRequired,
  workflow: PropTypes.object.isRequired,
  data: PropTypes.object.isRequired,
};

export default ChartWorkflow;
