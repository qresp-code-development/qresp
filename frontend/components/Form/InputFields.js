import { Fragment } from "react";
import PropTypes from "prop-types";
import { FormInputLabel } from "./Util";
import { Grid } from "@material-ui/core";

import TextInput from "./TextInput";

const TextInputField = (props) => {
  const { id, label, required, action, ...rest } = props;
  return (
      <Grid container spacing={0}>
        <Grid
          item
          xs={12}
          container
          direction="row"
          spacing={1}
          alignItems="center"
          alignContent="center"
        >
          <Grid item>
            <FormInputLabel forId={id} label={label} required={required} />
          </Grid>
          <Grid item>{action}</Grid>
        </Grid>
        <Grid item xs={12}>
          <TextInput id={id} {...rest} />
        </Grid>
      </Grid>
  );
};

TextInputField.defaultProps = {
  required: false,
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
  register: PropTypes.func.isRequired,
  error: PropTypes.object,
  required: PropTypes.bool,
  defVal: PropTypes.string,
};

export { TextInputField, NameInputField, SelectInputField, RadioInputField };
