import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { TextField, Typography } from "@material-ui/core";

import { Formik, useField } from "formik";

const TextInput = (props) => {
  const { label, id, placeholder, type, helperText, name, required } = props;

  const [field, meta] = useField(props);
  const [focused, setFocused] = useState(false);

  return (
    <Fragment>
      {label ? (
        <Typography variant="h6" color="secondary">
          {label}
          {required ? <span style={{ color: "red" }}> *</span> : null}
        </Typography>
      ) : null}
      <TextField
        name={name}
        id={id}
        fullWidth
        variant="outlined"
        placeholder={placeholder}
        type={type}
        {...field}
        error={meta.touched && meta.error && !focused}
        helperText={
          meta.touched && meta.error && !focused
            ? meta.error
            : focused
            ? helperText
            : ""
        }
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={(e) => {
          field.onBlur(e);
          setFocused(false);
        }}
      />
    </Fragment>
  );
};

TextInput.defaultProps = {
  type: "text",
  helperText: "",
  required: false,
};

TextInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string,
  placeholder: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  helperText: PropTypes.string,
  required: PropTypes.bool,
};

export default TextInput;
