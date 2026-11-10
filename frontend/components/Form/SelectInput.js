import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { Typography, Tooltip, TextField, MenuItem } from "@mui/material";
import { Controller } from "react-hook-form";

const SelectInput = (props) => {
  const { id, placeholder, helperText = "", options, error, name, control } = props;

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
            render={({ field }) => (
              // react-hook-form v7: the `as` prop is gone; render receives the
              // controlled field ({ value, onChange, onBlur, ref, name }).
              <TextField
                id={id}
                select
                variant="outlined"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                inputRef={field.ref}
                InputProps={{
                  onFocus: () => setFocused(true),
                  onBlur: (e) => {
                    setFocused(false);
                    field.onBlur(e);
                  },
                  onMouseEnter: () => setHovering(true),
                  onMouseLeave: () => setHovering(false),
                }}
                placeholder={placeholder}
                // Kept while focused, like TextInput: the field a failed Save
                // jumps to has to keep saying why.
                error={Boolean(error)}
                helperText={error ? error.message : ""}
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
            )}
          />
        </div>
      </Tooltip>
    </Fragment>
  );
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
