import PropTypes from "prop-types";

import { Grid, Hidden } from "@material-ui/core";

import TablePaginationActions from "./TablePagination";
import RowsDisplayedLabel from "./RowsDisplayedLabel";

const EnhancedTableFooter = (props) => {
  const { rows, page, rowsPerPage, onChangePage } = props;
  return (
    <Grid container direction="row">
      <Hidden xsDown>
        <Grid item sm={6} container justify="flex-start">
          <RowsDisplayedLabel
            rows={rows}
            page={page}
            rowsPerPage={rowsPerPage}
          />
        </Grid>
        <Grid item sm={6} container justify="flex-end">
          <TablePaginationActions
            count={rows}
            rowsPerPage={rowsPerPage}
            page={page}
            onChangePage={onChangePage}
          />
        </Grid>
      </Hidden>
      <Hidden smUp>
        <Grid item sm={12} container justify="center">
          <RowsDisplayedLabel
            rows={rows}
            page={page}
            rowsPerPage={rowsPerPage}
          />
        </Grid>
        <Grid item sm={12} container justify="center">
          <TablePaginationActions
            count={rows}
            rowsPerPage={rowsPerPage}
            page={page}
            onChangePage={onChangePage}
          />
        </Grid>
      </Hidden>
    </Grid>
  );
};

EnhancedTableFooter.propTypes = {
  rows: PropTypes.number.isRequired,
  onChangePage: PropTypes.func.isRequired,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
};

export default EnhancedTableFooter;
