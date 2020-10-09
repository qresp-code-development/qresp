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

import Ajv from "ajv";
import schema from "../../Context/schema";
import axios from "axios";

import { useRouter } from "next/router";

import { convertStateToSchema, convertSchemaToState } from "../../Utils/model";
import { getServer } from "../../Utils/utils";
import StyledTooltip from "../tooltip";
import { RegularStyledButton } from "../button";

import CuratorContext from "../../Context/Curator/curatorContext";
import AlertContext from "../../Context/Alert/alertContext";

const TopActions = () => {
  const { metadata, setAll, resetAll } = useContext(CuratorContext);
  const { setAlert } = useContext(AlertContext);
  const [mdata, setMdata] = useState("");
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);

  const router = useRouter();

  const onClicks = {
    resume: () => {
      setResumeDialogOpen(true);
    },
    download: (metadata) => {
      return metadata;
    },
    preview: (e) => {
      e.preventDefault();
      axios
        .post(getServer() + "/api/preview", convertStateToSchema(metadata))
        .then((res) => res.data)
        // .then((res) => console.log(res))
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
    },
  };

  const buttons = {
    resume: (fullWidth = false) => (
      <StyledTooltip title="Continue with an existing metadata file (json)">
        <RegularStyledButton fullWidth={fullWidth} onClick={onClicks.resume}>
          Resume
        </RegularStyledButton>
      </StyledTooltip>
    ),
    scratch: (fullWidth = false) => (
      <StyledTooltip title="Clear the session and start afresh">
        <RegularStyledButton fullWidth={fullWidth} onClick={resetAll}>
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
          Download
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

export default TopActions;
