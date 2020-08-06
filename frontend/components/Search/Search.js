import { useState } from "react";
import PropTypes from "prop-types";

import { TextField, InputAdornment, IconButton, Box } from "@material-ui/core";
import { Search, Close } from "@material-ui/icons";

const TableSearch = ({}) => {
  const onSubmit = (e) => {
    e.preventDefault();
    if (query.length > 0) {
      console.log(query);
    }
  };

  const [query, setQuery] = useState("");

  const onChange = (e) => {
    setQuery(e.target.value);
  };

  return (
    <Box m={1} mt={2}>
      <form noValidate onSubmit={onSubmit}>
        <TextField
          id="search"
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

export default TableSearch;
