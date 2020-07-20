import { Fragment } from "react";
import PropTypes from "prop-types";

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  withStyles,
} from "@material-ui/core";

import RowsPerPageSelector from "./RowsPerPageSelector";
import EnhancedTableHeader from "./TableHeader";
import EnhancedTableFooter from "./TableFooter";

import Summary from "../Paper/Summary";

const StyledTableCell = withStyles({
  root: {
    padding: "8px",
  },
})(TableCell);

const StyledLastTableCell = withStyles({
  root: {
    padding: "8px",
    borderBottomColor: "#000",
  },
})(TableCell);

const RecordTable = (props) => {
  const { rows } = props;

  // Table Headers
  const TableHeaders = [
    { label: "Record", isNumeric: false, value: "_Search__title" },
    { label: "Year", isNumeric: true, value: "_Search__year" },
  ];

  // Pagination Controls
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const emptyRows =
    rowsPerPage - Math.min(rowsPerPage, rows.length - page * rowsPerPage);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Sorting Controls
  const [order, setOrder] = React.useState("desc");
  const [orderBy, setOrderBy] = React.useState("Year");

  const handleRequestSort = (event, property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  // Descending Comparator
  function comparator(a, b, orderBy) {
    if (b[orderBy] < a[orderBy]) {
      return -1;
    }
    if (b[orderBy] > a[orderBy]) {
      return 1;
    }
    return 0;
  }

  // Switch b/w Ascending & Descending
  function getComparator(order, orderBy) {
    return order === "desc"
      ? (a, b) => comparator(a, b, orderBy)
      : (a, b) => -comparator(a, b, orderBy);
  }

  // Sorting Function
  function stableSort(array, comparator) {
    const stabilizedThis = array.map((el, index) => [el, index]);
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    return stabilizedThis.map((el) => el[0]);
  }

  // Sorted Data
  const sortedData = stableSort(rows, getComparator(order, orderBy)).slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Fragment>
      <RowsPerPageSelector
        count={rows.length}
        rowsPerPage={rowsPerPage}
        onChangeRowsPerPage={handleChangeRowsPerPage}
      />
      <TableContainer>
        <Table aria-label="Record (Paper) Table">
          <EnhancedTableHeader
            headers={TableHeaders}
            order={order}
            orderBy={orderBy}
            onRequestSort={handleRequestSort}
          />
          <TableBody>
            {sortedData.map((row, index) => {
              if (index == sortedData.length - 1) {
                return (
                  <TableRow key={row._Search__title}>
                    <StyledLastTableCell scope="row">
                      {row._Search__title}
                    </StyledLastTableCell>
                    <StyledLastTableCell align="right">
                      {row._Search__year}
                    </StyledLastTableCell>
                  </TableRow>
                );
              }
              return (
                <TableRow key={row._Search__id}>
                  <StyledTableCell scope="row">
                    {row._Search__title}
                  </StyledTableCell>
                  <StyledTableCell align="right">
                    {row._Search__year}
                  </StyledTableCell>
                </TableRow>
              );
            })}

            {emptyRows > 0 && emptyRows < 10 ? (
              <TableRow style={{ height: 47 * emptyRows }}>
                <TableCell colSpan={6} />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      <EnhancedTableFooter
        rows={rows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onChangePage={handleChangePage}
      />
    </Fragment>
  );
};

RecordTable.propTypes = {
  rows: PropTypes.array.isRequired,
};

export default RecordTable;
