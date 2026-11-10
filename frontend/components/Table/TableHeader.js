import PropTypes from "prop-types";

import {
  Box,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { visuallyHidden } from "@mui/utils";

const StyledTableCell = styled(TableCell)({
  padding: "10px 12px",
  backgroundColor: "#fafafa",
  borderBottomColor: "rgba(0,0,0,0.12)",
  color: "#555",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
});

const EnhancedTableHeader = (props) => {
  const { headers, orderBy, order, onRequestSort } = props;

  const createSortHandler = (property) => (event) => {
    onRequestSort(event, property);
  };

  return (
    <TableHead>
      <TableRow>
        {headers.filter((h) => !h.hidden).map((header) => (
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
                <Box component="span" sx={visuallyHidden}>
                  {order === "desc" ? "sorted descending" : "sorted ascending"}
                </Box>
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
