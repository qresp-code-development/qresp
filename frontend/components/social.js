import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { Popover, IconButton, Paper, Snackbar } from "@material-ui/core";
import { Share, Facebook, Twitter, Link, Email } from "@material-ui/icons";
import { Alert } from "@material-ui/lab";

const SocialShare = ({ url }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [alert, setAlert] = useState({
    show: false,
    type: "success",
    msg: "Link copied successfully",
  });

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleAlertClose = (event, reason) => {
    setAlert({ ...alert, show: false });
  };

  const shareFacebook = () => {
    const link = window.location.href;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${link}`,
      "_blank"
    );
    handleClose();
  };

  const shareTwitter = () => {
    const link = window.location.href;
    window.open(`https://twitter.com/home?status=${link}`, "_blank");
    handleClose();
  };

  const shareEmail = () => {
    const link = window.location.href;
    window.location.href = `mailto:?subject=${document.title}body=Please have a look at:%0D%0A${link}`;
  };

  const shareLink = () => {
    const link = window.location.href;
    console.log(navigator);
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setAlert({ ...alert, show: true });
      })
      .catch((err) => {
        // This can happen if the user denies clipboard permissions:
        setAlert({
          ...alert,
          show: true,
          type: "error",
          msg: "There was an error copying the url",
        });
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
          <IconButton onClick={shareFacebook}>
            <Facebook style={{ color: "#1877f2" }} />
          </IconButton>
          <IconButton onClick={shareTwitter}>
            <Twitter style={{ color: "#1da0f2" }} />
          </IconButton>
          <IconButton onClick={shareEmail}>
            <Email />
          </IconButton>
          <IconButton onClick={shareLink}>
            <Link color="primary" />
          </IconButton>
        </Paper>
      </Popover>
      <Snackbar
        open={alert.show}
        autoHideDuration={5000}
        onClose={handleAlertClose}
      >
        <Alert
          severity={alert.type}
          variant="filled"
          onClose={handleAlertClose}
        >
          {alert.msg}
        </Alert>
      </Snackbar>
    </Fragment>
  );
};

SocialShare.propTypes = {
  url: PropTypes.string.isRequired,
};

export default SocialShare;
