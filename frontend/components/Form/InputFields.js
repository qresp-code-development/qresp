import { Fragment } from "react";
import PropTypes from "prop-types";
import { FormInputLabel, FieldDescription } from "./Util";
import { Grid } from "@mui/material";

import TextInput from "./TextInput";

const TextInputField = (props) => {
  const { id, label, required = false, action, description, ...rest } = props;
  return (
      <Grid container spacing={0}>
        <Grid container direction="row" spacing={1} size={12} sx={{ alignItems: "center" }}>
          <Grid>
            <FormInputLabel forId={id} label={label} required={required} />
          </Grid>
          <Grid>{action}</Grid>
        </Grid>
        {description ? (
          <Grid size={12}>
            <FieldDescription>{description}</FieldDescription>
          </Grid>
        ) : null}
        <Grid size={12}>
          {/* `required` reaches the INPUT as well as the label: the visible
              marker sits on the label, and the input itself carries
              `aria-required` so the rule is announced when focus lands on
              it. One rule, two channels, still one asterisk. */}
          <TextInput id={id} required={required} {...rest} />
        </Grid>
      </Grid>
  );
};

TextInputField.propTypes = {
  label: PropTypes.string.isRequired,
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string,
  helperText: PropTypes.string,
  required: PropTypes.bool,
  action: PropTypes.object,
  description: PropTypes.node,
};

import NameInput from "./NameInput";

const NameInputField = (props) => {
  const { id, label, required, ...rest } = props;
  return (
    <Fragment>
      <FormInputLabel forId={id} label={label} required={required} />
      <NameInput id={id} {...rest} />
    </Fragment>
  );
};

NameInputField.propTypes = {
  label: PropTypes.string.isRequired,
  ids: PropTypes.object.isRequired,
  required: PropTypes.bool,
  names: PropTypes.object,
  id: PropTypes.string.isRequired,
  register: PropTypes.func.isRequired,
  errors: PropTypes.object.isRequired,
};

import SelectInput from "./SelectInput";

const SelectInputField = (props) => {
  const { id, label, required, ...rest } = props;

  return (
    <Fragment>
      <FormInputLabel forId={id} label={label} required={required} />
      <SelectInput id={id} {...rest} />
    </Fragment>
  );
};

SelectInputField.propTypes = {
  id: PropTypes.string.isRequired,
  placeholder: PropTypes.string.isRequired,
  helperText: PropTypes.string,
  options: PropTypes.array.isRequired,
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  error: PropTypes.object,
  name: PropTypes.string.isRequired,
  control: PropTypes.object.isRequired,
};

import RadioInput from "./RadioInput";

const RadioInputField = (props) => {
  const { id, label, required, ...rest } = props;

  return (
    <Fragment>
      <FormInputLabel forId={id} label={label} required={required} />
      <RadioInput id={id} {...rest} />
    </Fragment>
  );
};

RadioInputField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  helperText: PropTypes.string.isRequired,
  control: PropTypes.object.isRequired,
  error: PropTypes.object,
  required: PropTypes.bool,
  defVal: PropTypes.string,
};

export { TextInputField, NameInputField, SelectInputField, RadioInputField };
