import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import Link from "next/link";

import {
  Typography,
  Grid,
  Box,
  Paper,
  withStyles,
  Chip,
  IconButton,
} from "@material-ui/core";

import { ExpandMoreRounded, ExpandLessRounded } from "@material-ui/icons";

const StyledPaper = withStyles({
  root: {
    backgroundColor: "inherit",
  },
})(Paper);

const StyledChip = withStyles({
  root: {
    margin: "4px",
    color: "rgba(0,0,0,0.60)",
  },
})(Chip);

const Summary = ({ rowdata, servers }) => {
  const {
    _Search__abstract,
    _Search__authors,
    _Search__collections,
    _Search__doi,
    _Search__downloadPath,
    _Search__fileServerPath,
    _Search__folderAbsolutePath,
    _Search__id,
    _Search__notebookFile,
    _Search__notebookPath,
    _Search__publication,
    _Search__serverPath,
    _Search__tags,
    _Search__title,
    _Search__year,
  } = rowdata;

  const [checked, setChecked] = React.useState(true);

  const handleChange = () => {
    setChecked((prev) => !prev);
  };

  const downloadUrl = _Search__doi.slice(_Search__doi.lastIndexOf("/") + 1);

  const globusDownLoadUrl = `https://app.globus.org/file-manager?origin_id=${process.env.NEXT_PUBLIC_GLOBUS_ORIGIN_ID}&origin_path=${downloadUrl}`;

  return (
    <Fragment>
      <StyledPaper elevation={0}>
        <Grid container justify="flex-start" alignItems="center">
          <Grid item xs={11} container>
            <Grid item xs={12}>
              <Link
                href="/paperdetails/[id]"
                as={{
                  pathname: "/paperdetails/" + _Search__id,
                  query: { servers: servers },
                }}
              >
                <a>
                  <Typography variant="h6" component="div" gutterBottom>
                    <Box fontWeight="bold">{_Search__title}</Box>
                  </Typography>
                </a>
              </Link>
            </Grid>
            <Grid item xs={12}>
              <Typography
                variant="subtitle1"
                component="div"
                color="secondary"
                gutterBottom
              >
                {_Search__authors}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <a
                href={"https://doi.org/" + _Search__doi}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Typography variant="body1" component="div" gutterBottom>
                  {_Search__publication}
                </Typography>
              </a>
            </Grid>
            <Grid xs={12}>
              {_Search__tags.map((tag) => (
                <StyledChip label={tag} key={tag} size="small" />
              ))}
            </Grid>
            <Grid item xs={12}>
              <div className="accordion" hidden={checked}>
                <StyledPaper elevation={0}>
                  <Grid container justify="space-evenly">
                    <Grid item>
                      <Link
                        href="/paperdetails/[id]"
                        as={{
                          pathname: "/paperdetails/" + _Search__id,
                          query: { servers: servers },
                        }}
                      >
                        <a rel="noopener noreferrer">
                          <img src="/images/figures-icon.png" />
                        </a>
                      </Link>
                    </Grid>
                    <Grid item>
                      <Link
                        href="/paperdetails/[id]"
                        as={{
                          pathname: "/paperdetails/" + _Search__id,
                          query: { servers: servers },
                        }}
                      >
                        <a rel="noopener noreferrer">
                          <img src="/images/workflow-icon.png" />
                        </a>
                      </Link>
                    </Grid>
                    <Grid item>
                      <a href={globusDownLoadUrl} rel="noopener noreferrer">
                        <img src="/images/download-icon.png" />
                      </a>
                    </Grid>
                    <Grid item>
                      {" "}
                      <a
                        href={
                          _Search__notebookPath + "/" + _Search__notebookFile
                        }
                        rel="noopener noreferrer"
                      >
                        <img src="/images/jupyter-icon.png" />
                      </a>
                    </Grid>
                  </Grid>
                </StyledPaper>
              </div>
            </Grid>
          </Grid>
          <Grid item xs={1}>
            <IconButton onClick={handleChange}>
              {checked ? <ExpandMoreRounded /> : <ExpandLessRounded />}
            </IconButton>
          </Grid>
        </Grid>
      </StyledPaper>
      <style jsx>{`
        a {
          color: #007bff;
        }
        a:hover {
          color: #777777;
        }
        img {
          margin: 8px 8px 0px;
          height: 36px;
          width: 36 px;
        }
        .accordion {
          transition: visibility 2s ease-in 2s;
        }
      `}</style>
    </Fragment>
  );
};

Summary.propTypes = {
  rowdata: PropTypes.object.isRequired,
  servers: PropTypes.string.isRequired,
};

export default Summary;
