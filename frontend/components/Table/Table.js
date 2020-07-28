import { Fragment, createElement, useEffect } from "react";
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
  const { rows, views, headers, displayorder } = props;

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
  const [orderBy, setOrderBy] = React.useState("year");

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
            headers={headers}
            order={order}
            orderBy={orderBy}
            onRequestSort={handleRequestSort}
          />
          <TableBody>
            {sortedData.map((row, index) => {
              return (
                <TableRow key={index}>
                  {displayorder.map((td, i) => {
                    const element = views[td]
                      ? createElement(views[td], { rowdata: row[td] })
                      : row[td];

                    return index == sortedData.length - 1 ? (
                      <StyledLastTableCell key={i} align={headers[i].align}>
                        {element}
                      </StyledLastTableCell>
                    ) : (
                      <StyledTableCell key={i} align={headers[i].align}>
                        {element}
                      </StyledTableCell>
                    );
                  })}
                </TableRow>
              );
            })}

            {/* {emptyRows > 0 && emptyRows < 10 ? (
              <TableRow style={{ height: 47 * emptyRows }}>
                <TableCell colSpan={6} />
              </TableRow>
            ) : null} */}
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
  headers: PropTypes.array.isRequired,
  rows: PropTypes.array.isRequired,
  displayorder: function (props, propName, componentName) {
    if (!props[propName]) {
      return new Error("Required Prop views cannot be null!");
    }
    if (!Array.isArray(props[propName])) {
      return new Error("views should be of type Array");
    }
    if (props[propName].length !== props["headers"].length) {
      return new Error("Number of Views and Headers MisMatch");
    }
  },
  views: PropTypes.object.isRequired,
};

export default RecordTable;
