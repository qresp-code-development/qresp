import PropTypes from "prop-types";

import { Typography, Box } from "@material-ui/core";

const DisplayedRowsLabel = (props) => {
  const { rows, page, rowsPerPage } = props;
  const start = rowsPerPage * page;
  const end = Math.min(start + rowsPerPage, rows);
  return (
    <Box m={1}>
      <Typography variant="overline">
        Showing {start + 1} to {end} of {rows} records
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
