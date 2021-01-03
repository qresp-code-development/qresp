import { useState, useContext, Fragment } from "react";

import {
  Grid,
  Hidden,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
  TextField,
} from "@material-ui/core";

import { GetApp, Visibility } from "@material-ui/icons";

import axios from "axios";

import { useRouter } from "next/router";

import { convertStateToViewSchema } from "../../Utils/model";

import { getServer } from "../../Utils/utils";
import StyledTooltip from "../tooltip";
import { RegularStyledButton } from "../button";

import CuratorContext from "../../Context/Curator/curatorContext";
import AlertContext from "../../Context/Alert/alertContext";
import ServerContext from "../../Context/Servers/serverContext";

const preview = (metadata, setAlert, router) => {
  axios
    .post(getServer() + "/api/preview", convertStateToViewSchema(metadata))
    .then((res) => res.data)
    .then((res) =>
      router.push("/paperdetails/[id]", {
        pathname: `/paperdetails/${res}`,
        query: { server: getServer() },
      })
    )
    .catch((err) => {
      console.error(err);
      setAlert(
        "Error",
        "There was an error generating your preview, please talk to the administrators if the issue persists",
        null
      );
    });
};

const TopActions = () => {
  const { metadata, setAll, resetAll } = useContext(CuratorContext);
  const { setAlert, unsetAlert } = useContext(AlertContext);
  const { setSelectedHttp, selectedHttp } = useContext(ServerContext);
  const [mdata, setMdata] = useState("");
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);

  const router = useRouter();

  const onClicks = {
    resume: () => {
      setResumeDialogOpen(true);
    },
    scratch: () => {
      setAlert(
        "Warning",
        "This is an irreversible operation, please download your work if you plan to use it in the future. Do you still wish to continue ?",
        <Fragment>
          <RegularStyledButton
            endIcon={<GetApp />}
            href={`data:text/json;charset=utf-8,${encodeURIComponent(
              JSON.stringify(onClicks.download(metadata), null, 2)
            )}`}
            download="metadata.json"
          >
            Download Metadata
          </RegularStyledButton>
          <RegularStyledButton
            onClick={() => {
              resetAll();
              unsetAlert();
            }}
          >
            Yes, start from Scratch
          </RegularStyledButton>
        </Fragment>
      );
    },
    download: (metadata) => {
      return { ...metadata, selectedHttp: selectedHttp };
    },
    preview: (e) => {
      e.preventDefault();
      preview(metadata, setAlert, router);
    },
  };

  const buttons = {
    resume: (fullWidth = false) => (
      <StyledTooltip title="Continue with an existing metadata file (json)">
        <RegularStyledButton fullWidth={fullWidth} onClick={onClicks.resume}>
          Upload Metadata
        </RegularStyledButton>
      </StyledTooltip>
    ),
    scratch: (fullWidth = false) => (
      <StyledTooltip title="Clear the session and start afresh">
        <RegularStyledButton fullWidth={fullWidth} onClick={onClicks.scratch}>
          Start from Scratch
        </RegularStyledButton>
      </StyledTooltip>
    ),
    download: (fullWidth = false) => (
      <StyledTooltip title=" Download metadata of the paper being curated">
        <RegularStyledButton
          fullWidth={fullWidth}
          endIcon={<GetApp />}
          href={`data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(onClicks.download(metadata), null, 2)
          )}`}
          download="metadata.json"
        >
          Download Metadata
        </RegularStyledButton>
      </StyledTooltip>
    ),
    preview: (fullWidth = false) => (
      <StyledTooltip title="Preview the curated paper">
        <RegularStyledButton
          fullWidth={fullWidth}
          endIcon={<Visibility />}
          onClick={onClicks.preview}
        >
          Preview
        </RegularStyledButton>
      </StyledTooltip>
    ),
  };

  const onFileUpload = async (e) => {
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setMdata(ev.target.result);
    };
    reader.readAsText(e.target.files[0]);
  };

  const useMetadata = () => {
    try {
      const values = JSON.parse(mdata);
      setSelectedHttp(values.selectedHttp);
      delete values.selectedHttp;
      setAll(values);
      setResumeDialogOpen(false);
    } catch (e) {
      console.error(e);
      setAlert(
        "Error",
        " There was an error parsing your file, please provide a valid json file.",
        null
      );
    }
  };

  return (
    <Fragment>
      <Grid container direction="row" spacing={1}>
        <Grid container direction="row" item xs={12} sm={6} spacing={1}>
          <Hidden xsDown>
            <Grid item>{buttons.resume()}</Grid>
            <Grid item>{buttons.scratch()}</Grid>
          </Hidden>
          <Hidden smUp>
            <Grid item xs={4}>
              {buttons.resume(true)}
            </Grid>
            <Grid item xs={8}>
              {buttons.scratch(true)}
            </Grid>
          </Hidden>
        </Grid>
        <Grid container direction="row-reverse" item xs={12} sm={6} spacing={1}>
          <Hidden xsDown>
            <Grid item>{buttons.preview()}</Grid>
            <Grid item>{buttons.download()}</Grid>
          </Hidden>
          <Hidden smUp>
            <Grid item xs={6}>
              {buttons.preview(true)}
            </Grid>
            <Grid item xs={6}>
              {buttons.download(true)}
            </Grid>
          </Hidden>
        </Grid>
      </Grid>
      <Dialog
        open={resumeDialogOpen}
        onClose={() => setResumeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Proceed</DialogTitle>
        <DialogContent dividers>
          <input
            accept="application/json"
            id="uploadJSON"
            type="file"
            style={{ display: "none" }}
            onChange={onFileUpload}
          />
          <label htmlFor="uploadJSON">
            <RegularStyledButton
              variant="contained"
              color="primary"
              component="span"
              fullWidth
            >
              Upload
            </RegularStyledButton>
          </label>
          <TextField
            value={mdata}
            label="Metadata"
            placeholder="Paste your metadata here"
            variant="outlined"
            multiline
            rows={24}
            fullWidth
            style={{ marginTop: "1em" }}
            onChange={(e) => setMdata(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <RegularStyledButton onClick={useMetadata}>
            Use this metadata
          </RegularStyledButton>
          <RegularStyledButton onClick={() => setResumeDialogOpen(false)}>
            Cancel
          </RegularStyledButton>
        </DialogActions>
      </Dialog>
    </Fragment>
  );
};

export { preview };
export default TopActions;
