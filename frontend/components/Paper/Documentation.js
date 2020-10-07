import PropTypes from "prop-types";

import Drawer from "../drawer";

import { Typography, Box } from "@material-ui/core";

const Documentation = ({ documentation, editor, defaultOpen }) => {
  return (
    <Drawer heading="Documentation" editor={editor} defaultOpen={defaultOpen}>
      <Box my={1}>
        <Typography variant="h6" component="div" color="secondary">
          <Box fontWeight="bold">Readme</Box>
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
