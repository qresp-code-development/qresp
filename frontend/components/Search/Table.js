import { Fragment } from "react";

import PropTypes from "prop-types";

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableFooter,
  Box,
} from "@material-ui/core";

import TableSortLabel from "@material-ui/core/TableSortLabel";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";

import IconButton from "@material-ui/core/IconButton";
import Tooltip from "@material-ui/core/Tooltip";

import FilterListIcon from "@material-ui/icons/FilterList";

import EnhancedTablePagination from "./TablePagination";

function createData(name, calories) {
  return { name, calories };
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

  return (
    <Fragment>
      <TableContainer>
        <Table aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell>Record</TableCell>
              <TableCell align="right">Year</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(rowsPerPage > 0
              ? rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              : rows
            ).map((row) => (
              <TableRow key={row.name}>
                <TableCell scope="row">{row.name}</TableCell>
                <TableCell align="right">{row.calories}</TableCell>
              </TableRow>
            ))}

            {emptyRows > 0 ? (
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
