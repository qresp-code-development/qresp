import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { Popover, IconButton, Paper } from "@material-ui/core";
import { Share, Facebook, Twitter, Link } from "@material-ui/icons";

const SocialShare = ({ url }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const shareLink = () => {
    const link = window.location.href;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        console.log("Text copied to clipboard");
      })
      .catch((err) => {
        // This can happen if the user denies clipboard permissions:
        console.error("Could not copy text: ", err);
      });
    handleClose();
  };

  const open = Boolean(anchorEl);

  return (
    <Fragment>
      <IconButton color="primary" onClick={handleClick}>
        <Share />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
      >
        <Paper>
          <IconButton>
            <Facebook />
          </IconButton>
          <IconButton>
            <Twitter />
          </IconButton>
          <IconButton onClick={shareLink}>
            <Link />
          </IconButton>
        </Paper>
      </Popover>
    </Fragment>
  );
};

SocialShare.propTypes = {
  url: PropTypes.string.isRequired,
};

export default SocialShare;
