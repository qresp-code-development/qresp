import PropTypes from "prop-types";

import { TextField, InputAdornment, IconButton, Box } from "@material-ui/core";
import { Search, Close } from "@material-ui/icons";

const TableSearch = ({ rows, setFiltered, columns }) => {
  const onSubmit = (e) => {
    e.preventDefault();
  };

  const clearSearch = () => {
    setFiltered(rows);
  };

  const onChange = (e) => {
    if (e.target.value.length > 0) {
      const regex = new RegExp(e.target.value, "gi");
      setFiltered(
        rows.filter((data) => {
          for (let index = 0; index < columns.length; index++) {
            const col = columns[index];
            if (col.options.searchable) {
              if (col.options.searchValue)
                return col.options.searchValue(data[col.name]).match(regex);
              return col.options.value(data[col.name]).match(regex);
            }
          }
        })
      );
    } else {
      setFiltered(rows);
    }
  };

  return (
    <Box m={1} mt={2}>
      <form noValidate onSubmit={onSubmit}>
        <TextField
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

export default TableSearch;
