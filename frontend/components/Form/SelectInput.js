import { Fragment, useState, useRef } from "react";
import PropTypes from "prop-types";

import {
  FormHelperText,
  MenuItem,
  Typography,
  Tooltip,
  Select,
} from "@material-ui/core";

import { useField } from "formik";

const SelectInput = (props) => {
  const { id, placeholder, type, helperText, name, options } = props;

  const [field, meta] = useField(props);
  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);

  const el = useRef(null);

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
        <Select
          name={name}
          id={id}
          fullWidth
          variant="outlined"
          {...field}
          error={meta.touched && meta.error && !focused}
          inputProps={{
            onFocus: () => setFocused(true),
            onBlur: (e) => {
              field.onBlur(e);
              setFocused(false);
              setHovering(false);
            },
          }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          displayEmpty
        >
          <MenuItem value="" disabled>
            {placeholder}
          </MenuItem>
          {options.map((options) => {
            return (
              <MenuItem key={options.value} value={options.value}>
                {options.label}
              </MenuItem>
            );
          })}
        </Select>
      </Tooltip>
      <FormHelperText style={{ color: "red" }}>
        {meta.error && meta.error}
      </FormHelperText>
    </Fragment>
  );
};

SelectInput.defaultProps = {
  helperText: "",
  required: false,
};

SelectInput.propTypes = {
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  helperText: PropTypes.string,
  options: PropTypes.array.isRequired,
};

export default SelectInput;
