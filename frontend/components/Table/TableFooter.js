import PropTypes from "prop-types";

import { Grid, Hidden } from "@material-ui/core";

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
    <Grid container direction="row">
      <Hidden xsDown>
        <Grid item sm={6} container justify="flex-start">
          {displayLabel}
        </Grid>
        <Grid item sm={6} container justify="flex-end">
          {paginator}
        </Grid>
      </Hidden>
      <Hidden smUp>
        <Grid item sm={12} container justify="center">
          {displayLabel}
        </Grid>
        <Grid item sm={12} container justify="center">
          {paginator}
        </Grid>
      </Hidden>
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
