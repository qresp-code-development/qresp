import { useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { Box, Button, Divider, Grid, Tooltip, Typography, IconButton } from "@mui/material";
import {
  Add,
  RemoveCircleOutlined,
  FolderOpen,
} from "@mui/icons-material";

import { namesUtil } from "../../Utils/utils";

import { TextInputField } from "../Form/InputFields";
import { SubmitAndReset, FormInputLabel, FieldDescription } from "../Form/Util";
import NameInput from "../Form//NameInput";
import Drawer from "../drawer";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import KeywordAssist from "../CuratorElements/KeywordAssist";

// Defined at module level: a component declared inside the form would be a
// new type on every render and remount (and blank) every field in it.
const Section = ({ title, children }) => (
  <Box sx={{ mt: 1 }}>
    <Typography
      variant="overline"
      component="div"
      sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: "0.08em", lineHeight: 2 }}
    >
      {title}
    </Typography>
    {children}
  </Box>
);

const PaperInfoForm = ({ editor }) => {
  // Qresp curation metadata ONLY (PIs, PaperStack, keywords, notebook).
  // The primary paper's bibliography lives in the separate
  // "Publication Information for This Paper" section (referenceInfo).
  const { paperInfo, setPaperInfo, fileServerPath, registerDraftFlusher } =
    useContext(CuratorContext);
  const { setSaveMethod, openSelector, HideSelector } = useContext(
    SourceTreeContext
  );

  const schema = Yup.object({
    // Nothing here is required to publish; it all helps readers find the
    // record.
    PIs: Yup.array().of(
      Yup.object().shape({
        firstName: Yup.string(),
        middleName: Yup.string(),
        lastName: Yup.string(),
      })
    ),
    collections: Yup.string(),
    tags: Yup.string(),
    notebookFile: Yup.string(),
    institution: Yup.string(),
  });

  const formattedNames = namesUtil.get(paperInfo.PIs);
  const { register, handleSubmit, formState: { errors }, watch, control, setValue, getValues } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      ...paperInfo,
      PIs: formattedNames,
      // State keeps tags/collections as arrays; this form edits them as
      // comma-separated strings (split again in onSubmit). collections was
      // missing the join, so re-editing a saved section — and curator edit
      // mode loading ["MICCOM"] — failed yup's string check.
      tags: (paperInfo.tags || []).join(", "),
      collections: (paperInfo.collections || []).join(", "),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "PIs",
  });

  const splitList = (value) =>
    String(value || "")
      .split(",")
      .map((el) => el.trim())
      .filter(Boolean);

  const toPaperInfo = (values) => {
    const next = {
      ...paperInfo,
      ...values,
      collections: splitList(values.collections),
      tags: splitList(values.tags),
      // A blank row (the form always shows one) is not a P.I.
      PIs: namesUtil.set(
        (values.PIs || []).filter((name) =>
          ["firstName", "middleName", "lastName"].some((key) => String((name && name[key]) || "").trim())
        )
      ),
    };
    if (next.notebookFile && next.notebookFile.length > 0) {
      next.notebookPath = fileServerPath + next.notebookFile;
    }
    return next;
  };

  useEffect(() => {
    if (!registerDraftFlusher) return undefined;
    return registerDraftFlusher("paperInfo", () => ({
      paperInfo: toPaperInfo(getValues()),
    }));
  }, [getValues, registerDraftFlusher, toPaperInfo]);

  const onSubmit = (values) => {
    setPaperInfo(toPaperInfo(values));
    editor();
  };

  const onOpenFileSelector = () => {
    setSaveMethod((val) => setValue("notebookFile", val));
    openSelector();
  };

  const pId = {
    get: (index) => {
      return {
        firstName: `PIs.${index}.firstName`,
        middleName: `PIs.${index}.middleName`,
        lastName: `PIs.${index}.lastName`,
      };
    },
  };

  return (
    <Drawer heading="Qresp Curation Information" defaultOpen={true} editing autoSave unsaved>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, maxWidth: 720 }}>
          How this record is described and grouped on Qresp. Everything here
          is optional; it helps readers find the record.
        </Typography>

        <Section title="People">
          <FormInputLabel label="Principal Investigators" forId="pis" />
          <FieldDescription>
            The researcher(s) who led this work, usually the corresponding or
            last author. Shown on the record and used when searching by PI.
          </FieldDescription>
          {/* Column container restores vertical gutters between PI rows
              (MUI v9 grids no longer pad plain nested items), keeping shrunk
              labels clear of the row above. */}
          <Grid container direction="column" spacing={2} sx={{ mt: 0.5 }}>
            {fields.map((pi, index) => (
              <Grid key={index}>
                <NameInput
                  ids={pId.get(index)}
                  names={pId.get(index)}
                  key={index}
                  id={`pi${index}`}
                  register={register}
                  errors={errors.PIs && errors.PIs[index]}
                  defaults={formattedNames[index]}
                  remove={
                    <Tooltip
                      title={fields.length == 1 ? "Leave the names blank if there is no P.I." : "Remove this P.I."}
                      placement="right"
                      arrow
                    >
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Remove this principal investigator"
                          disabled={fields.length == 1}
                          onClick={() => {
                            if (fields.length > 1) remove(index);
                          }}
                        >
                          <RemoveCircleOutlined color={fields.length == 1 ? "disabled" : "primary"} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  }
                />
              </Grid>
            ))}
          </Grid>
          <Button
            type="button"
            size="small"
            variant="outlined"
            startIcon={<Add />}
            onClick={() => append({ firstName: "", middleName: "", lastName: "" })}
            sx={{ mt: 1.5, textTransform: "none" }}
          >
            Add another P.I.
          </Button>
        </Section>

        <Divider sx={{ my: 2.5 }} />

        <Section title="Finding this paper">
          <Box sx={{ mb: 2.5 }}>
            <TextInputField
              id="paperstack"
              placeholder="Enter collection to which project belongs to, e.g. MICCoM, AFOSR"
              name="collections"
              label="Collections (optional)"
              description="Qresp groups related papers into collections, usually the funding program or research center behind them (Qresp has historically called this a “PaperStack”). Readers can browse a collection to find related work. Separate several with commas."
              register={register}
              error={errors.collections}
            />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <TextInputField
              id="tags"
              placeholder="Enter tags for the project, e.g. DFT, spin defects, charge transfer"
              name="tags"
              label="Keywords (optional)"
              description="Scientific terms readers would search for. Separate with commas."
              register={register}
              error={errors.tags}
            />
            {/* Suggestions only, and they APPEND: what the curator already
                typed is never replaced, and applying does not save the
                section. */}
            <KeywordAssist
              onApply={(keywords) => {
                const current = splitList(getValues("tags"));
                const existing = current.map((tag) => tag.toLowerCase());
                const fresh = [];
                keywords.forEach((keyword) => {
                  const key = keyword.toLowerCase();
                  if (existing.includes(key)) return;
                  existing.push(key);
                  fresh.push(keyword);
                });
                setValue("tags", [...current, ...fresh].join(", "));
              }}
            />
          </Box>
          {/* Record-level, optional, and never inferred from anything else on
              this form: not from the PIs above, not from a collection, not
              from where this server happens to be running. A curator who
              leaves it blank publishes a record with no institution badge --
              that is a valid, unremarkable answer. */}
          <TextInputField
            id="institution"
            placeholder="e.g. University of Chicago"
            name="institution"
            label="Institution (optional)"
            description="The institution associated with this record, shown as a badge beside the authors. It is not a claim that every author belongs to it."
            register={register}
            error={errors.institution}
          />
        </Section>

        <Divider sx={{ my: 2.5 }} />

        <Section title="Reproducing the paper">
          <TextInputField
            id="mainNotebookFile"
            placeholder="Enter main notebook filename, e.g. main.ipynb"
            name="notebookFile"
            label="Main notebook file (optional)"
            description="A Jupyter notebook in the project folder that works as a table of contents for the paper, linking its figures, data and scripts. Readers get a one-click “Open notebook” link. Leave blank if there isn't one."
            action={
              <Button
                type="button"
                size="small"
                variant="outlined"
                startIcon={<FolderOpen fontSize="small" />}
                onClick={onOpenFileSelector}
                sx={{ textTransform: "none", py: 0.25 }}
              >
                Browse…
              </Button>
            }
            register={register}
            error={errors.notebookFile}
          />
        </Section>

        <Box sx={{ mt: 3 }}>
          <SubmitAndReset submitText="Save" />
        </Box>
      </form>
    </Drawer>
  );
};

PaperInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default PaperInfoForm;
