import PropTypes from "prop-types";
import { Box } from "@mui/material";

import FolderAnalysis from "./FolderAnalysis";

// Manual entry and RCC-assisted import are peers. Keeping both actions in the
// artifact section makes the scope obvious and avoids one oversized dialog
// that asks the curator to review four unrelated record types at once.
const ArtifactActionBar = ({ artifactType, children }) => (
  <Box
    data-testid={`${artifactType}-actions`}
    sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
      gap: 1,
      mb: 1,
      alignItems: "stretch",
      "& > *": { minWidth: 0 },
      "& .MuiButton-root": { width: "100%", height: "100%" },
    }}
  >
    <Box>{children}</Box>
    <FolderAnalysis artifactType={artifactType} />
  </Box>
);

ArtifactActionBar.propTypes = {
  artifactType: PropTypes.oneOf(["chart", "dataset", "script", "tool"])
    .isRequired,
  children: PropTypes.node.isRequired,
};

export default ArtifactActionBar;
