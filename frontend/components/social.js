import { Fragment, useState, useRef } from "react";

import { Popover, IconButton, Snackbar, Alert } from "@mui/material";

import { Share, Facebook, Twitter, Link, Email } from "@mui/icons-material";

const SocialShare = () => {
  const anchorEl = useRef(null);

  const [alert, setAlert] = useState({
    show: false,
    type: "success",
    msg: "Link copied successfully",
  });

  const [showPopover, setShowPopover] = useState(false);

  const handlePopoverOpen = () => {
    setShowPopover(true);
  };

  const handlePopoverClose = () => {
    setShowPopover(false);
  };

  const handleButtonClick = () => {
    setShowPopover(!showPopover);
  };

  const handleAlertClose = () => {
    setAlert({ ...alert, show: false });
  };

  const shareFacebook = () => {
    const link = window.location.href;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${link}`,
      "_blank"
    );
    handlePopoverClose();
  };

  const shareTwitter = () => {
    const link = window.location.href;
    window.open(`https://twitter.com/home?status=${link}`, "_blank");
    handlePopoverClose();
  };

  const shareEmail = () => {
    const link = window.location.href;
    window.location.href = `mailto:?subject=${document.title}body=Please have a look at:%0D%0A${link}`;
  };

  const shareLink = () => {
    const link = window.location.href;
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

    handlePopoverClose();
  };

  return (
    <Fragment>
      <IconButton
        color="primary"
        onMouseEnter={handlePopoverOpen}
        onClick={handleButtonClick}
        onMouseLeave={handlePopoverClose}
        ref={anchorEl}
      >
        <Share />
      </IconButton>
      <Popover
        sx={{ pointerEvents: "none" }}
        anchorOrigin={{
          vertical: "center",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "center",
          horizontal: "left",
        }}
        open={showPopover}
        anchorEl={anchorEl.current}
        disableRestoreFocus
        slotProps={{
          paper: {
            onMouseEnter: handlePopoverOpen,
            onMouseLeave: handlePopoverClose,
            sx: { pointerEvents: "auto" },
          },
        }}
      >
        {/* <Paper> */}
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
        {/* </Paper> */}
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

export default SocialShare;
