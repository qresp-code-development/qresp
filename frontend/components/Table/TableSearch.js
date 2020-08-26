import { useState, createContext, useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { TextField, InputAdornment, IconButton, Box } from "@material-ui/core";
import { Search, Close } from "@material-ui/icons";

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
    const regex = new RegExp(query, "gi");
    setFiltered(
      rows.filter((data) => {
        var keep = false;
        for (let index = 0; index < columns.length; index++) {
          const col = columns[index];
          if (col.options.searchable) {
            if (col.options.searchValue) {
              keep =
                keep ||
                col.options.searchValue(data[col.name]).toString().match(regex);
            } else {
              keep =
                keep ||
                col.options.value(data[col.name]).toString().match(regex);
            }
          }
        }
        return keep;
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
    <Box m={1} mt={2}>
      <form noValidate onSubmit={onSubmit}>
        <TextField
          value={query}
          name="query"
          type="text"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search color="primary" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {" "}
                <IconButton size="small" onClick={clearSearch}>
                  <Close color="primary" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          placeholder="Search..."
          // onKeyUp={onChange}
          onChange={onChange}
          size="small"
          variant="outlined"
          fullWidth
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
