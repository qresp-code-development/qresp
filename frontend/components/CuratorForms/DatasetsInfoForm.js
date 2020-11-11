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

  const onSubmit = (values) => {
    values.files = values.files.split(",").map((el) => el.trim());
    values.URLs = values.URLs.split(",").map((el) => el.trim());
    const extraFields = values.extraFields ? values.extraFields : [];
    if (def && datasets.find((el) => el.id == def.id)) {
      edit("dataset", { ...def, ...values, extraFields: extraFields });
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
                <ExtraFieldInput
                  control={control}
                  register={register}
                  errors={errors && errors.extraFields}
                  defaults={def && def.extraFields}
                />
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
