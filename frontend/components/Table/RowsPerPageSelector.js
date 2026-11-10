import PropTypes from "prop-types";

import { TextField, MenuItem } from "@mui/material";

const RowsPerPageSelector = (props) => {
  const { count, rowsPerPage, onChangeRowsPerPage } = props;

  const options = [
    { label: "10", value: 10 },
    { label: "25", value: 25 },
    { label: "100", value: 100 },
    { label: "All", value: count },
  ];

  return (
    <TextField
      select
      label="Show"
      value={rowsPerPage}
      onChange={onChangeRowsPerPage}
      variant="outlined"
      size="small"
      sx={{ minWidth: 96 }}
    >
      {options.map((option) => (
        <MenuItem value={option.value} key={option.label}>
          {option.label === "All" ? "All" : `${option.label} per page`}
        </MenuItem>
      ))}
    </TextField>
  );
};

RowsPerPageSelector.propTypes = {
  count: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
  onChangeRowsPerPage: PropTypes.func.isRequired,
};

export default RowsPerPageSelector;
