import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@mui/material";

import { workTypeInfo } from "../../Utils/workTypes";
import { referenceUtil } from "../../Utils/utils";

const ReferenceC = ({ referenceInfo, editor, defaultOpen, workType }) => {
  const { authors, title, publication, abstract, url } = referenceInfo;
  const info = workTypeInfo(workType);
  // A report's institution or series is stored in a paper's journal slot.
  const venue = referenceUtil.get(publication).journal;

  return (
    <Drawer
      heading={info.heading}
      editor={editor}
      defaultOpen={defaultOpen}
    >
      <Box sx={{ my: 1 }}>
        <LabelValue label={title} />
        <LabelValue value={`by ${authors}`} />
        {info.paperFields ? (
          <LabelValue label="Published In" value={publication} link={url} />
        ) : (
          <>
            {info.venueLabel && venue ? (
              <LabelValue label={info.venueLabel} value={venue} />
            ) : null}
            {url ? <LabelValue label={info.urlLabel} value={url} link={url} /> : null}
          </>
        )}
        <LabelValue label={info.abstractLabel} value={abstract} />
      </Box>
    </Drawer>
  );
};

ReferenceC.propTypes = {
  referenceInfo: PropTypes.object.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
  workType: PropTypes.string,
};

export default ReferenceC;
