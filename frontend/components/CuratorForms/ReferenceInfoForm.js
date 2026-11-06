import { useEffect, useContext } from "react";

import { Box, Grid, Tooltip, Typography, IconButton } from "@mui/material";
import { AddCircleOutlined, RemoveCircleOutlined } from "@mui/icons-material";

import { RegularStyledButton } from "../button";
import { TextInputField, RadioInputField } from "../Form/InputFields";
import { SubmitAndReset, FormInputLabel } from "../Form/Util";
import { namesUtil, referenceUtil } from "../../Utils/utils";
import { doiUtil, DOI_PATTERN } from "../../Utils/doi";
import NameInput from "../Form//NameInput";
import SortableRows from "../Form/SortableRows";
import Drawer from "../drawer";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import AlertContext from "../../Context/Alert/alertContext";
import LoadingContext from "../../Context/Loading/loadingContext";
import { workTypeInfo, workTypeOf } from "../../Utils/workTypes";
import { lookupRepo } from "../../Utils/repoLookup";

const ReferenceInfoForm = ({ editor }) => {
  const { referenceInfo, setReferenceInfo, registerDraftFlusher, workType } =
    useContext(CuratorContext);
  // A published paper (and every legacy record) asks for its kind, journal,
  // volume and page; other work types have none of those. A report may name
  // an institution or series, stored where a paper's journal goes.
  const type = workTypeOf(workType);
  const typeInfo = workTypeInfo(type);
  const isPaper = Boolean(typeInfo.paperFields);
  const hasVenue = Boolean(typeInfo.venueLabel);
  // Nothing here is required to publish (any field may be left blank, for
  // every work type); a value that IS given must still be well formed.
  const optionalNumber = Yup.number()
    .transform((value, original) => (original === "" || original == null ? undefined : value))
    .typeError("Please enter a number");
  const { setAlert } = useContext(AlertContext);
  const { showLoader, hideLoader } = useContext(LoadingContext);

  const schema = Yup.object({
    kind: Yup.string(),
    // Optional field. Accepted DOI shapes (bare, `doi:`-labelled, or a
    // doi.org/dx.doi.org resolver URL) are normalized to the bare DOI BEFORE
    // the format check, so a pasted resolver URL is no longer rejected; an
    // empty value (registered via defaultValues below) skips the check, and
    // non-DOI input still fails it.
    doi: Yup.string()
      .transform((value, original) => {
        const normalized = doiUtil.normalize(original);
        return normalized === "" ? undefined : normalized;
      })
      .matches(DOI_PATTERN, "Please enter a valid DOI, or an arXiv link or ID"),
    authors: Yup.array().of(
      Yup.object().shape({
        firstName: Yup.string(),
        middleName: Yup.string(),
        lastName: Yup.string(),
      })
    ),
    title: Yup.string(),
    // Off a published paper journal/volume/page are not asked (a report's
    // journal slot is its optional institution or series).
    journal: Yup.string(),
    page: Yup.string(),
    abstract: Yup.string(),
    volume: optionalNumber.min(1, "Minimum volume number is 1"),
    year: optionalNumber
      .min(1750, "Cannot be less than 1750")
      .integer("Please enter a valid year"),
    url: Yup.string()
      .transform((value, original) => (original === "" ? undefined : value))
      .url("Please enter a valid url"),
  });

  // react-hook-form v7 only knows values listed here or touched by the
  // user; visually prefilled inputs (defaultValue attrs, RadioGroup
  // selection) are NOT registered. Without kind/title/doi/url/abstract in
  // defaultValues, saving an untouched prefilled reference failed its
  // required checks.
  const parsedPublication = referenceUtil.get(referenceInfo.publication);
  const defaults = {
    authors: namesUtil.get(referenceInfo.authors),
    ...parsedPublication,
    // A work with no journal/volume/page may have no publication string to
    // parse the year from; it is still stored on its own.
    year:
      parsedPublication.year ||
      (referenceInfo.year != null ? referenceInfo.year : ""),
    kind: referenceInfo.kind || "",
    title: referenceInfo.title || "",
    doi: referenceInfo.doi || "",
    url: referenceInfo.url || "",
    abstract: referenceInfo.abstract || "",
  };

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    watch,
    formState,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      ...defaults,
    },
  });

  // react-hook-form v7: errors moved onto formState.
  const { errors } = formState;

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "authors",
  });

  const fetchFromDOI = (event) => {
    // This action only fills the open form. Without an explicit button type,
    // a click inside the form follows the Save submit path and closes it.
    event?.preventDefault();
    event?.stopPropagation();
    // Resolve whatever shape was pasted down to the bare DOI first: the
    // registry is queried with it, and the field is rewritten to it so what
    // the curator sees matches what will be saved.
    const normalizedDoi = doiUtil.normalize(getValues("doi"));
    if (!DOI_PATTERN.test(normalizedDoi)) {
      setAlert("Error", "Please enter a valid DOI, or an arXiv link or ID", null);
      return;
    }
    setValue("doi", normalizedDoi);
    showLoader();
    doiUtil
      .get(normalizedDoi)
      .then((res) => doiUtil.set(res, setValue))
      .catch((err) => {
        console.error(err);
        setAlert(
          "Error",
          "No publication was found for that DOI. Check it, or fill in the paper details by hand.",
          null
        );
      })
      .finally(() => hideLoader());
  };

  // A code repository's URL fills the rest of the form from its GitHub or
  // GitLab page, the way a paper's DOI does. Only fills the open form.
  const fetchFromRepo = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    showLoader();
    lookupRepo(getValues("url"))
      .then((result) => {
        setValue("url", result.url);
        if (result.title) setValue("title", result.title);
        if (result.description) setValue("abstract", result.description);
        if (result.year) setValue("year", result.year);
        if (result.developers.length) {
          setValue("authors", namesUtil.get(result.developers.join(", ")));
        }
      })
      .catch((err) => setAlert("Error", err.message, null))
      .finally(() => hideLoader());
  };

  const toReferenceInfo = (values) => {
    const hasPublication = ["journal", "year", "volume", "page"].some((key) =>
      String(values[key] || "").trim()
    );
    // A blank author row (the form always shows one) is not an author.
    const authors = (values.authors || []).filter((name) =>
      ["firstName", "middleName", "lastName"].some((key) => String((name && name[key]) || "").trim())
    );
    return {
      authors: namesUtil.set(authors),
      publication: hasPublication
        ? referenceUtil.set({
            journal: values.journal || "",
            year: values.year || "",
            volume: values.volume || "",
            page: values.page || "",
          })
        : "",
      // Store ONE normalized bare DOI regardless of the shape pasted.
      doi: doiUtil.normalize(values.doi),
      // Off a paper there is no kind question; the work type stands in so
      // the stored reference.kind still says what the record is.
      kind: isPaper ? values.kind : type,
      title: values.title,
      year: values.year,
      url: values.url,
      abstract: values.abstract,
    };
  };

  useEffect(() => {
    if (!registerDraftFlusher) return undefined;
    return registerDraftFlusher("referenceInfo", () => ({
      referenceInfo: {
        ...referenceInfo,
        ...toReferenceInfo(getValues()),
      },
    }));
  }, [getValues, referenceInfo, registerDraftFlusher]);

  const onSubmit = (values) => {
    setReferenceInfo(toReferenceInfo(values));
    editor();
  };

  const nameid = {
    get: (index) => {
      return {
        firstName: `authors.${index}.firstName`,
        middleName: `authors.${index}.middleName`,
        lastName: `authors.${index}.lastName`,
      };
    },
  };

  const radioOptions = [
    { label: "Preprint", value: "preprint" },
    { label: "Journal", value: "journal" },
    { label: "Dissertation", value: "dissertation" },
  ];

  useEffect(() => {
    const newNames = namesUtil.get(referenceInfo.authors);
    if (!("author" in formState.dirtyFields || "author" in formState.touchedFields))
      setValue("authors", newNames);
  }, [referenceInfo.authors]);

  return (
    <Drawer heading={typeInfo.heading} defaultOpen={true} editing autoSave unsaved>
      {/* This section IS the primary paper's bibliography (the record's
          `reference` block). It is not a cited-works list.

          Two ways in, and only two: the curator types the fields, or pastes a
          DOI and presses Fetch. Publication metadata is factual data with an
          authoritative registry, so no language model is involved and there
          is no manuscript upload. A value Crossref does not return is left
          blank for the curator to fill in. */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={1}>
          {isPaper && (
          <Grid>
            <RadioInputField
              id="kind"
              name="kind"
              label="Kind"
              helperText="Select Preprint, Dissertation or Journal"
              error={errors.kind}
              options={radioOptions}
              row={true}
              control={control}
              defVal={referenceInfo.kind}
            />
          </Grid>
          )}
          <Grid>
            <TextInputField
              id="doi"
              placeholder={isPaper ? "Enter doi of the paper, or its arXiv link" : "Optional DOI"}
              name="doi"
              helperText={
                isPaper
                  ? "The paper's DOI (e.g. 10.1038/s41524-025-01558-w), or its arXiv link or ID (e.g. https://arxiv.org/abs/2409.00246), which is turned into its arXiv DOI"
                  : "Optional. A DOI if the work has one, e.g. from Zenodo or an arXiv link or ID"
              }
              label="DOI"
              defaultValue={referenceInfo.doi}
              action={
                <Tooltip
                  title={
                    <Typography variant="subtitle2">
                      Get values for the fields below using the DOI
                    </Typography>
                  }
                  placement="right"
                  arrow
                >
                  <RegularStyledButton
                    type="button"
                    size="small"
                    style={{ padding: "2px", margin: "4px" }}
                    onClick={fetchFromDOI}
                  >
                    Fetch
                  </RegularStyledButton>
                </Tooltip>
              }
              register={register}
              error={errors.doi}
            />
          </Grid>
          <Grid>
            <Grid
              container
              justifyContent="flex-start"
              alignItems="center"
              spacing={1}
            >
              <Grid>
                <FormInputLabel label={typeInfo.authorsLabel} forId="authors" />
              </Grid>
              <Grid>
                <Tooltip
                  title={
                    <Typography variant="subtitle2">Add an author</Typography>
                  }
                  placement="right"
                  arrow
                >
                  <IconButton
                    onClick={() =>
                      append({
                        firstName: "",
                        middleName: "",
                        lastName: "",
                      })
                    }
                    style={{ padding: 0 }}
                  >
                    <AddCircleOutlined color="primary" />
                  </IconButton>
                </Tooltip>
              </Grid>
            </Grid>
            {/* Author order is the paper's author order: drag a row by its
                handle (or use the arrow keys on it) to move it. */}
            <Box sx={{ mt: 1.5 }}>
              <SortableRows
                items={fields}
                getKey={(el) => el.id}
                onMove={move}
                noun="author"
                renderRow={(el, index) => (
                  <NameInput
                    ids={nameid.get(index)}
                    names={nameid.get(index)}
                    id={`authors${index}`}
                    register={register}
                    errors={errors.authors && errors.authors[index]}
                    defaults={el}
                    remove={
                      <Tooltip
                        title={
                          <Typography variant="subtitle2">
                            {fields.length == 1
                              ? "Leave the names blank if you do not know them"
                              : "Remove author"}
                          </Typography>
                        }
                        placement="right"
                        arrow
                      >
                        <IconButton
                          size="small"
                          onClick={() => {
                            if (fields.length > 1) {
                              remove(index);
                            }
                          }}
                          style={{ padding: 0 }}
                        >
                          <RemoveCircleOutlined
                            color={fields.length == 1 ? "disabled" : "primary"}
                          />
                        </IconButton>
                      </Tooltip>
                    }
                  />
                )}
              />
            </Box>
          </Grid>
          <Grid>
            <TextInputField
              id="title"
              placeholder="Enter title"
              name="title"
              helperText={typeInfo.titleHelp}
              label={typeInfo.titleLabel}
              register={register}
              error={errors.title}
              defaultValue={referenceInfo.title}
            />
          </Grid>
          {(isPaper || hasVenue) && (
          <Grid>
            <TextInputField
              id="journal"
              placeholder={isPaper ? "Enter full journal name" : typeInfo.venueLabel}
              name="journal"
              helperText={isPaper ? "Enter full journal name" : typeInfo.venueHelp}
              label={isPaper ? "Journal Name" : typeInfo.venueLabel}
              register={register}
              error={errors.journal}
              defaultValue={defaults.journal}
            />
          </Grid>
          )}
          {isPaper && (
          <Grid>
            <TextInputField
              id="page"
              placeholder="Enter page number"
              name="page"
              helperText="Enter page number of the journal"
              label="Page"
              register={register}
              error={errors.page}
              defaultValue={defaults.page}
            />
          </Grid>
          )}
          <Grid>
            <TextInputField
              id="abstract"
              placeholder="Enter abstract"
              name="abstract"
              helperText={typeInfo.abstractHelp}
              label={typeInfo.abstractLabel}
              register={register}
              error={errors.abstract}
              multiline
              rows={4}
              defaultValue={referenceInfo.abstract}
            />
          </Grid>
          {isPaper && (
          <Grid>
            <TextInputField
              id="volume"
              placeholder="Enter volume number"
              name="volume"
              helperText="Enter volume of the journal"
              label="Volume"
              register={register}
              error={errors.volume}
              defaultValue={defaults.volume}
            />
          </Grid>
          )}
          <Grid>
            <TextInputField
              id="year"
              placeholder="Enter year of publication"
              name="year"
              helperText={isPaper ? "Enter year of publication" : "The year of the version you are curating"}
              label="Year"
              register={register}
              error={errors.year}
              defaultValue={defaults.year}
            />
          </Grid>
          <Grid>
            <TextInputField
              id="url"
              placeholder={type === "software" ? "https://github.com/org/repo" : "Enter url"}
              name="url"
              helperText={typeInfo.urlHelp}
              label={typeInfo.urlLabel}
              register={register}
              error={errors.url}
              defaultValue={referenceInfo.url}
              action={
                type === "software" ? (
                  <Tooltip
                    title={
                      <Typography variant="subtitle2">
                        Fill in the name, description, developers and year from the GitHub or GitLab page
                      </Typography>
                    }
                    placement="right"
                    arrow
                  >
                    <RegularStyledButton
                      type="button"
                      size="small"
                      style={{ padding: "2px", margin: "4px" }}
                      onClick={fetchFromRepo}
                      data-testid="reference-repo-fetch"
                    >
                      Fetch
                    </RegularStyledButton>
                  </Tooltip>
                ) : undefined
              }
            />
          </Grid>
          <Grid>
            <SubmitAndReset submitText="Save" />
          </Grid>
        </Grid>
      </form>
    </Drawer>
  );
};

export default ReferenceInfoForm;
