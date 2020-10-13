import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@material-ui/core";

const FileServerInfo = ({ fileserverpath, defaultOpen, editor }) => {
  return (
    <Drawer
      heading="File Server Information"
      defaultOpen={defaultOpen}
      editor={() => editor("fileServerPathInfo", true)}
    >
      <Box my={1}>
        <LabelValue label="File Server Path" value={fileserverpath} />
      </Box>
    </Drawer>
  );
};

FileServerInfo.propTypes = {
  fileserverpath: PropTypes.string.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
};

export default FileServerInfo;
