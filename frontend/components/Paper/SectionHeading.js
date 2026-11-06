import PropTypes from "prop-types";
import { Box, Typography } from "@mui/material";

const SectionHeading = ({ children }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 5, mb: 1.5 }}>
    <Typography
      variant="h6"
      component="h2"
      sx={{ fontWeight: 700, color: "#222", whiteSpace: "nowrap" }}
    >
      {children}
    </Typography>
    <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
  </Box>
);

SectionHeading.propTypes = {
  children: PropTypes.node.isRequired,
};

export default SectionHeading;
