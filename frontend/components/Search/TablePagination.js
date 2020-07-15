import React from "react";
import PropTypes from "prop-types";

import { withStyles } from "@material-ui/styles";
import { IconButton, Box, TablePagination } from "@material-ui/core";
import { Pagination } from "@material-ui/lab";

import {
  FirstPage,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  LastPage,
} from "@material-ui/icons";

const StyledPagination = withStyles({
  ul: { flexWrap: "nowrap" },
})(Pagination);

const StyledTablePagination = withStyles({
  spacer: { flex: "none" },
})(TablePagination);

const TablePaginationActions = (props) => {
  const { count, page, rowsPerPage, onChangePage } = props;

  const handleFirstPageButtonClick = (event) => {
    onChangePage(event, 0);
  };

  const handleBackButtonClick = (event) => {
    onChangePage(event, page - 1);
  };

  const handleNextButtonClick = (event) => {
    onChangePage(event, page + 1);
  };

  const handleLastPageButtonClick = (event) => {
    onChangePage(event, Math.max(0, Math.ceil(count / rowsPerPage) - 1));
  };

  const handleSpecificPageClick = (event, newPage) => {
    onChangePage(event, newPage - 1);
  };

  return (
    <Box
      display="flex"
      flexDirection="row"
      justifyContent="flex-end"
      alignItems="center"
      flexGrow={1}
      mx={1}
    >
      <Box display="flex" flexDirection="row" flexGrow={1}></Box>
      <IconButton
        onClick={handleFirstPageButtonClick}
        disabled={page === 0}
        aria-label="first page"
      >
        <FirstPage />
      </IconButton>
      <IconButton
        onClick={handleBackButtonClick}
        disabled={page === 0}
        aria-label="previous page"
      >
        <KeyboardArrowLeft />
      </IconButton>
      <StyledPagination
        page={page + 1}
        count={Math.ceil(count / rowsPerPage)}
        onChange={handleSpecificPageClick}
        hidePrevButton
        hideNextButton
        color="primary"
      />
      <IconButton
        onClick={handleNextButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="next page"
      >
        <KeyboardArrowRight />
      </IconButton>
      <IconButton
        onClick={handleLastPageButtonClick}
        disabled={page >= Math.ceil(count / rowsPerPage) - 1}
        aria-label="last page"
      >
        <LastPage />
      </IconButton>
    </Box>
  );
};

TablePaginationActions.propTypes = {
  count: PropTypes.number.isRequired,
  onChangePage: PropTypes.func.isRequired,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
};

const EnhancedTablePagination = (props) => {
  const { count, page, rowsPerPage, onChangePage, onChangeRowsPerPage } = props;
  return (
    <StyledTablePagination
      rowsPerPageOptions={[10, 25, 100, { label: "All", value: -1 }]}
      count={count}
      rowsPerPage={rowsPerPage}
      page={page}
      SelectProps={{
        inputProps: { "aria-label": "rows per page" },
        native: true,
      }}
      onChangePage={onChangePage}
      onChangeRowsPerPage={onChangeRowsPerPage}
      ActionsComponent={TablePaginationActions}
      labelDisplayedRows={({ from, to, count, page }) => {
        return `Showing ${from} to ${to} from ${count} records`;
      }}
      fullWidth
    />
  );
};

export default EnhancedTablePagination;
