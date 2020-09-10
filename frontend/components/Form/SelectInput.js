import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { Typography, Tooltip, TextField } from "@material-ui/core";

import { Autocomplete } from "@material-ui/lab";

import { useField } from "formik";

const SelectInput = (props) => {
  const { id, placeholder, helperText, options, freeSolo, name } = props;

  const [field, meta] = useField(props);
  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);

  return (
    <Fragment>
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
        <Autocomplete
          name={name}
          id={id}
          options={options}
          freeSolo={freeSolo}
          getOptionLabel={(option) => option.value}
          renderOption={(option) => option.label}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              error={meta.touched && meta.error && !focused}
              helperText={
                meta.touched && meta.error && !focused ? meta.error : ""
              }
              placeholder={placeholder}
            />
          )}
          blurOnSelect
          fullWidth
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            field.onBlur(e);
            setFocused(false);
          }}
          onChange={(e, obj) => {
            if (obj) {
              field.onChange({
                target: {
                  name: name,
                  value: obj.value,
                },
              });
            }
          }}
        />
      </Tooltip>
    </Fragment>
  );
};

SelectInput.defaultProps = {
  helperText: "",
  required: false,
  freeSolo: false,
};

SelectInput.propTypes = {
  name: PropTypes.string.isRequired,
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  helperText: PropTypes.string,
  options: PropTypes.array.isRequired,
  freeSolo: PropTypes.bool,
};

export default SelectInput;
