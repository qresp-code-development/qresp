import { useContext } from "react";

import { Grid, Tooltip, Hidden, Typography } from "@material-ui/core";
import { GetApp, Visibility } from "@material-ui/icons";

import { RegularStyledButton } from "../button";

import CuratorContext from "../../Context/Curator/curatorContext";

const TopActions = () => {
  const { metadata } = useContext(CuratorContext);

  const tooltipTexts = {
    resume: (
      <Typography variant="caption">
        Continue with an existing metadata file (json)
      </Typography>
    ),
    scratch: (
      <Typography variant="caption">
        Clear the session and start afresh
      </Typography>
    ),
    download: (
      <Typography variant="caption">
        Download metadata of the paper being curated
      </Typography>
    ),
    preview: (
      <Typography variant="caption">Preview the curated paper</Typography>
    ),
  };

  return (
    <Grid container direction="row" spacing={1}>
      <Grid container direction="row" item xs={12} sm={6} spacing={1}>
        <Hidden xsDown>
          <Grid item>
            <Tooltip title={tooltipTexts.resume} arrow>
              <RegularStyledButton>Resume</RegularStyledButton>
            </Tooltip>
          </Grid>
          <Grid item>
            <Tooltip title={tooltipTexts.scratch} arrow>
              <RegularStyledButton>Start from Scratch</RegularStyledButton>
            </Tooltip>
          </Grid>
        </Hidden>
        <Hidden smUp>
          <Grid item xs={4}>
            <Tooltip title={tooltipTexts.resume} arrow>
              <RegularStyledButton fullWidth>Resume</RegularStyledButton>
            </Tooltip>
          </Grid>
          <Grid item xs={8}>
            <Tooltip title={tooltipTexts.scratch} arrow>
              <RegularStyledButton fullWidth>
                Start from Scratch
              </RegularStyledButton>
            </Tooltip>
          </Grid>
        </Hidden>
      </Grid>
      <Grid container direction="row-reverse" item xs={12} sm={6} spacing={1}>
        <Hidden xsDown>
          <Grid item>
            <Tooltip title={tooltipTexts.preview} arrow>
              <RegularStyledButton endIcon={<Visibility />}>
                Preview
              </RegularStyledButton>
            </Tooltip>
          </Grid>
          <Grid item>
            <Tooltip title={tooltipTexts.download} arrow>
              <RegularStyledButton
                endIcon={<GetApp />}
                href={`data:text/json;charset=utf-8,${encodeURIComponent(
                  JSON.stringify(metadata, null, 2)
                )}`}
                download="metadata.json"
              >
                Download
              </RegularStyledButton>
            </Tooltip>
          </Grid>
        </Hidden>
        <Hidden smUp>
          <Grid item xs={6}>
            {" "}
            <Tooltip title={tooltipTexts.preview} arrow>
              <RegularStyledButton endIcon={<Visibility />} fullWidth>
                Preview
              </RegularStyledButton>
            </Tooltip>
          </Grid>
          <Grid item xs={6}>
            <Tooltip title={tooltipTexts.download} arrow>
              <RegularStyledButton
                endIcon={<GetApp />}
                href={`data:text/json;charset=utf-8,${encodeURIComponent(
                  JSON.stringify(metadata, null, 2)
                )}`}
                download="metadata.json"
                fullWidth
              >
                Download
              </RegularStyledButton>
            </Tooltip>
          </Grid>
        </Hidden>
      </Grid>
    </Grid>
  );
};

export default TopActions;
