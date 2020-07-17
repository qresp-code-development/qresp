import { Fragment } from "react";

import PropTypes from "prop-types";

import {
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Hidden,
} from "@material-ui/core";

const EnhancedTableHeader = (props) => {
  const { headers, orderBy, order, onRequestSort } = props;

  const createSortHandler = (property) => (event) => {
    onRequestSort(event, property);
  };

  return (
    <TableHead>
      <TableRow>
        {headers.map((header) => (
          <TableCell
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
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

export default EnhancedTableHeader;
