import PropTypes from "prop-types";

import { Box, Button, Tooltip } from "@mui/material";
import {
  CloudDownloadOutlined,
  FolderOpenOutlined,
  MenuBookOutlined,
  SchemaOutlined,
} from "@mui/icons-material";

// The actions offered under every figure/table on a record page. Defined once
// so the record page and the Paper Exploration documentation always show the
// same icon, name and explanation.
export const CHART_ACTIONS = {
  files: {
    label: "Files",
    Icon: FolderOpenOutlined,
    tooltip: "Browse the folder of files behind this figure on the file server",
    description:
      "Opens the paper's folder on the file server, where you can browse every file behind this figure or table: images, data, scripts and notebooks.",
  },
  workflow: {
    label: "Workflow",
    Icon: SchemaOutlined,
    tooltip: "See how this figure was made: the datasets, scripts and tools that produced it",
    description:
      "Shows how the figure or table was created: the part of the paper's workflow graph that leads to it, keeping only the datasets, scripts, tools and notebooks involved.",
  },
  download: {
    label: "Download",
    Icon: CloudDownloadOutlined,
    tooltip: "Download all of this paper's data (opens Globus)",
    description:
      "Downloads the entire paper content, usually through Globus. Only shown when the curator provided a download link.",
  },
  notebook: {
    label: "Notebook",
    Icon: MenuBookOutlined,
    tooltip: "Read the Jupyter notebook that generated this figure (opens nbviewer)",
    description:
      "Opens the Jupyter notebook the curator used to create this figure or table, rendered read-only by nbviewer. Only shown when a notebook was provided.",
  },
};

const ActionButton = ({ action, href, onClick, external }) => {
  const { label, Icon, tooltip } = CHART_ACTIONS[action];
  return (
    <Tooltip title={tooltip} arrow placement="top">
      <Button
        size="small"
        variant="outlined"
        color="primary"
        startIcon={<Icon fontSize="small" />}
        href={href}
        onClick={onClick}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        aria-label={`${label}: ${tooltip}`}
        data-testid={`chart-action-${action}`}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 5,
          px: 1.25,
          py: 0.25,
          lineHeight: 1.6,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );
};

ActionButton.propTypes = {
  action: PropTypes.oneOf(Object.keys(CHART_ACTIONS)).isRequired,
  href: PropTypes.string,
  onClick: PropTypes.func,
  external: PropTypes.bool,
};

// The labelled action row under a figure. Actions without a target are left
// out rather than shown as dead buttons.
const ChartActions = ({ filesHref, onWorkflow, downloadHref, notebookHref }) => (
  <Box
    data-testid="chart-actions"
    sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0.75, mt: 1 }}
  >
    {filesHref ? <ActionButton action="files" href={filesHref} external /> : null}
    {onWorkflow ? <ActionButton action="workflow" href="#" onClick={onWorkflow} /> : null}
    {downloadHref ? <ActionButton action="download" href={downloadHref} external /> : null}
    {notebookHref ? <ActionButton action="notebook" href={notebookHref} external /> : null}
  </Box>
);

ChartActions.propTypes = {
  filesHref: PropTypes.string,
  onWorkflow: PropTypes.func,
  downloadHref: PropTypes.string,
  notebookHref: PropTypes.string,
};

export default ChartActions;
