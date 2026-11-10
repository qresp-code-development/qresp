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
} from "@mui/material";

import { useController } from "react-hook-form";

// Controlled through react-hook-form's useController: the previous
// register-as-refs wiring left the group value unreadable under RHF v7 with
// MUI v9 (a visually selected radio came back as undefined on submit and
// clicks read back as undefined), so the RadioGroup is now driven by form
// state directly. Callers pass `control` (from useForm) instead of register.
const RadioInput = (props) => {
  const {
    id,
    name,
    helperText = "",
    options,
    row = false,
    control,
    error,
    defVal,
  } = props;
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);

  const { field } = useController({
    name,
    control,
    defaultValue: defVal || "",
  });

  return (
    <Tooltip
      title={<Typography variant="subtitle2">{helperText}</Typography>}
      placement="right"
      arrow
      open={hovering || focused}
    >
      <RadioGroup
        id={id}
        name={field.name}
        // As wide as its options, so the tooltip sits beside them -- but never
        // wider than the column: `max-content` alone kept a row of options
        // on one unbreakable line and widened the whole page on a phone.
        style={{ width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}
        row={row}
        onFocus={() => setFocused(true)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        value={field.value == null ? "" : field.value}
        onChange={(event) => {
          setFocused(false);
          field.onChange(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          field.onBlur(event);
        }}
      >
        {options.map((option) => {
          return (
            <FormControlLabel
              key={option.value}
              value={option.value}
              control={<Radio color="primary" />}
              label={
                <Typography color="secondary">
                  <Box component="span" sx={{ fontWeight: "bold" }}>
                    {option.label}
                  </Box>
                </Typography>
              }
            />
          );
        })}
        {error && (
          <FormHelperText style={{ color: "#f44336" }}>
            {error.message}
          </FormHelperText>
        )}
      </RadioGroup>
    </Tooltip>
  );
};

RadioInput.protoTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  helperText: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  control: PropTypes.object.isRequired,
  row: PropTypes.bool,
  defVal: PropTypes.string,
  error: PropTypes.object,
};

export default RadioInput;
