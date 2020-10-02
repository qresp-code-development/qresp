import { useState, useContext, Fragment } from "react";

import {
  Grid,
  Tooltip,
  Typography,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@material-ui/core";
import {
  AddCircleOutline,
  RemoveCircleOutline,
  DescriptionOutlined,
} from "@material-ui/icons";

import { TextInputField } from "../Form/InputFields";
import TextInput from "../Form/TextInput";
import { FormInputLabel } from "../Form/Util";
import { RegularStyledButton } from "../button";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

const ChartsInfoForm = () => {
  const { charts, addChart, editChart } = useContext(CuratorContext);

  const {
    chartsHelper,
    openChartForm,
    closeChartForm,
    setDefaultChart,
  } = useContext(CuratorHelperContext);

  const { def, open } = chartsHelper;

  const { setSaveMethod, openSelector, setMultiple } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    caption: Yup.string().required("Required"),
    number: Yup.number().required("Required"),
    files: Yup.string(),
    imageFile: Yup.string().required("Required"),
    notebookFile: Yup.string(),
    properties: Yup.string().required("Required"),
    extraFields: Yup.array().of(
      Yup.object().shape({
        label: Yup.string().required("Required"),
        value: Yup.string().required("Required"),
      })
    ),
  });

  const { register, handleSubmit, errors, control, setValue } = useForm({
    resolver: yupResolver(schema),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
  });

  const onSubmit = (values) => {
    values.properties = values.properties.split(",").map((el) => el.trim());
    values.files = values.files.split(",").map((el) => el.trim());
    if (def && charts.find((el) => el.id == def.id)) {
      editChart({ ...def, ...values });
    } else {
      values["id"] = `c${charts.length}`;
      addChart(values);
    }
    closeChartForm();
  };

  const onOpenFileSelector = (type) => {
    if (type == "imageFile") {
      setMultiple(false);
      setSaveMethod((val) => setValue("imageFile", val));
      openSelector();
    } else if (type == "notebookFile") {
      setMultiple(false);
      setSaveMethod((val) => setValue("notebookFile", val));
      openSelector();
    } else {
      setMultiple(true);
      setSaveMethod((val) => setValue("files", val));
      openSelector();
    }

    openSelector();
  };

  return (
    <Fragment>
      <Tooltip
        title={<Typography variant="subtitle2">Add a new chart</Typography>}
        arrow
      >
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutline />}
          onClick={() => {
            setDefaultChart(null);
            openChartForm();
          }}
        >
          Add a Chart
        </RegularStyledButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => closeChartForm()}
        maxWidth="md"
        transitionDuration={150}
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Grid container direction="row" spacing={1} alignItems="center">
            <Grid item xs={11}>
              Add a new chart
            </Grid>
            <Grid item xs={1}>
              <RegularStyledButton
                onClick={() => {
                  closeChartForm();
                }}
                fullWidth
              >
                Cancel
              </RegularStyledButton>
            </Grid>
          </Grid>
        </DialogTitle>
        <DialogContent dividers>
          <form onSubmit={handleSubmit(onSubmit)}>
            <Grid container direction="column" spacing={1}>
              <Grid item>
                <TextInputField
                  id="caption"
                  placeholder="Enter chart caption"
                  name="caption"
                  helperText="Enter chart caption"
                  label="Caption"
                  error={errors.caption}
                  inputRef={register}
                  defaultValue={def && def.caption}
                  required
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="number"
                  placeholder="Enter chart number"
                  name="number"
                  helperText="Enter chart number"
                  label="Number"
                  error={errors.number}
                  inputRef={register}
                  defaultValue={(def && def.number) || charts.length}
                  required
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="files"
                  placeholder="Enter file names used to contruct the chart"
                  name="files"
                  helperText="Enter file name(s) containing the data displayed in the chart (e.g. a file in CSV format). Use the file picker button to pick files"
                  label="Files"
                  error={errors.files}
                  inputRef={register}
                  action={
                    <IconButton
                      size="small"
                      onClick={() => onOpenFileSelector("files")}
                    >
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                  defaultValue={def && def.files && def.files.join(", ")}
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="imageFile"
                  placeholder="Enter chart image file name"
                  name="imageFile"
                  helperText="Enter file name containing the snapshot of the chart. Use the file picker button to pick files. Formats Allowed: jpeg, jpg, png, gif"
                  label="Image File"
                  error={errors.imageFile}
                  inputRef={register}
                  action={
                    <IconButton
                      size="small"
                      onClick={() => onOpenFileSelector("imageFile")}
                    >
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                  defaultValue={def && def.imageFile}
                  required
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="notebookFile"
                  placeholder="Enter notebook file"
                  name="notebookFile"
                  helperText="Enter file name of the notebook used to generate the chart. Use the file picker button to pick files. Formats Allowed: ipynb"
                  label="Notebook File"
                  error={errors.notebookFile}
                  action={
                    <IconButton
                      size="small"
                      onClick={() => onOpenFileSelector("notebookFile")}
                    >
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                  inputRef={register}
                  defaultValue={def && def.notebookFile}
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="chartproperties"
                  placeholder="Enter properties"
                  name="properties"
                  helperText="Enter keyword(s) for the content displayed in the chart. e.g. potential energy surface, band gap. (Comma separated values)"
                  label="Keywords"
                  error={errors.properties}
                  inputRef={register}
                  defaultValue={
                    def && def.properties && def.properties.join(", ")
                  }
                  required
                />
              </Grid>
              <Grid item>
                <Grid
                  container
                  justify="flex-start"
                  alignItems="center"
                  spacing={2}
                >
                  <Grid item>
                    <FormInputLabel label="Extra Fields" forId="pis" />
                  </Grid>
                  <Grid item>
                    <Tooltip
                      title={
                        <Typography variant="subtitle2">
                          Add a new custom field
                        </Typography>
                      }
                      placement="right"
                      arrow
                    >
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
                    </Tooltip>
                  </Grid>
                </Grid>
                {fields.map((field, index) => (
                  <Grid
                    container
                    spacing={4}
                    key={field.id}
                    alignItems="center"
                  >
                    <Grid item xs={12} sm={5}>
                      <TextInput
                        InputLabelProps={{ shrink: true }}
                        id={`customLabel${index}`}
                        placeholder="Enter custom label"
                        name={`extraFields[${index}].label`}
                        label="Field Label"
                        helperText="Enter a custom label for a field"
                        error={
                          errors.extraFields && errors.extraFields[index].label
                        }
                        inputRef={register}
                        defaultValue={
                          def && def.extraFields && def.extraFields[index].label
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
                        error={
                          errors.extraFields && errors.extraFields[index].value
                        }
                        inputRef={register}
                        defaultValue={
                          def && def.extraFields && def.extraFields[index].value
                        }
                      />
                    </Grid>
                    <Grid item xs={1}>
                      <Tooltip
                        title={
                          <Typography variant="subtitle2">
                            Remove the custom field
                          </Typography>
                        }
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
                      </Tooltip>
                    </Grid>
                  </Grid>
                ))}
              </Grid>
              <Grid item>
                <RegularStyledButton fullWidth type="submit">
                  {chartsHelper.default &&
                  chartsHelper.default.id < charts.length
                    ? "Update"
                    : "Save"}
                </RegularStyledButton>
              </Grid>
            </Grid>
          </form>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
};

export default ChartsInfoForm;
