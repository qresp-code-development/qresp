import { useContext } from "react";

import { RegularStyledButton } from "./button";

import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

import { styled } from "@mui/material/styles";

import AlertContext from "../Context/Alert/alertContext";

const Content = styled(DialogContent)({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "2px",
});

const AlertDialog = () => {
  const { open, title, msg, buttons, hideDismiss, unsetAlert } =
    useContext(AlertContext);

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
      <DialogActions
        sx={{
          alignItems: { xs: "stretch", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          flexWrap: "wrap",
          gap: 1,
          justifyContent: "flex-end",
          "& > *": { m: 0 },
        }}
      >
        {hideDismiss ? null : (
          <RegularStyledButton onClick={handleClose}>
            Dismiss
          </RegularStyledButton>
        )}
        {buttons ? buttons : null}
      </DialogActions>
    </Dialog>
  );
};

export default AlertDialog;
