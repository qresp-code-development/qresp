import PropTypes from "prop-types";

import { Box, Button, Tooltip } from "@mui/material";
import { LockOutlined, PublicOutlined } from "@mui/icons-material";

// Opens the Visibility & sharing dialog. The button shows the record's
// CURRENT visibility (globe = public, lock = private) next to "Share", so it
// reads as the place for both who can see the record and who has access.
const ShareButton = ({ isPrivate, onClick, testId }) => {
  const Icon = isPrivate ? LockOutlined : PublicOutlined;
  const state = isPrivate ? "Private" : "Public";
  return (
    <Tooltip
      arrow
      title={`This record is ${state.toLowerCase()}. Change its visibility and choose who can view or edit it.`}
    >
      <Button
        size="small"
        variant="outlined"
        data-testid={testId}
        startIcon={<Icon fontSize="inherit" />}
        onClick={onClick}
        aria-label={`Visibility and sharing (currently ${state.toLowerCase()})`}
      >
        {state}
        <Box component="span" sx={{ mx: 0.75, opacity: 0.5 }} aria-hidden="true">
          ·
        </Box>
        Share
      </Button>
    </Tooltip>
  );
};

ShareButton.propTypes = {
  isPrivate: PropTypes.bool,
  onClick: PropTypes.func,
  testId: PropTypes.string,
};

export default ShareButton;
