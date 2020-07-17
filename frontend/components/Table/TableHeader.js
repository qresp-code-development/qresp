import PropTypes from "prop-types";

import {
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Hidden,
  withStyles,
} from "@material-ui/core";

const StyledTableCell = withStyles({
  root: {
    borderBottomColor: "#000",
    padding: "8px",
  },
})(TableCell);

const EnhancedTableHeader = (props) => {
  const { headers, orderBy, order, onRequestSort } = props;

  const createSortHandler = (property) => (event) => {
    onRequestSort(event, property);
  };

  return (
    <TableHead>
      <TableRow>
        {headers.map((header) => (
          <StyledTableCell
            key={header.value}
            align={header.isNumeric ? "right" : "left"}
            sortDirection={orderBy === header.value ? order : false}
          >
            <TableSortLabel
              active={orderBy === header.value}
              direction={orderBy === header.value ? order : "asc"}
              onClick={createSortHandler(header.value)}
            >
              {header.label}
              {orderBy === header.value ? (
                <Hidden xlDown xlUp>
                  {order === "desc" ? "sorted descending" : "sorted ascending"}
                </Hidden>
              ) : null}
            </TableSortLabel>
          </StyledTableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

EnhancedTableHeader.propTypes = {
  headers: PropTypes.array.isRequired,
  orderBy: PropTypes.string.isRequired,
  order: PropTypes.string.isRequired,
  onRequestSort: PropTypes.func.isRequired,
};

export default EnhancedTableHeader;
