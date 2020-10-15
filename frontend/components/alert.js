import { useContext } from "react";

import { RegularStyledButton } from "./button";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@material-ui/core";

import { withStyles } from "@material-ui/core/styles";

import AlertContext from "../Context/Alert/alertContext";

const Content = withStyles({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "2px",
  },
})(DialogContent);

const AlertDialog = () => {
  const { open, title, msg, buttons, unsetAlert } = useContext(AlertContext);

  const handleClose = () => {
    unsetAlert();
  };

  return (
    <Dialog
      open={open}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      {title ? (
        <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
      ) : null}

      <Content dividers>
        <Typography component="div">{msg}</Typography>
      </Content>
      <DialogActions>
        <RegularStyledButton onClick={handleClose}>Dismiss</RegularStyledButton>
        {buttons ? buttons : null}
      </DialogActions>
    </Dialog>
  );
};

export default AlertDialog;
