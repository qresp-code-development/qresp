import { useState } from "react";

import PropTypes from "prop-types";

import {
  Radio,
  RadioGroup,
  FormControlLabel,
  FormHelperText,
  Tooltip,
  Typography,
  Box,
} from "@material-ui/core";

const RadioInput = (props) => {
  const { name, helperText, options, row, register, error } = props;
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <Tooltip
      title={<Typography variant="subtitle2">{helperText}</Typography>}
      placement="right"
      arrow
      open={hovering || focused}
    >
      <RadioGroup
        name={name}
        style={{ width: "max-content" }}
        row={row}
        onFocus={() => setFocused(true)}
        onBlur={(e) => setFocused(false)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onChange={(e) => setFocused(false)}
      >
        {options.map((option) => {
          return (
            <FormControlLabel
              key={option.value}
              value={option.value}
              control={<Radio color="primary" />}
              inputRef={register}
              label={
                <Typography color="secondary">
                  <Box fontWeight="bold" component="span">
                    {option.label}
                  </Box>
                </Typography>
              }
            />
          );
        })}
        <FormHelperText>{error && error.message}</FormHelperText>
      </RadioGroup>
    </Tooltip>
  );
};

RadioInput.defaultProps = {
  helperText: "",
  row: false,
};

RadioInput.protoTypes = {
  name: PropTypes.string.isRequired,
  helperText: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  register: PropTypes.func.isRequired,
  row: PropTypes.bool,
};

export default RadioInput;
