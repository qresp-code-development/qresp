import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@material-ui/core";

const FileServerInfo = ({ fileserverpath }) => {
  return (
    <Drawer heading="File Server Information">
      <Box my={1}>
        <LabelValue label="File Server Path" value={fileserverpath} />
      </Box>
    </Drawer>
  );
};

FileServerInfo.propTypes = {
  fileserverpath: PropTypes.string.isRequired,
};

export default FileServerInfo;
