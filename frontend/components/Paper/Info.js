import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@mui/material";

const PaperInfo = ({ paperInfo, editor, defaultOpen }) => {
  const { PIs, collections, tags, notebookFile } = paperInfo;

  return (
    <Drawer
      heading="Qresp Curation Information"
      editor={editor}
      defaultOpen={defaultOpen}
    >
      <Box sx={{ my: 1 }}>
        <LabelValue label="Principal Investigators" value={PIs} />
        <LabelValue label="Collections" value={collections.join(", ")} />
        <LabelValue label="Keywords" value={tags.join(", ")} />
        {notebookFile && (
          <LabelValue label="Main Notebook File" value={notebookFile} />
        )}
      </Box>
    </Drawer>
  );
};

PaperInfo.propTypes = {
  paperInfo: PropTypes.object.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
};

export default PaperInfo;
