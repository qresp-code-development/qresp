import PropTypes from "prop-types";

import { TextField, InputAdornment, IconButton, Box } from "@material-ui/core";
import { Search, Close } from "@material-ui/icons";

const searchFilter = (columns, query) => {
  return (data) => {
    if (query.length < 1) return data;
    const regex = new RegExp(query, "gi");
    for (let index = 0; index < columns.length; index++) {
      const element = columns[index];
      if (element.options.searchable) {
        return element.options.value(data[element.name]).match(regex);
      }
    }
  };
};

const TableSearch = ({ query, setQuery }) => {
  const onSubmit = (e) => {
    e.preventDefault();
    if (query.length > 0) {
      console.log(query);
    }
  };

  const onChange = (e) => {
    setQuery(e.target.value);
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
                <IconButton size="small" onClick={() => setQuery("")}>
                  <Close color="primary" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          placeholder="Search..."
          value={query}
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
  query: PropTypes.string.isRequired,
  setQuery: PropTypes.func.isRequired,
};

export default TableSearch;
export { searchFilter };
