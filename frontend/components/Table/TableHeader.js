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
            align={header.options.align ? header.options.align : "left"}
            sortDirection={orderBy === header.name ? order : false}
          >
            <TableSortLabel
              active={orderBy === header.name}
              direction={orderBy === header.name ? order : "asc"}
              onClick={createSortHandler(header.name)}
              disabled={header.options.sort ? false : true}
            >
              {header.label}
              {orderBy === header.name ? (
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
