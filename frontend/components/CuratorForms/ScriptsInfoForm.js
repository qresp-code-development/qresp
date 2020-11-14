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

const ScriptsInfoForm = () => {
  const { scripts, add, edit } = useContext(CuratorContext);

  const { scriptsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

  const { def, open } = scriptsHelper;

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
    if (def && scripts.find((el) => el.id == def.id)) {
      edit("script", { ...def, ...values, extraFields: extraFields });
    } else {
      values["id"] = `s${scripts.length}`;
      add("script", values);
    }
    closeForm("script");
  };

  const openFileSelector = () => {
    setTitle("Choose files/folder containing the script");
    setMultiple(true);
    setSaveMethod((val) => setValue("files", val));
    openSelector();
  };

  const updating = def && scripts.find((el) => el.id == def.id) != undefined;

  return (
    <Fragment>
      <Tooltip
        title={<Typography variant="subtitle2">Add a new script</Typography>}
        arrow
      >
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutline />}
          onClick={() => {
            setDefault("script", null);
            openForm("script");
          }}
        >
          Add a Script
        </RegularStyledButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => closeForm("script")}
        maxWidth="md"
        transitionDuration={150}
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Grid container direction="row" spacing={1} alignItems="center">
            <Grid item xs={11}>
              {!updating ? "Add a new script" : "Update the script"}
            </Grid>
            <Grid item xs={1}>
              <RegularStyledButton
                onClick={() => {
                  closeForm("script");
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
                  id="scriptFiles"
                  placeholder="Enter files for the scripts"
                  name="files"
                  helperText="Enter file name(s) to identify the script. Use the file picker (the file icon above). If you choose a folder, all contents of the folder will be considered a part of the script"
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
                  id="scriptDescription"
                  placeholder="Enter descriptions for script"
                  name="readme"
                  helperText="Enter a summary about the context of the script"
                  label="Description"
                  error={errors.readme}
                  inputRef={register}
                  defaultValue={def && def.readme}
                  required
                />
              </Grid>
              <Grid item>
                <TextInputField
                  id="scriptUrls"
                  placeholder="Enter URLs for the scripts"
                  name="URLs"
                  helperText="Enter link(s)/URLs of the script, if available. (Comma seperated)"
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
                  {updating ? "Update" : "Save"}
                </RegularStyledButton>
              </Grid>
            </Grid>
          </form>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
};

export default ScriptsInfoForm;
