import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { Typography, Tooltip, TextField, MenuItem } from "@material-ui/core";
import { Controller } from "react-hook-form";

const SelectInput = (props) => {
  const { id, placeholder, helperText, options, error, name, control } = props;

  const [focused, setFocused] = useState(false);
  const [hovering, setHovering] = useState(false);

  return (
    <Fragment>
      <Tooltip
        title={
          helperText && (
            <Typography variant="subtitle2">{helperText}</Typography>
          )
        }
        placement="top"
        arrow
        open={focused || hovering}
        ref={null}
      >
        <div>
          <Controller
            control={control}
            name={name}
            defaultValue=""
            as={
              <TextField
                id={id}
                select
                variant="outlined"
                name={name}
                // onFocus={() => setFocused(true)}
                // onBlur={() => setFocused(false)}
                // onMouseEnter={() => setHovering(true)}
                // onMouseLeave={() => setHovering(false)}
                InputProps={{
                  onFocus: () => setFocused(true),
                  onBlur: (e) => setFocused(false),
                  onMouseEnter: () => setHovering(true),
                  onMouseLeave: () => setHovering(false),
                }}
                placeholder={placeholder}
                error={error && !focused}
                helperText={error && !focused ? error.message : ""}
                fullWidth
              >
                <MenuItem value="">Select a value ...</MenuItem>
                {options.map((option) => (
                  <MenuItem
                    key={option.value}
                    value={option.value}
                    onMouseLeave={() => setHovering(false)}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            }
          />
        </div>
      </Tooltip>
    </Fragment>
  );
};

SelectInput.defaultProps = {
  helperText: "",
};

SelectInput.propTypes = {
  name: PropTypes.string.isRequired,
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  helperText: PropTypes.string,
  options: PropTypes.array.isRequired,
  control: PropTypes.object.isRequired,
};

export default SelectInput;
