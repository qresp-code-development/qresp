import { useEffect, useContext, Fragment } from "react";

import {
  Grid,
  Tooltip,
  Typography,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { AddCircleOutlined, DescriptionOutlined } from "@mui/icons-material";

import { TextInputField } from "../Form/InputFields";
import ExtraFieldInput, {
  cleanExtraFields,
  extraFieldsSchema,
} from "../Form/ExtraFieldInput";
import { RegularStyledButton } from "../button";
import {
  FormConnection,
  confirmLabel,
  useRowLink,
} from "./ConnectionSection";

import { useForm } from "react-hook-form";
import { useInvalidFieldFocus } from "../../Utils/invalidField";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

// Comma-separated text -> a clean list. Empty entries are dropped so a
// trailing comma does not store a blank keyword or URL.
const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((el) => el.trim())
    .filter(Boolean);

// `hideTrigger` hides this form's own "Add" button while keeping the
// dialog it opens. The figure workspace mounts the form for the dialog
// and supplies its own contextual trigger, so showing both would put two
// ways to do one thing side by side.
const DatasetsInfoForm = ({ hideTrigger = false }) => {
  const { datasets, add, edit } = useContext(CuratorContext);

  const { datasetsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

  const { def, open } = datasetsHelper;
  // What a NEW record from this form is for. Row-scoped when the form
  // was opened from a resource row's LINK; see ConnectionSection.
  const link = useRowLink("dataset", datasetsHelper.link);

  const { setSaveMethod, openSelector, setMultiple, setTitle } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    // Optional, like everything needed to publish.
    files: Yup.string(),
    // Optional: a curator may publish without describing every resource.
    readme: Yup.string(),
    // Descriptive tags, in their own field. The input that used to sit here
    // was labelled "Keywords" and wrote to URLs, so a curator's keywords were
    // stored as links. URLs is no longer offered on any surface; an existing
    // record keeps whatever it has (see onSubmit).
    keywords: Yup.string(),
    extraFields: extraFieldsSchema,
  });

  // RHF v7 only knows values present in defaultValues or touched by the
  // user; visually prefilled inputs are NOT registered otherwise. This
  // form's useForm outlives the dialog, so it is re-seeded on every open.
  const itemFormDefaults = (item) => ({
    files: (item && item.files && item.files.join(", ")) || "",
    readme: (item && item.readme) || "",
    keywords:
      (item &&
        item.keywords &&
        (Array.isArray(item.keywords)
          ? item.keywords.join(", ")
          : item.keywords)) ||
      "",
    extraFields: cleanExtraFields(item && item.extraFields),
  });

  // Save with a required field empty sends the curator to the first one in
  // FORM order, instead of silently refusing.
  const { formRef, focusFirstInvalid } = useInvalidFieldFocus();


  const { register, handleSubmit, formState: { errors }, control, setValue, reset } = useForm({
    // focusFirstInvalid below is the ONLY thing that moves focus on a
    // failed Save. react-hook-form focuses its own first errored field
    // AFTER the invalid handler runs, which landed on whichever element
    // it holds a ref for and scrolled it into view its own way, undoing
    // the block: "center" placement.
    shouldFocusError: false,
    resolver: yupResolver(schema),
    defaultValues: itemFormDefaults(def),
  });

  useEffect(() => {
    if (open) reset(itemFormDefaults(def));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, open]);

  const onSubmit = (values) => {
    values.files = String(values.files || "")
      .split(",")
      .map((el) => el.trim())
      .filter(Boolean);
    values.keywords = splitList(values.keywords);
    const extraFields = cleanExtraFields(values.extraFields);
    values.extraFields = extraFields;
    if (def && datasets.find((el) => el.id == def.id)) {
      // `...def` first: a legacy URLs list on an existing record is carried
      // through unchanged. It is never read as, or converted into, keywords.
      edit("dataset", { ...def, ...values, extraFields: extraFields });
    } else {
      if (link.rowScoped) {
        // The record and its arrow, in one reducer change -- or neither,
        // with the form left open to say why.
        if (!link.createAndLink(values)) return;
      } else {
        values["id"] = `d${datasets.length}`;
        add("dataset", values);
      }
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
{hideTrigger ? null : (
      <Tooltip
        title={<Typography variant="subtitle2">Add a new dataset</Typography>}
        arrow
      >
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutlined />}
          onClick={() => {
            setDefault("dataset", null);
            openForm("dataset");
          }}
        >
          Add a Dataset
        </RegularStyledButton>
      </Tooltip>
      )}
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
            <Grid size="grow" sx={{ minWidth: 0 }}>
              Add a new dataset
            </Grid>
            <Grid size="auto">
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
          <form
            ref={formRef}
            onSubmit={handleSubmit(onSubmit, focusFirstInvalid)}
          >
            <Grid container direction="column" spacing={1}>
              <Grid>
                <TextInputField
                  id="datasetFiles"
                  placeholder="Enter files for the dataset"
                  name="files"
                  helperText="Enter file name(s) to identify the dataset. Use the file picker (the file icon above). If you choose a dataset, all contents of the folder will be considered a part of the dataset"
                  label="Files"
                  error={errors.files}
                  register={register}
                  action={
                    <IconButton size="small" onClick={openFileSelector}>
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                  defaultValue={def && def.files && def.files.join(", ")}
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="datasetDescription"
                  placeholder="Enter descriptions for dataset"
                  name="readme"
                  helperText="Enter a summary about the context of the dataset"
                  label="Description"
                  error={errors.readme}
                  register={register}
                  defaultValue={def && def.readme}
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="datasetKeywords"
                  placeholder="Enter keywords for the dataset"
                  name="keywords"
                  helperText="Enter keyword(s) describing the dataset, if useful. (Comma seperated)"
                  label="Keywords"
                  error={errors.keywords}
                  register={register}
                  defaultValue={
                    def && def.keywords && def.keywords.join(", ")
                  }
                />
              </Grid>
              <Grid>
                <ExtraFieldInput
                  control={control}
                  register={register}
                  errors={errors && errors.extraFields}
                  defaults={def && def.extraFields}
                />
              </Grid>
              <Grid>
                <FormConnection control={control} newType="dataset" link={link} />
              </Grid>
              <Grid>
                <RegularStyledButton fullWidth type="submit">
                  {def && datasets.find((el) => el.id == def.id) != undefined
                    ? "Update"
                    : confirmLabel(link.intent, "Save")}
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
