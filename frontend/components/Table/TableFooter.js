import PropTypes from "prop-types";

import { Grid } from "@mui/material";

import TablePaginationActions from "./TablePagination";
import RowsDisplayedLabel from "./RowsDisplayedLabel";

const EnhancedTableFooter = (props) => {
  const { rows, filtered, page, rowsPerPage, onChangePage } = props;

  const displayLabel = (
    <RowsDisplayedLabel
      rows={rows}
      filtered={filtered}
      page={page}
      rowsPerPage={rowsPerPage}
    />
  );

  const paginator = (
    <TablePaginationActions
      count={filtered}
      rowsPerPage={rowsPerPage}
      page={page}
      onChangePage={onChangePage}
    />
  );

  return (
    // MUI v6+ removed <Hidden>; responsive display lives on the items.
    <Grid container direction="row">
      <Grid container justifyContent="flex-start" sx={{ display: { xs: "none", sm: "flex" } }} size={{ sm: 6 }}>
        {displayLabel}
      </Grid>
      <Grid container justifyContent="flex-end" sx={{ display: { xs: "none", sm: "flex" } }} size={{ sm: 6 }}>
        {paginator}
      </Grid>
      <Grid container justifyContent="center" sx={{ display: { xs: "flex", sm: "none" } }} size={12}>
        {displayLabel}
      </Grid>
      <Grid container justifyContent="center" sx={{ display: { xs: "flex", sm: "none" } }} size={12}>
        {paginator}
      </Grid>
    </Grid>
  );
};

EnhancedTableFooter.propTypes = {
  rows: PropTypes.number.isRequired,
  filtered: PropTypes.number.isRequired,
  onChangePage: PropTypes.func.isRequired,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
};

export default EnhancedTableFooter;
