import { useState, createContext, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { TextField, InputAdornment, IconButton, Box } from "@mui/material";
import { Search, Close } from "@mui/icons-material";

const TableSearchContext = createContext();

const TableSearchState = ({ children }) => {
  const [query, setQuery] = useState("");
  return (
    <TableSearchContext.Provider value={{ query, setQuery }}>
      {children}
    </TableSearchContext.Provider>
  );
};

const TableSearch = ({ rows, setFiltered, columns }) => {
  const { query, setQuery } = useContext(TableSearchContext);
  const [time, setTime] = useState();

  const onSubmit = (e) => {
    e.preventDefault();
  };

  const clearSearch = () => {
    setQuery("");
    setFiltered(rows);
  };

  const onChange = (e) => {
    setQuery(e.target.value);
  };

  const filterRows = () => {
    // Split into individual terms; all must match (any order, any field).
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      setFiltered(rows);
      return;
    }
    // Escape special regex chars so a literal "C++" doesn't break the pattern.
    const regexes = terms.map(
      (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );
    setFiltered(
      rows.filter((data) => {
        // Combine all searchable fields into one string for this row.
        let text = "";
        for (const col of columns) {
          if (!col.options.searchable) continue;
          const val = col.options.searchValue
            ? col.options.searchValue(data[col.name])
            : col.options.value(data[col.name]);
          text += " " + String(val ?? "");
        }
        return regexes.every((re) => re.test(text));
      })
    );
  };

  useEffect(() => {
    if (time) clearTimeout(time);
    setTime(
      setTimeout(function () {
        if (query.length > 0) {
          filterRows();
        } else {
          setFiltered(rows);
        }
      }, 350)
    );
  }, [query]);

  return (
    <Box sx={{ my: 1 }}>
      <form noValidate onSubmit={onSubmit}>
        <TextField
          value={query}
          name="query"
          type="text"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search color="primary" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment
                  position="end"
                  sx={{ visibility: query.length > 0 ? "visible" : "hidden" }}
                >
                  <IconButton size="small" onClick={clearSearch}>
                    <Close sx={{ color: "text.secondary", fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          placeholder="Search by keywords — title, author, tags…"
          onChange={onChange}
          size="small"
          variant="outlined"
          fullWidth
          inputProps={{ "aria-label": "Search records by keyword" }}
          sx={{
            "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "#fff", minHeight: 44 },
          }}
        />
      </form>
    </Box>
  );
};

TableSearch.propTypes = {
  columns: PropTypes.array.isRequired,
  setFiltered: PropTypes.func.isRequired,
  rows: PropTypes.array.isRequired,
};

export { TableSearchContext, TableSearchState };
export default TableSearch;
