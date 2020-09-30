import PropTypes from "prop-types";

import Drawer from "../drawer";
import LabelValue from "../labelvalue";

import { Box } from "@material-ui/core";

const CuratorInfo = ({ curator, editor, defaultOpen }) => {
  const { firstName, middleName, lastName, emailId, affiliation } = curator;
  return (
    <Drawer
      heading="Curator Information"
      editor={editor}
      defaultOpen={defaultOpen}
    >
      <Box my={1}>
        <LabelValue
          label="Name"
          value={
            firstName.trim() +
            " " +
            (middleName ? middleName.trim() : "") +
            " " +
            lastName.trim()
          }
        />
        <LabelValue label="Email Address" value={emailId} />
        {affiliation && <LabelValue label="Affiliation" value={affiliation} />}
      </Box>
    </Drawer>
  );
};

CuratorInfo.propTypes = {
  curator: PropTypes.object.isRequired,
  editor: PropTypes.func,
  defaultOpen: PropTypes.bool,
};

export default CuratorInfo;
