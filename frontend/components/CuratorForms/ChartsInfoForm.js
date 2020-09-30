import { useState, useContext } from "react";

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
import Drawer from "../drawer";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import { RegularStyledButton } from "../button";

const ChartsInfoForm = () => {
  const { charts, setCharts } = useContext(CuratorContext);
  const { setSaveMethod, openSelector, setMultiple } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    caption: Yup.string().required("Required"),
    number: Yup.number().required("Required"),
    files: Yup.string(),
    imageFile: Yup.string().required("Required"),
    notebookFile: Yup.string(),
    keywords: Yup.string().required("Required"),
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
    console.log(values);
    // setCharts(values);
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

  const [open, setOpen] = useState(false);

  return (
    <Drawer heading="Add info about your paper" defaultOpen={true}>
      <Tooltip
        title={<Typography variant="subtitle2">Add a new chart</Typography>}
        arrow
      >
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutline />}
          onClick={() => setOpen(true)}
        >
          Add a Chart
        </RegularStyledButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Grid container direction="row" spacing={1} alignItems="center">
            <Grid item xs={11}>
              Add a new chart
            </Grid>
            <Grid item xs={1}>
              <RegularStyledButton
                onClick={() => {
                  setOpen(false);
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
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="chartKeywords"
                  placeholder="Enter keywords"
                  name="keywords"
                  helperText="Enter keyword(s) for the content displayed in the chart. e.g. potential energy surface, band gap."
                  label="Keywords"
                  error={errors.keywords}
                  inputRef={register}
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
                  Save
                </RegularStyledButton>
              </Grid>
            </Grid>
          </form>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
};

export default ChartsInfoForm;
