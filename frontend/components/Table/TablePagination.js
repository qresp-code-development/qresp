import PropTypes from "prop-types";

import { Box } from "@material-ui/core";
import { Pagination } from "@material-ui/lab";

const TablePaginationActions = (props) => {
  const { count, page, rowsPerPage, onChangePage } = props;

  const handleSpecificPageClick = (event, newPage) => {
    onChangePage(event, newPage - 1);
  };

  return (
    <Box display="flex" alignItems="center">
      <Pagination
        page={page + 1}
        count={Math.ceil(count / rowsPerPage)}
        onChange={handleSpecificPageClick}
        showFirstButton
        showLastButton
        color="primary"
      />
    </Box>
  );
};

TablePaginationActions.propTypes = {
  count: PropTypes.number.isRequired,
  onChangePage: PropTypes.func.isRequired,
  page: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
};

export default TablePaginationActions;
