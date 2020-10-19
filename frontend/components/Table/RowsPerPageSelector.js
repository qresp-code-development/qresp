import PropTypes from "prop-types";

import { TextField, MenuItem, Typography, Box } from "@material-ui/core";

const RowsPerPageSelector = (props) => {
  const { count, rowsPerPage, onChangeRowsPerPage } = props;

  const options = [
    { label: "10", value: 10 },
    { label: "25", value: 25 },
    { label: "100", value: 100 },
    { label: "All", value: count },
  ];

  return (
    <Box m={1} mt={2} display="flex" alignItems="center">
      <Box mr={1}>
        <Typography variant="subtitle2">Show</Typography>
      </Box>
      <TextField
        select
        value={rowsPerPage}
        onChange={onChangeRowsPerPage}
        variant="outlined"
        size="small"
      >
        {options.map((option) => {
          return (
            <MenuItem value={option.value} key={option.value}>
              {option.label}
            </MenuItem>
          );
        })}
      </TextField>
      <Box ml={1}>
        <Typography variant="subtitle2">Records</Typography>
      </Box>
    </Box>
  );
};

RowsPerPageSelector.propTypes = {
  count: PropTypes.number.isRequired,
  rowsPerPage: PropTypes.number.isRequired,
  onChangeRowsPerPage: PropTypes.func.isRequired,
};

export default RowsPerPageSelector;
