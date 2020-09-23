import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { TextField, Typography, Tooltip } from "@material-ui/core";

import { useField } from "formik";

const TextInput = (props) => {
  const { id, placeholder, type, helperText, name, label } = props;

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
          id: id,
        }}
        label={label}
      />
    </Tooltip>
  );
};

TextInput.defaultProps = {
  type: "text",
  helperText: "",
};

TextInput.propTypes = {
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  helperText: PropTypes.string,
  label: PropTypes.string,
};

export default TextInput;
