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
import { AddCircleOutline, DescriptionOutlined } from "@material-ui/icons";

import { TextInputField } from "../Form/InputFields";
import ExtraFieldInput from "../Form/ExtraFieldInput";
import { RegularStyledButton } from "../button";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

const ChartsInfoForm = () => {
  const { charts, add, edit } = useContext(CuratorContext);

  const { chartsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

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

  const onSubmit = (values) => {
    values.properties = values.properties.split(",").map((el) => el.trim());
    values.files = values.files.split(",").map((el) => el.trim());
    const extraFields = values.extraFields ? values.extraFields : [];
    if (def && charts.find((el) => el.id == def.id)) {
      edit("chart", { ...def, ...values, extraFields: extraFields });
    } else {
      values["id"] = `c${charts.length}`;
      add("chart", values);
    }
    closeForm("chart");
  };

  const onOpenFileSelector = (type) => {
    if (type == "imageFile") {
      setMultiple(false);
      setSaveMethod((val) => setValue("imageFile", val));
    } else if (type == "notebookFile") {
      setMultiple(false);
      setSaveMethod((val) => setValue("notebookFile", val));
    } else {
      setMultiple(true);
      setSaveMethod((val) => setValue("files", val));
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
            setDefault("chart", null);
            openForm("chart");
          }}
        >
          Add a Chart
        </RegularStyledButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => closeForm("chart")}
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
                  closeForm("chart");
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
                <ExtraFieldInput
                  control={control}
                  register={register}
                  errors={errors && errors.extraFields}
                  defaults={def && def.extraFields}
                />
              </Grid>
              <Grid item>
                <RegularStyledButton fullWidth type="submit">
                  {def && charts.find((el) => el.id == def.id) != undefined
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
