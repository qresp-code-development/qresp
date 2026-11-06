import { useEffect, useContext, useState, Fragment } from "react";

import {
  Box,
  Button,
  Chip,
  Grid,
  Tooltip,
  Typography,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { AddCircleOutlined, Check, DescriptionOutlined } from "@mui/icons-material";

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
import { artifactLabel } from "../../Utils/artifactLabel";
import { rowScopedIntent } from "../../Utils/connectionIntent";
import {
  LINKS_TO,
  closesLoop,
  edgeProblem,
  fromStoredEdge,
  inferEdgeType,
} from "../../Utils/workflowGraph";

// What can feed a figure, in the order a reader thinks about it.
const RESOURCE_GROUPS = [
  { key: "datasets", prefix: "d", title: "Data", form: "dataset", add: "New dataset" },
  { key: "scripts", prefix: "s", title: "Scripts", form: "script", add: "New script" },
  { key: "tools", prefix: "t", title: "Tools", form: "tool", add: "New tool" },
  { key: "heads", prefix: "h", title: "External data", form: null, add: null },
];

/** The arrow from a resource into a figure: the specific relationship when
 * there is exactly one (data consumes, a script generates), else links_to. */
export const resourceEdge = (resourceId, chartId) => ({
  from: resourceId,
  to: chartId,
  type: inferEdgeType(resourceId, chartId) || LINKS_TO,
});

/** Ids joined to this figure by any edge, either way round. */
export const connectedTo = (edges, chartId) => {
  const ids = new Set();
  (edges || []).map(fromStoredEdge).forEach(({ from, to }) => {
    if (to === chartId) ids.add(from);
    if (from === chartId) ids.add(to);
  });
  return ids;
};

// The id the reducer will mint for the next chart (same walk as mintIds).
const nextChartId = (charts) => {
  const taken = new Set((charts || []).map((c) => c.id));
  let n = (charts || []).length;
  while (taken.has(`c${n}`)) n += 1;
  return `c${n}`;
};

import { useForm } from "react-hook-form";
import { useInvalidFieldFocus } from "../../Utils/invalidField";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

// `hideTrigger` hides this form's own "Add" button while keeping the
// dialog it opens. The figure workspace mounts the form for the dialog
// and supplies its own contextual trigger, so showing both would put two
// ways to do one thing side by side.
const ChartsInfoForm = ({ hideTrigger = false }) => {
  const curator = useContext(CuratorContext);
  const { charts, add, edit, addEdge, unlink } = curator;
  const edges = (curator.workflow && curator.workflow.edges) || [];

  const { chartsHelper, openForm, closeForm, setDefault } = useContext(
    CuratorHelperContext
  );

  const { def, open } = chartsHelper;
  // What a NEW record from this form is for. Row-scoped when the form
  // was opened from a resource row's LINK; see ConnectionSection.
  const link = useRowLink("chart", chartsHelper.link);

  const { setSaveMethod, openSelector, setMultiple } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    // Nothing is required to publish: a figure may be saved with any of
    // these blank. A number is text ("2", "S1"), not only digits.
    caption: Yup.string(),
    number: Yup.string(),
    imageFile: Yup.string(),
    properties: Yup.string(),
    extraFields: extraFieldsSchema,
  });

  // RHF v7 only knows values present in defaultValues or touched by the
  // user; visually prefilled inputs are NOT registered otherwise. This
  // form's useForm outlives the dialog, so it is re-seeded on every open.
  const chartFormDefaults = (chart) => ({
    caption: (chart && chart.caption) || "",
    number: (chart && chart.number) || charts.length,
    properties:
      (chart && chart.properties && chart.properties.join(", ")) || "",
    imageFile: (chart && chart.imageFile) || "",
    extraFields: cleanExtraFields(chart && chart.extraFields),
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
    defaultValues: chartFormDefaults(def),
  });

  // Resources ticked or unticked in this sitting, {id: true|false}. Only
  // these are applied on save, so a resource linked some other way while
  // the form is open is never unlinked by it.
  const [resourceChoice, setResourceChoice] = useState({});
  useEffect(() => {
    if (open) {
      reset(chartFormDefaults(def));
      setResourceChoice({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, open]);

  const existing = Boolean(def && charts.find((el) => el.id == def.id));
  const linkedNow = existing ? connectedTo(edges, def.id) : new Set();
  const isChosen = (id) =>
    id in resourceChoice ? resourceChoice[id] : linkedNow.has(id);
  const toggleResource = (id) =>
    setResourceChoice((current) => ({ ...current, [id]: !isChosen(id) }));

  const applyResources = (chartId, knownIds) => {
    let current = edges;
    Object.entries(resourceChoice).forEach(([id, chosen]) => {
      const linked = current
        .map(fromStoredEdge)
        .filter(
          (e) => (e.from === id && e.to === chartId) || (e.from === chartId && e.to === id)
        );
      if (chosen && !linked.length) {
        const edge = resourceEdge(id, chartId);
        if (edgeProblem(edge, knownIds, current) || closesLoop(current, edge)) return;
        addEdge(edge);
        current = [...current, edge];
      }
      if (!chosen) linked.forEach((e) => unlink(e.from, e.to));
    });
  };

  const allIds = () =>
    RESOURCE_GROUPS.flatMap((g) => (curator[g.key] || []).map((r) => r.id)).concat(
      (charts || []).map((c) => c.id)
    );

  const onSubmit = (values) => {
    values.properties = String(values.properties || "")
      .split(",")
      .map((el) => el.trim())
      .filter(Boolean);
    values.number = values.number == null ? "" : String(values.number);
    const extraFields = cleanExtraFields(values.extraFields);
    values.extraFields = extraFields;
    let chartId;
    if (existing) {
      chartId = def.id;
      edit("chart", { ...def, ...values, extraFields: extraFields });
    } else {
      chartId = nextChartId(charts);
      // A new figure gets the full record shape; the old free-text file
      // fields are now real, linked resources instead.
      const record = { files: [], notebookFile: "", ...values };
      if (link.rowScoped) {
        // The record and its arrow, in one reducer change -- or neither,
        // with the form left open to say why.
        if (!link.createAndLink(record)) return;
      } else {
        add("chart", { ...record, id: chartId });
      }
    }
    applyResources(chartId, [...allIds(), chartId]);
    closeForm("chart");
  };

  // Create a resource that is linked to this figure the moment it is saved.
  const newLinkedResource = (formType) => {
    if (!existing || !openForm) return;
    setDefault(formType, null);
    openForm(formType, rowScopedIntent(def.id, artifactLabel(def, def.id)));
  };

  const onOpenFileSelector = (type) => {
    if (type == "imageFile") {
      setMultiple(false);
      setSaveMethod((val) => setValue("imageFile", val));
    }

    openSelector();
  };

  return (
    <Fragment>
{hideTrigger ? null : (
      <Tooltip
        title={<Typography variant="subtitle2">Add a new chart</Typography>}
        arrow
      >
        <RegularStyledButton
          fullWidth
          endIcon={<AddCircleOutlined />}
          onClick={() => {
            setDefault("chart", null);
            openForm("chart");
          }}
        >
          Add a Chart
        </RegularStyledButton>
      </Tooltip>
      )}
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
            <Grid size="grow" sx={{ minWidth: 0 }}>
              Add a new chart
            </Grid>
            <Grid size="auto">
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
          <form
            ref={formRef}
            onSubmit={handleSubmit(onSubmit, focusFirstInvalid)}
          >
            <Grid container direction="column" spacing={1}>
              <Grid>
                <TextInputField
                  id="caption"
                  placeholder="Enter the figure caption"
                  name="caption"
                  helperText="Use the paper's caption for this figure. If the
                    figure has no published caption, write a concise
                    description of what it shows."
                  label="Figure Caption"
                  error={errors.caption}
                  register={register}
                  defaultValue={def && def.caption}
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="number"
                  placeholder="Enter the figure number"
                  name="number"
                  helperText="The figure's number in the paper (e.g. 2, S1)"
                  label="Figure Number"
                  error={errors.number}
                  register={register}
                  defaultValue={(def && def.number) || charts.length}
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="imageFile"
                  placeholder="Enter chart image file name"
                  name="imageFile"
                  helperText="Enter the file name of the image for this figure — one image per Chart. Use the file picker button to pick files. Formats Allowed: jpeg, jpg, png, gif"
                  label="Figure Image"
                  error={errors.imageFile}
                  register={register}
                  action={
                    <IconButton
                      size="small"
                      onClick={() => onOpenFileSelector("imageFile")}
                    >
                      <DescriptionOutlined color="primary" />
                    </IconButton>
                  }
                  defaultValue={def && def.imageFile}
                />
              </Grid>
              <Grid>
                <TextInputField
                  id="chartproperties"
                  placeholder="Enter keywords"
                  name="properties"
                  helperText="Enter keyword(s) for the content displayed in the figure. e.g. potential energy surface, band gap. (Comma separated values)"
                  label="Keywords"
                  error={errors.properties}
                  register={register}
                  defaultValue={
                    def && def.properties && def.properties.join(", ")
                  }
                />
              </Grid>
              <Grid>
                <Box
                  data-testid="figure-resources"
                  sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
                >
                  <Typography variant="subtitle2">
                    Resources used to make this figure
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Pick the data, scripts and tools behind this figure. Each one is
                    connected to the figure in the workflow when you save.
                  </Typography>
                  {RESOURCE_GROUPS.every((g) => !(curator[g.key] || []).length) ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      This paper has no datasets, scripts or tools yet.
                    </Typography>
                  ) : null}
                  {RESOURCE_GROUPS.filter((g) => (curator[g.key] || []).length).map((g) => (
                    <Box key={g.key} sx={{ mb: 1 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        {g.title}
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                        {(curator[g.key] || []).map((r) => {
                          const chosen = isChosen(r.id);
                          return (
                            <Chip
                              key={r.id}
                              size="small"
                              label={artifactLabel(r, r.id)}
                              icon={chosen ? <Check /> : undefined}
                              color={chosen ? "primary" : "default"}
                              variant={chosen ? "filled" : "outlined"}
                              onClick={() => toggleResource(r.id)}
                              aria-pressed={chosen}
                              data-testid={`figure-resource-${r.id}`}
                              sx={{ maxWidth: "100%" }}
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  ))}
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
                    {RESOURCE_GROUPS.filter((g) => g.form).map((g) => (
                      <Button
                        key={g.form}
                        size="small"
                        variant="outlined"
                        startIcon={<AddCircleOutlined />}
                        disabled={!existing}
                        onClick={() => newLinkedResource(g.form)}
                        sx={{ textTransform: "none" }}
                      >
                        {g.add}
                      </Button>
                    ))}
                  </Box>
                  {existing ? null : (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      Save the figure first to create new resources already linked to it.
                    </Typography>
                  )}
                  {existing && ((def.files || []).filter(Boolean).length || def.notebookFile) ? (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, overflowWrap: "anywhere" }}>
                      {`Files listed on this figure earlier (kept): ${[...(def.files || []), def.notebookFile]
                        .filter(Boolean)
                        .join(", ")}`}
                    </Typography>
                  ) : null}
                </Box>
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
                <FormConnection control={control} newType="chart" link={link} />
              </Grid>
              <Grid>
                <RegularStyledButton fullWidth type="submit">
                  {def && charts.find((el) => el.id == def.id) != undefined
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

export default ChartsInfoForm;
