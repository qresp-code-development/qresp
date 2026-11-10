import { Fragment, useEffect } from "react";
import PropTypes from "prop-types";

import { Grid, IconButton } from "@mui/material";
import { AddCircleOutlined, RemoveCircleOutlined } from "@mui/icons-material";

import { useFieldArray } from "react-hook-form";
import * as Yup from "yup";

import StyledTooltip from "../tooltip";

import TextInput from "./TextInput";

import { FormInputLabel } from "./Util";

// Stored records routinely carry placeholder extra-field rows — legacy
// curators saved `[{extrakey: "", extravalue: ""}]` (note: not even the
// label/value keys this form uses). Drop every row without a usable
// label AND value, both when seeding the form from an existing item and
// before the values go into the update payload. Rows the user filled only
// half-way survive so validation can point at them.
const cleanExtraFields = (list) =>
  (list || []).filter((field) => {
    if (!field) return false;
    const label = (field.label || "").trim();
    const value = (field.value || "").trim();
    return label.length > 0 || value.length > 0;
  });

// Shared yup schema for the extraFields array: an untouched empty row is
// allowed (it is filtered out on submit); a half-filled row is an error.
const extraFieldsSchema = Yup.array().of(
  Yup.object().test(
    "complete-extra-field",
    "Both label and value are required for a custom field",
    (field) => {
      const label = ((field && field.label) || "").trim();
      const value = ((field && field.value) || "").trim();
      if (!label && !value) return true;
      return label.length > 0 && value.length > 0;
    }
  )
);

const ExtraFieldInput = ({ control, register, errors, defaults }) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
  });

  useEffect(() => {
    // Seed only REAL saved extra fields; no phantom empty row on edit.
    const seeded = cleanExtraFields(defaults);
    if (seeded.length > 0 && seeded.length > fields.length) {
      append(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Fragment>
      <Grid container spacing={2} sx={{ alignItems: "center", justifyContent: "flex-start" }}>
        <Grid>
          <FormInputLabel label="Extra Fields" forId="pis" />
        </Grid>
        <Grid>
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
              <AddCircleOutlined color="primary" />
            </IconButton>
          </StyledTooltip>
        </Grid>
      </Grid>
      {fields.map((field, index) => (
        <Grid container spacing={4} key={field.id} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextInput
              slotProps={{ inputLabel: { shrink: true } }}
              id={`customLabel${index}`}
              placeholder="Enter custom label"
              name={`extraFields.${index}.label`}
              label="Field Label"
              helperText="Enter a custom label for a field"
              error={errors && errors[index] && errors[index].label}
              register={register}
              defaultValue={field.label || ""}
            />
          </Grid>
          <Grid size={{ xs: 11, sm: 6 }}>
            <TextInput
              slotProps={{ inputLabel: { shrink: true } }}
              id={`customValue${index}`}
              placeholder="Enter value"
              name={`extraFields.${index}.value`}
              label="Field value"
              helperText="Enter a value for the custom field label"
              error={errors && errors[index] && errors[index].value}
              register={register}
              defaultValue={field.value || ""}
            />
          </Grid>
          <Grid size={1}>
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
                <RemoveCircleOutlined color="primary" />
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
export { cleanExtraFields, extraFieldsSchema };
