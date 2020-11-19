import { useEffect, useContext } from "react";
import PropTypes from "prop-types";

import { Grid, Tooltip, Typography, IconButton } from "@material-ui/core";
import { AddCircleOutline, RemoveCircleOutline } from "@material-ui/icons";

import { RegularStyledButton } from "../button";
import { TextInputField, RadioInputField } from "../Form/InputFields";
import { SubmitAndReset, FormInputLabel } from "../Form/Util";
import { namesUtil, referenceUtil } from "../../Utils/utils";
import { doiUtil } from "../../Utils/doi";
import NameInput from "../Form//NameInput";
import Drawer from "../drawer";

import { useForm, useFieldArray } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";
import * as Yup from "yup";

import CuratorContext from "../../Context/Curator/curatorContext";
import AlertContext from "../../Context/Alert/alertContext";
import LoadingContext from "../../Context/Loading/loadingContext";

const ReferenceInfoForm = ({ editor }) => {
  const { referenceInfo, setReferenceInfo } = useContext(CuratorContext);
  const { setAlert } = useContext(AlertContext);
  const { showLoader, hideLoader } = useContext(LoadingContext);

  const schema = Yup.object({
    kind: Yup.string().required("Required"),
    doi: Yup.string().matches(
      /^(10[.][0-9]{4,}(?:[.][0-9]+)*\/(?:(?!["&\'<>])\S)+)$/,
      "Please enter a valid DOI"
    ),
    authors: Yup.array()
      .of(
        Yup.object().shape({
          firstName: Yup.string().required("Required"),
          middleName: Yup.string(),
          lastName: Yup.string().required("Required"),
        })
      )
      .required("Required")
      .min(1, "Minimum of 1 PrincipalInvestigator"),
    title: Yup.string().required("Required"),
    journal: Yup.string().required("Required"),
    page: Yup.string().required("Required"),
    abstract: Yup.string().required("Required"),
    volume: Yup.number()
      .min(1, "Minimum volume number is 1")
      .required("Required"),
    year: Yup.number()
      .min(1750, "Cannot be less than 1700")
      .integer("Plese enter a valid year")
      .required("Required"),
    url: Yup.string().url("Please enter a valid url"),
  });

  const defaults = {
    authors: namesUtil.get(referenceInfo.authors),
    ...referenceUtil.get(referenceInfo.publication),
  };

  const {
    register,
    handleSubmit,
    errors,
    control,
    getValues,
    setValue,
    formState,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      ...defaults,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "authors",
  });

  const fetchFromDOI = () => {
    showLoader();
    const currentDoi = getValues("doi");
    schema
      .validateAt("doi", currentDoi)
      .then(() =>
        doiUtil
          .get(currentDoi)
          .then((res) => doiUtil.set(res, setValue))
          .catch((err) => {
            console.error(err);
            setAlert(
              "Error",
              "There was an error getting data usig the doi, please contact the admin if problems persist",
              null
            );
          })
      )
      .catch((err) => {
        console.error(err);
        setAlert("Error", "Please enter a valid doi", null);
      })
      .finally(() => hideLoader());
  };

  const onSubmit = (values) => {
    setReferenceInfo({
      authors: namesUtil.set(values.authors),
      publication: referenceUtil.set(values),
      doi: values.doi,
      kind: values.kind,
      title: values.title,
      year: values.year,
      url: values.url,
      abstract: values.abstract,
    });
    editor();
  };

  const nameid = {
    get: (index) => {
      return {
        firstName: `authors[${index}].firstName`,
        middleName: `authors[${index}].middleName`,
        lastName: `authors[${index}].lastName`,
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
    if (!("author" in formState.dirtyFields || "author" in formState.touched))
      setValue("authors", newNames);
  }, [referenceInfo.authors]);

  return (
    <Drawer heading="Add Reference to your paper" defaultOpen={true}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={1}>
          <Grid item>
            <RadioInputField
              id="kind"
              name="kind"
              label="Kind"
              helperText="Select Preprint, Dissertation or Journal"
              error={errors.kind}
              required={true}
              options={radioOptions}
              row={true}
              register={register}
              defVal={referenceInfo.kind}
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="doi"
              placeholder="Enter doi of the paper"
              name="doi"
              helperText="Enter DOI of the paper (e.g. 10.201/jacs.23wbn) if published"
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
                    size="small"
                    style={{ padding: "2px", margin: "4px" }}
                    onClick={fetchFromDOI}
                  >
                    Fetch
                  </RegularStyledButton>
                </Tooltip>
              }
              inputRef={register}
              error={errors.doi}
            />
          </Grid>
          <Grid item>
            <Grid
              container
              justify="flex-start"
              alignItems="center"
              spacing={1}
            >
              <Grid item>
                <FormInputLabel label="Authors" forId="authors" />
              </Grid>
              <Grid item>
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
                    <AddCircleOutline color="primary" />
                  </IconButton>
                </Tooltip>
              </Grid>
            </Grid>
            {fields.map((el, index) => {
              return (
                <Grid item key={el.id}>
                  <NameInput
                    ids={nameid.get(index)}
                    names={nameid.get(index)}
                    key={index}
                    id={`authors${index}`}
                    register={register}
                    errors={errors.authors && errors.authors[index]}
                    defaults={el}
                    remove={
                      <Tooltip
                        title={
                          <Typography variant="subtitle2">
                            {fields.length == 1
                              ? "Required (minimum one author)"
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
                          <RemoveCircleOutline
                            color={fields.length == 1 ? "disabled" : "primary"}
                          />
                        </IconButton>
                      </Tooltip>
                    }
                  />
                </Grid>
              );
            })}
          </Grid>
          <Grid item>
            <TextInputField
              id="title"
              placeholder="Enter title"
              name="title"
              helperText="Enter title of the paper"
              label="Title"
              required
              inputRef={register}
              error={errors.title}
              defaultValue={referenceInfo.title}
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="journal"
              placeholder="Enter full journal name"
              name="journal"
              helperText="Enter full journal name"
              label="Journal Name"
              inputRef={register}
              error={errors.journal}
              defaultValue={defaults.journal}
              required
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="page"
              placeholder="Enter page number"
              name="page"
              helperText="Enter page number of the journal"
              label="Page"
              inputRef={register}
              error={errors.page}
              defaultValue={defaults.page}
              required
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="abstract"
              placeholder="Enter abstract"
              name="abstract"
              helperText="Enter abstract"
              label="Abstract"
              inputRef={register}
              error={errors.abstract}
              multiline
              rows={4}
              defaultValue={referenceInfo.abstract}
              required
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="volume"
              placeholder="Enter volume number"
              name="volume"
              helperText="Enter volume of the journal"
              label="Volume"
              inputRef={register}
              error={errors.volume}
              defaultValue={defaults.volume}
              required
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="year"
              placeholder="Enter year of publication"
              name="year"
              helperText="Enter year of publication"
              label="Year"
              inputRef={register}
              error={errors.year}
              defaultValue={defaults.year}
              required
            />
          </Grid>
          <Grid item>
            <TextInputField
              id="url"
              placeholder="Enter url"
              name="url"
              helperText="Enter paper url"
              label="URL"
              inputRef={register}
              error={errors.url}
              defaultValue={referenceInfo.url}
            />
          </Grid>
          <Grid item>
            <SubmitAndReset submitText="Save" />
          </Grid>
        </Grid>
      </form>
    </Drawer>
  );
};

export default ReferenceInfoForm;
