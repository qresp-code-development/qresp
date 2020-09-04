import { useState } from "react";

import PropTypes from "prop-types";

import {
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  FormHelperText,
  Tooltip,
  Typography,
  Box,
} from "@material-ui/core";

import { useField } from "formik";

const RadioInput = (props) => {
  const { label, name, helperText, options } = props;
  const [field, meta] = useField(props);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <Tooltip
      title={<Typography variant="subtitle2">{helperText}</Typography>}
      placement="right"
      arrow
      open={hovering || focused}
    >
      <RadioGroup name={name} {...field} style={{ width: "max-content" }}>
        {options.map((option) => {
          return (
            <FormControlLabel
              value={option.value}
              control={<Radio color="primary" />}
              label={
                <Typography color="secondary">
                  <Box fontWeight="bold">{option.label}</Box>
                </Typography>
              }
            />
          );
        })}
        <FormHelperText>{meta.error && meta.error}</FormHelperText>
      </RadioGroup>
    </Tooltip>
  );
};

RadioInput.defaultProps = {
  label: "",
  helperText: "",
};

RadioInput.protoTypes = {
  label: PropTypes.string,
  name: PropTypes.string.isRequired,
  helperText: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
};

export default RadioInput;
