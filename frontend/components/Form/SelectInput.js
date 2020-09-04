import { useState } from "react";
import PropTypes from "prop-types";

import { TextField, MenuItem, Typography, Tooltip } from "@material-ui/core";

import { useField } from "formik";

const SelectInput = (props) => {
  const { id, placeholder, type, helperText, name, options } = props;

  const [field, meta] = useField(props);
  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);

  return (
    <Tooltip
      title={
        helperText ? (
          <Typography variant="subtitle2">{helperText}</Typography>
        ) : (
          ""
        )
      }
      placement="top"
      arrow
      open={focused || hovering}
    >
      <TextField
        name={name}
        id={id}
        fullWidth
        variant="outlined"
        placeholder={placeholder}
        type={type}
        {...field}
        error={meta.touched && meta.error && !focused}
        helperText={meta.touched && meta.error && !focused ? meta.error : ""}
        InputProps={{
          onFocus: () => setFocused(true),
          onBlur: (e) => {
            field.onBlur(e);
            setFocused(false);
          },
          onMouseEnter: () => setHovering(true),
          onMouseLeave: () => setHovering(false),
        }}
        select
      >
        {options.map((options) => {
          return (
            <MenuItem key={options.value} value={options.value}>
              {options.label}
            </MenuItem>
          );
        })}
      </TextField>
    </Tooltip>
  );
};

SelectInput.defaultProps = {
  type: "text",
  helperText: "",
  required: false,
};

SelectInput.propTypes = {
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  helperText: PropTypes.string,
  options: PropTypes.array.isRequired,
};

export default SelectInput;
