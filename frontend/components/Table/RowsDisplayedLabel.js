import PropTypes from "prop-types";

import { Typography, Box } from "@material-ui/core";

const DisplayedRowsLabel = (props) => {
  const { rows, page, rowsPerPage, filtered } = props;
  const start = rowsPerPage * page;
  const end = Math.min(start + rowsPerPage, filtered);
  return (
    <Box m={1}>
      <Typography variant="overline">
        Showing {filtered == 0 ? 0 : start + 1} to {end} of {filtered}{" "}
        {filtered != rows ? "filtered" : null} records{" "}
        {filtered != rows ? " (Total Records: " + rows + ")" : null}
      </Typography>
    </Box>
  );
};

DisplayedRowsLabel.propTypes = {
  rows: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
};

export default DisplayedRowsLabel;
