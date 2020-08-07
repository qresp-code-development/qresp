import { Fragment, createElement, useState } from "react";
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
import TableSearch, { searchFilter } from "./TableSearch";
import { getComparator, stableSort } from "./TableSort";

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
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Sorting Controls
  const [order, setOrder] = useState("desc");
  const [orderBy, setOrderBy] = useState("");

  const handleRequestSort = (event, property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  // Search/Filter Controls
  const [query, setQuery] = useState("");

  // Sorted Data
  const sortedFilteredData = (orderBy.length > 0
    ? stableSort(rows, getComparator(order, orderBy, columns), orderBy)
    : rows
  ).filter(searchFilter(columns, query)); // Filtering Data

  // Paginating
  const paginatedData = sortedFilteredData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

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
          <TableSearch columns={columns} query={query} setQuery={setQuery} />
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
            {paginatedData.map((row, index) => {
              return (
                <TableRow key={index}>
                  {columns.map((col, i) => {
                    const element = col.view
                      ? createElement(col.view, { rowdata: row[col.name] })
                      : row[col.name];

                    return index == paginatedData.length - 1 ? (
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
        filtered={sortedFilteredData.length}
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
