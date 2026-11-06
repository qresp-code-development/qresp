import { useState } from "react";

import PropTypes from "prop-types";

import Drawer from "../drawer";
import Graph from "../Workflow/Graph";
import Legend from "../Workflow/Legend";
import { formatData } from "../Workflow/util";
import WorkflowSummary from "./WorkflowSummary";

import { Box, Button, Collapse } from "@mui/material";

const Workflow = ({ workflow, charts, tools, scripts, datasets, external }) => {
  const data = formatData(charts, tools, external, datasets, scripts);
  const [wordsOpen, setWordsOpen] = useState(false);

  return (
    <Drawer heading="Workflow">
      {/* THE PICTURE FIRST.
          A workflow of any size printed as a nested "connected to:" list runs
          for screens before the graph is even reached, and the shape of the
          thing -- which is what the graph is for -- was arriving second. */}
      <Box>
        <Legend />
        <Graph workflow={workflow} data={data} />
      </Box>

      {/* THE SAME THING IN WORDS, one tap away.
          Not deleted: the graph is a canvas, so it is unreadable with a
          screen reader and poor on a phone. This is the only form of a
          published workflow some readers can get at, so it stays -- closed,
          announced, and out of the way of everyone else. */}
      <Box sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="text"
          onClick={() => setWordsOpen((was) => !was)}
          aria-expanded={wordsOpen}
          data-testid="workflow-words-toggle"
        >
          Workflow in words
        </Button>
        <Collapse in={wordsOpen} unmountOnExit>
          <Box sx={{ mt: 0.5 }} data-testid="workflow-words">
            <WorkflowSummary
              workflow={workflow}
              charts={charts}
              datasets={datasets}
              scripts={scripts}
              tools={tools}
              external={external}
            />
          </Box>
        </Collapse>
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
