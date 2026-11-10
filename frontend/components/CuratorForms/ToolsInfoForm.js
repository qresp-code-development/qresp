import { useEffect, useContext, Fragment } from "react";

import {
  Grid,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { AddCircleOutlined, DescriptionOutlined } from "@mui/icons-material";

import { TextInputField, RadioInputField } from "../Form/InputFields";
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
import StyledTooltip from "../tooltip";

import { useForm } from "react-hook-form";
import { useInvalidFieldFocus } from "../../Utils/invalidField";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

const Software = ({ errors, register, unregister, def, openFileSelector }) => {
  useEffect(() => {
    return () => {
      unregister("packageName");
      unregister("version");
      unregister("executableName");
      unregister("patches");
      unregister("description");
    };
  }, [def]);

  return (
    <Fragment>
      <Grid>
        <TextInputField
          id="packageName"
          placeholder="Enter name of the software package"
          name="packageName"
          helperText="Enter name of the package (e.g. WEST)"
          label="Package Name"
          error={errors.packageName}
          register={register}
          defaultValue={def && def.packageName}
        />
      </Grid>
      <Grid>
        <TextInputField
          id="version"
          placeholder="Enter version of the software package"
          name="version"
          helperText="Enter version number (e.g. 3.1.6) of the package"
          label="Version"
          error={errors.version}
          register={register}
          defaultValue={def && def.version}
        />
      </Grid>
      <Grid>
        <TextInputField
          id="executableName"
          placeholder="Enter the name of the executable for the software package"
          name="executableName"
          helperText="e.g. wstat.x"
          label="Executable Name"
          error={errors.executableName}
          register={register}
          defaultValue={def && def.executableName}
        />
      </Grid>
      <Grid>
        <TextInputField
          id="patches"
          placeholder="Select patch files using the picker"
          name="patches"
          helperText="Enter the file name(s) containing the patches of publicly available or versioned software, customized by the authors to generate some of the resources for the paper. Use the file picker to select files"
          label="Patches"
          error={errors.patches}
          register={register}
          defaultValue={def && def.patches && def.patches.join(", ")}
          action={
            <IconButton size="small" onClick={openFileSelector}>
              <DescriptionOutlined color="primary" />
            </IconButton>
          }
        />
      </Grid>
      <Grid>
        <TextInputField
          id="description"
          placeholder="Enter summary of the modifications made to the software package (if any)"
          name="description"
          helperText="Enter summary of the modifications made to the software package (if any)"
          label="Description"
          error={errors.description}
          register={register}
          defaultValue={def && def.description}
        />
      </Grid>
    </Fragment>
  );
};

const Experiment = ({ errors, register, unregister, def }) => {
  useEffect(() => {
    return () => {
      unregister("facilityName");
      unregister("mesurement");
    };
  }, [def]);

  return (
    <Fragment>
      <Grid>
        <TextInputField
          id="facilityName"
          placeholder="Enter name of the facility where the experiment was conducted (e.g. Argonne National Lab)"
          name="facilityName"
          helperText="Enter name of the facility where the experiment was conducted (e.g. Argonne National Lab)"
          label="Facility Name"
          error={errors.facilityName}
          register={register}
          defaultValue={def && def.facilityName}
        />
      </Grid>
      <Grid>
        <TextInputField
          id="measurement"
          placeholder="Enter type of measurement (e.g. soft X-ray photoemission)"
          name="measurement"
          helperText="Enter type of measurement (e.g. soft X-ray photoemission)"
          label="Measurement"
          error={errors.measurement}
          register={register}
          defaultValue={def && def.measurement}
        />
      </Grid>
    </Fragment>
  );
};

// `hideTrigger` hides this form's own "Add" button while keeping the
// dialog it opens. The figure workspace mounts the form for the dialog
// and supplies its own contextual trigger, so showing both would put two
// ways to do one thing side by side.
const ToolsInfoForm = ({ hideTrigger = false }) => {
  const { tools, add, edit } = useContext(CuratorContext);

  const { toolsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

  const { def, open } = toolsHelper;
  // What a NEW record from this form is for. Row-scoped when the form
  // was opened from a resource row's LINK; see ConnectionSection.
  const link = useRowLink("tool", toolsHelper.link);

  const { setSaveMethod, openSelector, setMultiple } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    // Nothing is required to publish: a tool may be saved without its
    // package name or version (software), or facility or measurement
    // (experiment). The type is a choice with a default, not an input.
    kind: Yup.string(),
    facilityName: Yup.string(),
    measurement: Yup.string(),
    packageName: Yup.string(),
    version: Yup.string(),
    executableName: Yup.string(),
    description: Yup.string(),
    urls: Yup.string(),
    patches: Yup.string(),
    extraFields: extraFieldsSchema,
  });

  // RHF v7 only knows values present in defaultValues or touched by the
  // user; visually preselected "Software" radio and prefilled inputs are NOT registered otherwise. This
  // form's useForm outlives the dialog, so it is re-seeded on every open.
  const toolFormDefaults = (tool) => ({
    kind: (tool && tool.kind) || "software",
    packageName: (tool && tool.packageName) || "",
    version: (tool && tool.version) || "",
    executableName: (tool && tool.executableName) || "",
    patches:
      (tool &&
        tool.patches &&
        (Array.isArray(tool.patches)
          ? tool.patches.join(", ")
          : tool.patches)) ||
      "",
    description: (tool && tool.description) || "",
    facilityName: (tool && tool.facilityName) || "",
    measurement: (tool && tool.measurement) || "",
    extraFields: cleanExtraFields(tool && tool.extraFields),
  });

  // Save with a required field empty sends the curator to the first one in
  // FORM order, instead of silently refusing.
  const { formRef, focusFirstInvalid } = useInvalidFieldFocus();


  const {
    register,
    unregister,
    handleSubmit,
    formState: { errors },
    control,
    watch,
    setValue,
    reset,
  } = useForm({
    // focusFirstInvalid below is the ONLY thing that moves focus on a
    // failed Save. react-hook-form focuses its own first errored field
    // AFTER the invalid handler runs, which landed on whichever element
    // it holds a ref for and scrolled it into view its own way, undoing
    // the block: "center" placement.
    shouldFocusError: false,
    resolver: yupResolver(schema),
    defaultValues: toolFormDefaults(def),
  });

  useEffect(() => {
    if (open) reset(toolFormDefaults(def));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, open]);

  const kindWatcher = watch("kind", def == null ? "software" : def.kind);

  const onSubmit = (values) => {
    const extraFields = cleanExtraFields(values.extraFields);
    values.extraFields = extraFields;
    values.kind = values.kind || "software";
    if (values.kind == "software")
      values.patches = String(values.patches || "")
        .split(",")
        .map((el) => el.trim())
        .filter(Boolean);
    if (def && tools.find((el) => el.id == def.id)) {
      edit("tool", { ...def, ...values, extraFields: extraFields });
    } else {
      if (link.rowScoped) {
        // The record and its arrow, in one reducer change -- or neither,
        // with the form left open to say why.
        if (!link.createAndLink(values)) return;
      } else {
        values["id"] = `t${tools.length}`;
        add("tool", values);
      }
    }
    closeForm("tool");
  };

  const openFileSelector = () => {
    setMultiple(true);
    setSaveMethod((val) => setValue("patches", val));
    openSelector();
  };

  const radioOptions = [
    { label: "Software", value: "software" },
    { label: "Experiment", value: "experiment" },
  ];

  return (
    <Fragment>
      {hideTrigger ? null : (
      <StyledTooltip title="Add a new tool" arrow>
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutlined />}
          onClick={() => {
            setDefault("tool", null);
            openForm("tool");
          }}
        >
          Add a Tool
        </RegularStyledButton>
      </StyledTooltip>
      )}
      <Dialog
        open={open}
        onClose={() => {
          setDefault("tool", null);
          closeForm("tool");
        }}
        maxWidth="md"
        transitionDuration={150}
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Grid container direction="row" spacing={1} alignItems="center">
            <Grid size="grow" sx={{ minWidth: 0 }}>
              Add a new tool
            </Grid>
            <Grid size="auto">
              <RegularStyledButton
                onClick={() => {
                  setDefault("tool", null);
                  closeForm("tool");
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
                <RadioInputField
                  id="kind"
                  name="kind"
                  label="Type"
                  helperText="Select Software or Experiment"
                  error={errors.kind}
                  options={radioOptions}
                  row={true}
                  control={control}
                  defVal={def ? def.kind : "software"}
                />
              </Grid>
              {def == null ? (
                kindWatcher == "software" ? (
                  <Software
                    errors={errors}
                    register={register}
                    unregister={unregister}
                    def={def}
                    openFileSelector={openFileSelector}
                  />
                ) : (
                  <Experiment
                    errors={errors}
                    register={register}
                    unregister={unregister}
                    def={def}
                  />
                )
              ) : def.kind == "software" ? (
                <Software
                  errors={errors}
                  register={register}
                  unregister={unregister}
                  def={def}
                  openFileSelector={openFileSelector}
                />
              ) : (
                <Experiment
                  errors={errors}
                  register={register}
                  unregister={unregister}
                  def={def}
                />
              )}
              <Grid>
                <TextInputField
                  id="urls"
                  placeholder="Enter URLs for the tools"
                  name="urls"
                  helperText="Enter link(s) to package's official websites (e.g. https://www.west-code.org) or facility (e.g. https://aps.anl.gov)[comma seperated]"
                  label="URLs"
                  error={errors.urls}
                  register={register}
                  defaultValue={def && def.urls}
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
                <FormConnection control={control} newType="tool" link={link} />
              </Grid>
              <Grid>
                <RegularStyledButton fullWidth type="submit">
                  {def && tools.find((el) => el.id == def.id) != undefined
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

export default ToolsInfoForm;
