import PropTypes from "prop-types";

import Drawer from "../drawer";

import { Typography, Box } from "@mui/material";

const Documentation = ({ documentation, editor, defaultOpen }) => {
  return (
    <Drawer heading="Documentation" editor={editor} defaultOpen={defaultOpen}>
      <Box sx={{ my: 1 }}>
        <Typography variant="h6" component="div" color="secondary">
          <Box sx={{ fontWeight: "bold" }}>Readme</Box>
        </Typography>
        <Typography color="secondary">{documentation}</Typography>
      </Box>
    </Drawer>
  );
};

Documentation.propTypes = {
  documentation: PropTypes.string.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
};

export default Documentation;
