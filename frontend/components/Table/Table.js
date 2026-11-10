import { createElement, useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Box,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";
import { styled } from "@mui/material/styles";

import { CSSTransition, TransitionGroup } from "react-transition-group";

import RowsPerPageSelector from "./RowsPerPageSelector";
import EnhancedTableHeader from "./TableHeader";
import EnhancedTableFooter from "./TableFooter";
import TableSearch, { TableSearchState } from "./TableSearch";
import { getComparator, stableSort } from "./TableSort";

const StyledTableCell = styled(TableCell)({
  padding: "14px 12px",
  verticalAlign: "top",
  borderBottomColor: "rgba(0,0,0,0.08)",
});

const StyledLastTableCell = styled(StyledTableCell)({
  borderBottom: 0,
});

// React 19 removed findDOMNode, which CSSTransition falls back to when no
// nodeRef is supplied; each animated row therefore owns its ref here.
const FadeTableRow = ({ children, ...transitionProps }) => {
  const nodeRef = useRef(null);
  return (
    <CSSTransition {...transitionProps} nodeRef={nodeRef}>
      <TableRow
        ref={nodeRef}
        sx={{
          transition: "background-color 0.15s",
          "&:hover": { backgroundColor: "rgba(128,0,0,0.03)" },
        }}
      >
        {children}
      </TableRow>
    </CSSTransition>
  );
};

FadeTableRow.propTypes = {
  children: PropTypes.node,
};

const DEFAULT_SORT_ORDER = { year: "desc", paper: "asc", author: "asc", journal: "asc" };

const RecordTable = (props) => {
  const {
    rows,
    columns,
    defaultOrderBy = "",
    defaultOrder = "desc",
    sortBarOptions,
    advancedSearch,
    hideCount = false,
    loading = false,
  } = props;

  // Scroll to Top of Table
  const tableRef = useRef(null);

  // Pagination Controls
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    window.scrollTo(
      0,
      tableRef.current.getBoundingClientRect().top + window.pageYOffset - 96
    );
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Sorting Controls
  const [order, setOrder] = useState(defaultOrder);
  const [orderBy, setOrderBy] = useState(defaultOrderBy);

  const handleRequestSort = (event, property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleFieldChange = (_, field) => {
    if (!field) return;
    setOrderBy(field);
    if (field !== orderBy) setOrder(DEFAULT_SORT_ORDER[field] || "asc");
  };

  const handleDirectionToggle = () => {
    setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  // Search/Filter Controls
  const [filtered, setFiltered] = useState(rows);

  useEffect(() => {
    setFiltered(rows);
    setPage(0);
  }, [rows]);

  useEffect(() => {
    setPage(0);
  }, [filtered]);

  // Sorted Data
  const sortedData =
    orderBy.length > 0
      ? stableSort(filtered, getComparator(order, orderBy, columns), orderBy)
      : filtered;

  // Paginating
  const paginatedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const visibleColumns = columns.filter((col) => !col.hidden);

  return (
    <TableSearchState>
      {/* Keyword search with the Advanced Search toggle on the same row. The
          AdvancedSearch fragment is a toggle plus a full-width Collapse, so
          in this wrapping flex row the panel drops onto its own line. */}
      {advancedSearch ? (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 3, mb: 2.5 }}
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 1.5,
              rowGap: 1,
            }}
          >
            <Box sx={{ flex: "1 1 320px", minWidth: 0 }}>
              <TableSearch columns={columns} setFiltered={setFiltered} rows={rows} />
            </Box>
            {advancedSearch}
          </Box>
        </Paper>
      ) : (
        <TableSearch columns={columns} setFiltered={setFiltered} rows={rows} />
      )}

      {/* Results toolbar: count on the left, sort and page size on the right.
          The count is always visible while loading so there is no jarring
          empty gap before the number arrives. */}
      <Box
        ref={tableRef}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          mb: 1,
        }}
      >
        {(!hideCount || loading) ? (
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, color: "#333" }}
            data-testid="record-count"
          >
            {loading
              ? "… Records Available"
              : filtered.length < rows.length
              ? `Showing ${filtered.length} of ${rows.length} Records Available`
              : `${rows.length} Records Available`}
          </Typography>
        ) : (
          <Box />
        )}
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
          {sortBarOptions && sortBarOptions.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <TextField
                select
                size="small"
                label="Sort by"
                value={orderBy}
                onChange={(e) => handleFieldChange(e, e.target.value)}
                sx={{ minWidth: 140 }}
              >
                {sortBarOptions.map((opt) => (
                  <MenuItem key={opt.field} value={opt.field}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip title={order === "asc" ? "Ascending — click to reverse" : "Descending — click to reverse"}>
                <IconButton
                  size="small"
                  onClick={handleDirectionToggle}
                  aria-label={order === "asc" ? "Sort ascending, click to reverse" : "Sort descending, click to reverse"}
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 0.9 }}
                >
                  {order === "asc" ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          )}
          <RowsPerPageSelector
            count={rows.length}
            rowsPerPage={rowsPerPage}
            onChangeRowsPerPage={handleChangeRowsPerPage}
          />
        </Box>
      </Box>
      <TableContainer
        sx={
          advancedSearch
            ? { border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "#fff" }
            : undefined
        }
      >
        <Table>
          <EnhancedTableHeader
            headers={columns}
            order={order}
            orderBy={orderBy}
            onRequestSort={handleRequestSort}
          />
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} sx={{ border: 0 }}>
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 6 }} data-testid="search-loading">
                    <CircularProgress size={32} />
                    <Typography variant="body1" color="text.secondary">Loading Records…</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
            <TransitionGroup component={null}>
              {paginatedData.map((row, index) => {
                return (
                  <FadeTableRow timeout={100} key={index} classNames="fade">
                    {visibleColumns.map((col, i) => {
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
                  </FadeTableRow>
                );
              })}
            </TransitionGroup>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <EnhancedTableFooter
        rows={rows.length}
        filtered={filtered.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onChangePage={handleChangePage}
      />
    </TableSearchState>
  );
};

RecordTable.propTypes = {
  columns: PropTypes.array.isRequired,
  rows: PropTypes.array.isRequired,
  defaultOrderBy: PropTypes.string,
  defaultOrder: PropTypes.string,
  sortBarOptions: PropTypes.arrayOf(
    PropTypes.shape({ label: PropTypes.string, field: PropTypes.string })
  ),
  advancedSearch: PropTypes.node,
  loading: PropTypes.bool,
  hideCount: PropTypes.bool,
};

export default RecordTable;
