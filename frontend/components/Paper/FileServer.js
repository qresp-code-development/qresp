import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@mui/material";

const FileServerInfo = ({ fileserverpath, defaultOpen, editor, children }) => {
  return (
    <Drawer
      heading="File Server Information"
      defaultOpen={defaultOpen}
      editor={editor}
    >
      <Box sx={{ my: 1 }}>
        <LabelValue
          label="File Server Path"
          value={fileserverpath}
          link={fileserverpath}
        />
      </Box>
      {/* Curator-only actions on the saved path (e.g. folder analysis). The
          public paper page passes none. */}
      {children}
    </Drawer>
  );
};

FileServerInfo.propTypes = {
  fileserverpath: PropTypes.string.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node,
};

export default FileServerInfo;
