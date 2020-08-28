import { Fragment, useContext } from "react";
import PropTypes from "prop-types";

import Link from "next/link";
import { Typography, Grid, Box, Paper, withStyles } from "@material-ui/core";

import Tag from "../tag";

import { TableSearchContext } from "../Table/TableSearch";

const StyledPaper = withStyles({
  root: {
    backgroundColor: "inherit",
  },
})(Paper);

const Summary = ({ rowdata }) => {
  const {
    _Search__authors,
    _Search__doi,
    _Search__id,
    _Search__publication,
    _Search__tags,
    _Search__title,
    _Search__server,
  } = rowdata;

  const { setQuery } = useContext(TableSearchContext);

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
                  query: { server: _Search__server },
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
                style={{ wordBreak: "break-all" }}
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
                <Tag
                  label={tag
                    .slice(0, 32)
                    .trim()
                    .concat(tag.length > 32 ? "..." : "")}
                  key={tag}
                  size="small"
                  onClick={() => {
                    setQuery(tag);
                    window.scrollTo(0, 0);
                  }}
                />
              ))}
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
};

export default Summary;
