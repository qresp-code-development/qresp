import { useContext, useEffect } from "react";
import PropTypes from "prop-types";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";

import { Grid } from "@mui/material";

import { TextInputField, NameInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";
import Drawer from "../drawer";

import CuratorContext from "../../Context/Curator/curatorContext";
import AuthContext from "../../Context/Auth/authContext";

const CuratorInfoForm = ({ editor }) => {
  const { curatorInfo, setCuratorInfo, registerDraftFlusher } =
    useContext(CuratorContext);
  const { user } = useContext(AuthContext);
  const defaultEmail = curatorInfo.emailId || (user && user.email) || "";
  const defaultAffiliation = curatorInfo.affiliation || (user && user.affiliation) || "";

  const _nameParts = (() => {
    if (curatorInfo.firstName || curatorInfo.lastName) return null;
    const parts = ((user && user.name) || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
    if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
    return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
  })();

  const nameFields = {
    firstName: "firstName",
    middleName: "middleName",
    lastName: "lastName",
  };

  const schema = Yup.object({
    // Optional, like everything else needed to publish; an email that is
    // given must still be one.
    [nameFields.firstName]: Yup.string(),
    [nameFields.middleName]: Yup.string(),
    [nameFields.lastName]: Yup.string(),
    emailId: Yup.string().email("Invalid email address"),
    affiliation: Yup.string(),
  });

  const { register, handleSubmit, formState: { errors }, getValues } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { ...curatorInfo, ...(_nameParts || {}), emailId: defaultEmail, affiliation: defaultAffiliation },
  });

  useEffect(() => {
    if (!registerDraftFlusher) return undefined;
    return registerDraftFlusher("curatorInfo", () => ({
      curatorInfo: { ...curatorInfo, ...getValues() },
    }));
  }, [curatorInfo, getValues, registerDraftFlusher]);

  const onSubmit = (values) => {
    setCuratorInfo(values);
    editor();
  };

  return (
    <Drawer heading="Who is Curating the paper" defaultOpen={true} editing autoSave unsaved>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container direction="column" spacing={1}>
          <Grid>
            <NameInputField
              ids={nameFields}
              label="Name"
              id="curatorname"
              register={register}
              errors={errors}
              names={nameFields}
              defaults={{ ...curatorInfo, ...(_nameParts || {}) }}
            />
          </Grid>
          <Grid>
            <TextInputField
              id="curatorEmail"
              placeholder="Enter an email address"
              name="emailId"
              helperText="eg. Jane@univ.com"
              label="Email"
              error={errors["emailId"]}
              register={register}
              defaultValue={defaultEmail}
            />
          </Grid>
          <Grid>
            <TextInputField
              id="curatorAffiliation"
              placeholder="Enter your university/organization"
              name="affiliation"
              helperText="eg. Dept. of Physics, University of XYZ"
              label="Affiliation"
              register={register}
              errore={errors["affiliation"]}
              defaultValue={defaultAffiliation}
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

CuratorInfoForm.propTypes = {
  editor: PropTypes.func.isRequired,
};

export default CuratorInfoForm;
