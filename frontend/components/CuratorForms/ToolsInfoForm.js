import { useEffect, useContext, Fragment } from "react";

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

import { TextInputField, RadioInputField } from "../Form/InputFields";
import TextInput from "../Form/TextInput";
import { FormInputLabel } from "../Form/Util";
import { RegularStyledButton } from "../button";
import StyledTooltip from "../tooltip";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

const Software = ({ errors, register, unregister, def, openFileSelector }) => {
  useEffect(() => {
    return () => {
      unregister({ name: "packageName" });
      unregister({ name: "version" });
      unregister({ name: "executableName" });
      unregister({ name: "patches" });
      unregister({ name: "description" });
    };
  }, [def]);

  return (
    <Fragment>
      <Grid item>
        <TextInputField
          id="packageName"
          placeholder="Enter name of the software package"
          name="packageName"
          helperText="Enter name of the package (e.g. WEST)"
          label="Package Name"
          error={errors.packageName}
          inputRef={register}
          defaultValue={def && def.packageName}
          required
        />
      </Grid>
      <Grid item>
        <TextInputField
          id="version"
          placeholder="Enter version of the software package"
          name="version"
          helperText="Enter version number (e.g. 3.1.6) of the package"
          label="Version"
          error={errors.version}
          inputRef={register}
          defaultValue={def && def.version}
          required
        />
      </Grid>
      <Grid item>
        <TextInputField
          id="executableName"
          placeholder="Enter the name of the executable for the software package"
          name="executableName"
          helperText="e.g. wstat.x"
          label="Executable Name"
          error={errors.executableName}
          inputRef={register}
          defaultValue={def && def.executableName}
        />
      </Grid>
      <Grid item>
        <TextInputField
          id="patches"
          placeholder="Select patch files using the picker"
          name="patches"
          helperText="Enter the file name(s) containing the patches of puublicly available or versioned software, customized by the authors to generate some of the resources for the paper. Use the file picker to select files"
          label="Patches"
          error={errors.patches}
          inputRef={register}
          defaultValue={def && def.patches && def.patches.join(", ")}
          action={
            <IconButton size="small" onClick={openFileSelector}>
              <DescriptionOutlined color="primary" />
            </IconButton>
          }
        />
      </Grid>
      <Grid item>
        <TextInputField
          id="description"
          placeholder="Enter summary of the modifications made to the software package (if any)"
          name="description"
          helperText="Enter summary of the modifications made to the software package (if any)"
          label="Description"
          error={errors.description}
          inputRef={register}
          defaultValue={def && def.description}
        />
      </Grid>
    </Fragment>
  );
};

const Experiment = ({ errors, register, unregister, def }) => {
  useEffect(() => {
    return () => {
      unregister({ name: "facilityName" });
      unregister({ name: "mesurement" });
    };
  }, [def]);

  return (
    <Fragment>
      <Grid item>
        <TextInputField
          id="facilityName"
          placeholder="Enter name of the facility where the experiment was conducted (e.g. Argonne National Lab)"
          name="facilityName"
          helperText="Enter name of the facility where the experiment was conducted (e.g. Argonne National Lab)"
          label="Facility Name"
          error={errors.facilityName}
          inputRef={register}
          defaultValue={def && def.facilityName}
          required
        />
      </Grid>
      <Grid item>
        <TextInputField
          id="measurement"
          placeholder="Enter type of measurement (e.g. soft X-ray photoemission)"
          name="measurement"
          helperText="Enter type of measurement (e.g. soft X-ray photoemission)"
          label="Measurement"
          error={errors.measurement}
          inputRef={register}
          defaultValue={def && def.measurement}
          required
        />
      </Grid>
    </Fragment>
  );
};

const ToolsInfoForm = () => {
  const { tools, add, edit } = useContext(CuratorContext);

  const { toolsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

  const { def, open } = toolsHelper;

  const { setSaveMethod, openSelector, setMultiple } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    kind: Yup.string().required("Required"),
    facilityName: Yup.string().when("kind", {
      is: "experiment",
      then: Yup.string().required("Required"),
    }),
    measurement: Yup.string().when("kind", {
      is: "experiment",
      then: Yup.string().required("Required"),
    }),
    packageName: Yup.string().when("kind", {
      is: "software",
      then: Yup.string().required("Required"),
    }),
    version: Yup.string().when("kind", {
      is: "software",
      then: Yup.string().required("Required"),
    }),
    executableName: Yup.string().when("kind", {
      is: "software",
      then: Yup.string(),
    }),
    patches: Yup.string().when("kind", {
      is: "software",
      then: Yup.string(),
    }),
    description: Yup.string().when("kind", {
      is: "software",
      then: Yup.string(),
    }),
    urls: Yup.string(),
    patches: Yup.string(),
    extraFields: Yup.array().of(
      Yup.object().shape({
        label: Yup.string().required("Required"),
        value: Yup.string().required("Required"),
      })
    ),
  });

  const {
    register,
    unregister,
    handleSubmit,
    errors,
    control,
    watch,
    setValue,
  } = useForm({
    resolver: yupResolver(schema),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "extraFields",
  });

  const kindWatcher = watch("kind", def == null ? "software" : def.kind);

  const onSubmit = (values) => {
    if (values.kind == "software")
      values.patches = values.patches.split(",").map((el) => el.trim());
    if (def && tools.find((el) => el.id == def.id)) {
      edit("tool", { ...def, ...values });
    } else {
      values["id"] = `t${tools.length}`;
      add("tool", values);
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
      <StyledTooltip title="Add a new tool" arrow>
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutline />}
          onClick={() => {
            setDefault("tool", null);
            openForm("tool");
          }}
        >
          Add a Tool
        </RegularStyledButton>
      </StyledTooltip>
      <Dialog
        open={open}
        onClose={() => {
          setDefault("chart", null);
          closeForm("tool");
        }}
        maxWidth="md"
        transitionDuration={150}
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Grid container direction="row" spacing={1} alignItems="center">
            <Grid item xs={11}>
              Add a new tool
            </Grid>
            <Grid item xs={1}>
              <RegularStyledButton
                onClick={() => {
                  setDefault("chart", null);
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
          <form onSubmit={handleSubmit(onSubmit)}>
            <Grid container direction="column" spacing={1}>
              <Grid item>
                <RadioInputField
                  id="kind"
                  name="kind"
                  label="Type"
                  helperText="Select Software or Experiment"
                  error={errors.kind}
                  options={radioOptions}
                  row={true}
                  register={register}
                  defVal={def ? def.kind : "software"}
                  required
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
              <Grid item>
                <TextInputField
                  id="urls"
                  placeholder="Enter URLs for the tools"
                  name="urls"
                  helperText="Enter link(s) to package's official websites (e.g. https://www.west-code.org) or facility (e.g. https://aps.anl.gov)[comma seperated]"
                  label="URLs"
                  error={errors.urls}
                  inputRef={register}
                  defaultValue={def && def.urls}
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
                  {def && tools.find((el) => el.id == def.id) != undefined
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

export default ToolsInfoForm;
