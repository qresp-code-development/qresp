import { useContext, Fragment } from "react";

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

const DatasetsInfoForm = () => {
  const { datasets, add, edit } = useContext(CuratorContext);

  const { datasetsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

  const { def, open } = datasetsHelper;

  const { setSaveMethod, openSelector, setMultiple, setTitle } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    files: Yup.string().required("Required"),
    readme: Yup.string().required("Required"),
    URLs: Yup.string(),
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
    values.files = values.files.split(",").map((el) => el.trim());
    values.URLs = values.URLs.split(",").map((el) => el.trim());
    if (def && datasets.find((el) => el.id == def.id)) {
      edit("dataset", { ...def, ...values });
    } else {
      values["id"] = `d${datasets.length}`;
      add("dataset", values);
    }
    closeForm("dataset");
  };

  const openFileSelector = () => {
    setTitle("Choose files/folder containing the dataset");
    setMultiple(true);
    setSaveMethod((val) => setValue("files", val));
    openSelector();
  };

  return (
    <Fragment>
      <Tooltip
        title={<Typography variant="subtitle2">Add a new dataset</Typography>}
        arrow
      >
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutline />}
          onClick={() => {
            setDefault("dataset", null);
            openForm("dataset");
          }}
        >
          Add a Dataset
        </RegularStyledButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => closeForm("dataset")}
        maxWidth="md"
        transitionDuration={150}
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Grid container direction="row" spacing={1} alignItems="center">
            <Grid item xs={11}>
              Add a new dataset
            </Grid>
            <Grid item xs={1}>
              <RegularStyledButton
                onClick={() => {
                  closeForm("dataset");
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
                  id="datasetFiles"
                  placeholder="Enter files for the dataset"
                  name="files"
                  helperText="Enter file name(s) to identify the dataset. Use the file picker (the file icon above). If you choose a dataset, all contents of the folder will be considered a part of the dataset"
                  label="Files"
                  error={errors.files}
                  inputRef={register}
                  action={
                    <IconButton size="small" onClick={openFileSelector}>
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                  defaultValue={def && def.files && def.files.join(", ")}
                  required
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="datasetDescription"
                  placeholder="Enter descriptions for dataset"
                  name="readme"
                  helperText="Enter a summary about the context of the dataset"
                  label="Description"
                  error={errors.readme}
                  inputRef={register}
                  defaultValue={def && def.readme}
                  required
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="datasetUrls"
                  placeholder="Enter URLs for the dataset"
                  name="URLs"
                  helperText="Enter link(s)/URLs of the dataset, if available. (Comma seperated)"
                  label="Keywords"
                  error={errors.URLs}
                  inputRef={register}
                  defaultValue={def && def.URLs && def.URLs.join(", ")}
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
                  {def && datasets.find((el) => el.id == def.id) != undefined
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

export default DatasetsInfoForm;
