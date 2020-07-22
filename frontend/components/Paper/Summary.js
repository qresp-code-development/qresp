import { Fragment, useState } from "react";
import PropTypes from "prop-types";
import { CSSTransition } from "react-transition-group";

import Link from "next/link";

import styles from "./Summary.module.css";

import {
  Typography,
  Grid,
  Box,
  Paper,
  withStyles,
  Chip,
  IconButton,
} from "@material-ui/core";

import {
  KeyboardArrowRightRounded,
  KeyboardArrowLeftRounded,
} from "@material-ui/icons";

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

const StyledButton = withStyles({
  root: {
    paddingLeft: 0,
    paddingRight: 0,
  },
})(IconButton);

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

  const [checked, setChecked] = useState(false);

  const handleChange = async () => {
    setChecked((prev) => !prev);
  };

  const downloadUrl = _Search__doi.slice(_Search__doi.lastIndexOf("/") + 1);

  const globusDownLoadUrl = `https://app.globus.org/file-manager?origin_id=${process.env.NEXT_PUBLIC_GLOBUS_ORIGIN_ID}&origin_path=${downloadUrl}`;

  return (
    <Fragment>
      <StyledPaper elevation={0}>
        <Grid container justify="flex-start" alignItems="center">
          <Grid item xs={12} container>
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
            <Grid item xs={12}>
              {_Search__tags.map((tag) => (
                <StyledChip label={tag} key={tag} size="small" />
              ))}
            </Grid>

            <Grid item xs={12} container direction="row">
              <Grid item xs={2}>
                <StyledButton onClick={handleChange}>
                  {checked ? (
                    <KeyboardArrowLeftRounded />
                  ) : (
                    <KeyboardArrowRightRounded />
                  )}
                </StyledButton>
              </Grid>
              <CSSTransition
                in={checked}
                timeout={300}
                classNames={{
                  enter: styles.enter,
                  enterActive: styles.enterActive,
                  exit: styles.exit,
                  exitActive: styles.exitActive,
                }}
                unmountOnExit
              >
                <Grid
                  item
                  xs={9}
                  container
                  direction="row"
                  justify="space-between"
                  spacing={1}
                >
                  <Grid item>
                    <Link
                      href="/paperdetails/[id]"
                      as={{
                        pathname: "/paperdetails/" + _Search__id,
                        query: { servers: servers + "#showFigures" },
                      }}
                    >
                      <a
                        rel="noopener noreferrer"
                        alt="Link to Paper Charts"
                        target="_blank"
                      >
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
                      <a
                        rel="noopener noreferrer"
                        alt="Link to Paper Workflow"
                        target="_blank"
                      >
                        <img src="/images/workflow-icon.png" />
                      </a>
                    </Link>
                  </Grid>
                  <Grid item>
                    <a
                      href={globusDownLoadUrl}
                      rel="noopener noreferrer"
                      alt="Download Paper Using Globus"
                      target="_blank"
                    >
                      <img src="/images/download-icon.png" />
                    </a>
                  </Grid>
                  {_Search__notebookFile ? (
                    <Grid item>
                      <a
                        href={
                          _Search__notebookPath + "/" + _Search__notebookFile
                        }
                        rel="noopener noreferrer"
                        alt="View DEfault Notebook File"
                        target="_blank"
                      >
                        <img src="/images/jupyter-icon.png" />
                      </a>
                    </Grid>
                  ) : null}
                </Grid>
              </CSSTransition>
            </Grid>
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
          margin: 8px 0px 0px;
          height: 32px;
          width: 32px;
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
