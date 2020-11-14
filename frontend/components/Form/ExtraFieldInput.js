import { Fragment, useEffect } from "react";
import PropTypes from "prop-types";

import { Grid, IconButton } from "@material-ui/core";
import { AddCircleOutline, RemoveCircleOutline } from "@material-ui/icons";

import { useFieldArray } from "react-hook-form";

import StyledTooltip from "../tooltip";

import TextInput from "./TextInput";

import { FormInputLabel } from "./Util";

const ExtraFieldInput = ({ control, register, errors, defaults }) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
  });

  useEffect(() => {
    if (defaults && defaults.length > 0 && defaults.length > fields.length) {
      append(defaults);
    }
  }, []);

  return (
    <Fragment>
      <Grid container justify="flex-start" alignItems="center" spacing={2}>
        <Grid item>
          <FormInputLabel label="Extra Fields" forId="pis" />
        </Grid>
        <Grid item>
          <StyledTooltip title="Add a new custom field" placement="right" arrow>
            <IconButton
              onClick={() =>
                append({
                  label: "",
                  value: "",
                })
              }
              style={{ padding: 0 }}
            >
              <AddCircleOutline color="primary" />
            </IconButton>
          </StyledTooltip>
        </Grid>
      </Grid>
      {fields.map((field, index) => (
        <Grid container spacing={4} key={field.id} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextInput
              InputLabelProps={{ shrink: true }}
              id={`customLabel${index}`}
              placeholder="Enter custom label"
              name={`extraFields[${index}].label`}
              label="Field Label"
              helperText="Enter a custom label for a field"
              error={errors && errors[index] && errors[index].label}
              inputRef={register()}
              defaultValue={
                (defaults && defaults[index] && defaults[index].label) || ""
              }
            />
          </Grid>
          <Grid item xs={11} sm={6}>
            <TextInput
              InputLabelProps={{ shrink: true }}
              id={`customValue${index}`}
              placeholder="Enter value"
              name={`extraFields[${index}].value`}
              label="Field value"
              helperText="Enter a value for the custom field label"
              error={errors && errors[index] && errors[index].label}
              inputRef={register()}
              defaultValue={
                (defaults && defaults[index] && defaults[index].value) || ""
              }
            />
          </Grid>
          <Grid item xs={1}>
            <StyledTooltip
              title="Remove the custom field"
              placement="top"
              arrow
            >
              <IconButton
                size="small"
                onClick={() => {
                  if (fields.length > 0) {
                    remove(index);
                  }
                }}
              >
                <RemoveCircleOutline color="primary" />
              </IconButton>
            </StyledTooltip>
          </Grid>
        </Grid>
      ))}
    </Fragment>
  );
};

ExtraFieldInput.propTypes = {
  control: PropTypes.object.isRequired,
  register: PropTypes.func.isRequired,
  errors: PropTypes.array,
  defaults: PropTypes.array,
};

export default ExtraFieldInput;
