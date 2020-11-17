import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@material-ui/core";

const PaperInfo = ({ paperInfo, editor, defaultOpen }) => {
  const { PIs, collections, tags, notebookFile } = paperInfo;

  return (
    <Drawer
      heading="Paper Information"
      editor={editor}
      defaultOpen={defaultOpen}
    >
      <Box my={1}>
        <LabelValue label="Principal Investigators: " value={PIs} />
        <LabelValue label="Collections" value={collections.join(", ")} />
        <LabelValue label="Tags" value={tags.join(", ")} />
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
