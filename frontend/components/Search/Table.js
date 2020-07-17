import { Fragment } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from "@material-ui/core";

import EnhancedTableHeader from "./TableHeader";
import EnhancedTablePagination from "./TablePagination";

function createData(name, year) {
  return { name, year };
}

const rows = [
  createData("Cupcake", 305),
  createData("Donut", 452),
  createData("Eclair", 262),
  createData("Frozen yoghurt", 159),
  createData("Gingerbread", 356),
  createData("Honeycomb", 408),
  createData("Ice cream sandwich", 237),
  createData("Jelly Bean", 375),
  createData("KitKat", 518),
  createData("Lollipop", 392),
  createData("Marshmallow", 318),
  createData("Nougat", 360),
  createData("Oreo", 437),
];

const RecordTable = () => {
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

  // Table Headers
  const TableHeaders = [
    { label: "Record", isNumeric: false, value: "name" },
    { label: "Year", isNumeric: true, value: "year" },
  ];

  return (
    <Fragment>
      <TableContainer>
        <Table aria-label="simple table">
          <EnhancedTableHeader
            headers={TableHeaders}
            order={order}
            orderBy={orderBy}
            onRequestSort={handleRequestSort}
          />
          <TableBody>
            {stableSort(rows, getComparator(order, orderBy))
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((row) => (
                <TableRow key={row.name}>
                  <TableCell scope="row">{row.name}</TableCell>
                  <TableCell align="right">{row.year}</TableCell>
                </TableRow>
              ))}

            {emptyRows > 0 && emptyRows < 10 ? (
              <TableRow style={{ height: 53 * emptyRows }}>
                <TableCell colSpan={6} />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      <EnhancedTablePagination
        count={rows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onChangePage={handleChangePage}
        onChangeRowsPerPage={handleChangeRowsPerPage}
      />
    </Fragment>
  );
};

export default RecordTable;
