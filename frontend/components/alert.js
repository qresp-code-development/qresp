import { useState, useContext } from "react";

import { SmallStyledButton } from "./button";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@material-ui/core";

import { withStyles } from "@material-ui/core/styles";

import AlertContext from "../Context/Alert/alertContext";

const ContentText = withStyles({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "2px",
  },
})(DialogContentText);

const AlertDialog = (props) => {
  // const [open, setOpen] = useState(true);

  const { open, title, msg, buttons, unsetAlert } = useContext(AlertContext);

  const handleClose = () => {
    // setOpen(false);
    unsetAlert();
  };

  // const { title, msg, buttons } = props;

  return (
    <Dialog
      open={open}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      {title ? (
        <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
      ) : null}

      <DialogContent dividers>
        <ContentText id="alert-dialog-description">{msg}</ContentText>
      </DialogContent>
      <DialogActions>
        <SmallStyledButton onClick={handleClose}>Dismiss</SmallStyledButton>
        {buttons ? buttons : null}
      </DialogActions>
    </Dialog>
  );
};

export default AlertDialog;
