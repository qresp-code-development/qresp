import { Fragment, useState } from "react";
import PropTypes from "prop-types";

import { TextField, Typography, Tooltip } from "@material-ui/core";

const TextInput = (props) => {
  const { helperText, id, label, error, ...rest } = props;

  // const [field, meta] = useField(props);
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
        {...rest}
        fullWidth
        variant="outlined"
        error={error && !focused}
        helperText={error && !focused ? error.message : ""}
        InputProps={{
          onFocus: () => setFocused(true),
          onBlur: (e) => setFocused(false),
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
