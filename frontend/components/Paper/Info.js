import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@material-ui/core";

const PaperInfo = ({ paperInfo, editor, defaultOpen }) => {
  const { PIs, collections, tags, notebookFile } = paperInfo;

  const PINames = PIs.map(
    (pi) => `${pi.firstName} ${pi.middleName} ${pi.lastName}`
  );

  return (
    <Drawer
      heading="Curator Information"
      editor={editor}
      defaultOpen={defaultOpen}
    >
      <Box my={1}>
        <LabelValue
          label="Principal Investigators: "
          value={PINames.join(", ")}
        />
        <LabelValue label="Collections" value={collections} />
        <LabelValue label="Tags" value={tags} />
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
