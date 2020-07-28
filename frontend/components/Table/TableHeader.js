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
            key={header.label}
            align={header.align}
            sortDirection={
              header.value && orderBy === header.value ? order : false
            }
          >
            <TableSortLabel
              active={header.value && orderBy === header.value}
              direction={
                header.value && orderBy === header.value ? order : "asc"
              }
              onClick={header.value ? createSortHandler(header.value) : null}
              hideSortIcon={header.value ? true : false}
            >
              {header.label}
              {header.value && orderBy === header.value ? (
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
