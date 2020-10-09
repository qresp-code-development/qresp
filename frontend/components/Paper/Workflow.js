import PropTypes from "prop-types";

import useMediaQuery from "@material-ui/core/useMediaQuery";

import Drawer from "../drawer";
import Graph from "../Workflow/Graph";
import Legend from "../Workflow/Legend";
import { formatData, formatWorkflow } from "../Workflow/util";

import { Box, Grid, useTheme } from "@material-ui/core";

const Workflow = ({ workflow, charts, tools, scripts, datasets, external }) => {
  const theme = useTheme();
  const direction = useMediaQuery(theme.breakpoints.down("sm"))
    ? "row"
    : "column";

  const data = formatData(charts, tools, external, datasets, scripts);

  return (
    <Drawer heading="Workflow">
      <Box mt={1}>
        <Grid container direction="row">
          <Grid item xs={12} md={10}>
            <Graph workflow={workflow} data={data} />
          </Grid>
          <Grid item xs={12} md={2}>
            <Legend direction={direction} />
          </Grid>
        </Grid>
      </Box>
    </Drawer>
  );
};

Workflow.propTypes = {
  workflow: PropTypes.object.isRequired,
  charts: PropTypes.array.isRequired,
  tools: PropTypes.array.isRequired,
  scripts: PropTypes.array.isRequired,
  datasets: PropTypes.array.isRequired,
  external: PropTypes.array.isRequired,
};

export default Workflow;
