import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@material-ui/core";

const ReferenceC = ({ referenceInfo, editor, defaultOpen }) => {
  const { authors, title, publication, abstract, url } = referenceInfo;

  return (
    <Drawer
      heading="Reference Information"
      editor={editor}
      defaultOpen={defaultOpen}
    >
      <Box my={1}>
        <LabelValue label={title} />
        <LabelValue value={`by ${authors}`} />
        <LabelValue label="Published In" value={publication} link={url} />
        <LabelValue label="Abstract" value={abstract} />
      </Box>
    </Drawer>
  );
};

ReferenceC.propTypes = {
  referenceInfo: PropTypes.object.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
};

export default ReferenceC;
