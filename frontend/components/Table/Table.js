import { Fragment, createElement } from "react";
import PropTypes from "prop-types";

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  withStyles,
  Grid,
} from "@material-ui/core";

import RowsPerPageSelector from "./RowsPerPageSelector";
import EnhancedTableHeader from "./TableHeader";
import EnhancedTableFooter from "./TableFooter";
import TableSearch from "../Search/Search";

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
  const { rows, columns } = props;

  // Pagination Controls
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Sorting Controls
  const [order, setOrder] = React.useState("desc");
  const [orderBy, setOrderBy] = React.useState("");

  const handleRequestSort = (event, property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  // Descending Comparator
  function comparator(a, b) {
    if (b < a) return -1;
    if (b > a) return 1;
    return 0;
  }

  // Switch b/w Ascending & Descending
  function getComparator(order, orderBy) {
    // Get function to get value from data object
    var sortVal;
    columns.forEach((col) => {
      if (col.name == orderBy) {
        sortVal = col.options.value;
      }
    });
    return order === "desc"
      ? (a, b) => comparator(sortVal(a), sortVal(b))
      : (a, b) => -comparator(sortVal(a), sortVal(b));
  }

  // Sorting Function
  function stableSort(array, comparator, orderBy) {
    const stabilizedThis = array.map((el, index) => [el, index]);

    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0][orderBy], b[0][orderBy]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    return stabilizedThis.map((el) => el[0]);
  }

  // Sorted Data
  const sortedData = (orderBy.length > 0
    ? stableSort(rows, getComparator(order, orderBy), orderBy)
    : rows
  ).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Fragment>
      <Grid container direction="row" alignItems="center">
        <Grid item xs={12} sm={6}>
          <RowsPerPageSelector
            count={rows.length}
            rowsPerPage={rowsPerPage}
            onChangeRowsPerPage={handleChangeRowsPerPage}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TableSearch />
        </Grid>
      </Grid>
      <TableContainer>
        <Table>
          <EnhancedTableHeader
            headers={columns}
            order={order}
            orderBy={orderBy}
            onRequestSort={handleRequestSort}
          />
          <TableBody>
            {sortedData.map((row, index) => {
              return (
                <TableRow key={index}>
                  {columns.map((col, i) => {
                    const element = col.view
                      ? createElement(col.view, { rowdata: row[col.name] })
                      : row[col.name];

                    return index == sortedData.length - 1 ? (
                      <StyledLastTableCell key={i} align={col.options.align}>
                        {element}
                      </StyledLastTableCell>
                    ) : (
                      <StyledTableCell key={i} align={col.options.align}>
                        {element}
                      </StyledTableCell>
                    );
                  })}
                </TableRow>
              );
            })}
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
  columns: PropTypes.array.isRequired,
  rows: PropTypes.array.isRequired,
};

export default RecordTable;
