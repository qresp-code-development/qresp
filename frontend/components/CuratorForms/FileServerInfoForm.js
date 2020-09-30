import { useContext } from "react";
import { Grid } from "@material-ui/core";

import Drawer from "../drawer";
import RadioInput from "../Form/RadioInput";
import { SelectInputField, TextInputField } from "../Form/InputFields";
import { SubmitAndReset } from "../Form/Util";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers";

import { getList } from "../../Utils/Scraper";

import * as Yup from "yup";

import ServerContext from "../../Context/Servers/serverContext";
import AlertContext from "../../Context/Alert/alertContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import LoadingContext from "../../Context/Loading/loadingContext";
import CuratorContext from "../../Context/Curator/curatorContext";

const FileServerInfoForm = () => {
  const schema = Yup.object({
    connectionType: Yup.string().required("Required"),
    dataServer: Yup.string()
      .required("Required")
      .url("Please enter a valid url"),
  });

  const { register, handleSubmit, errors, watch, control } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { connectionType: "http" },
  });

  const onSubmit = (values) => {
    setSaveMethod(setFileServerPath);
    showLoader();
    getList(values.dataServer, values.connectionType, true)
      .then((el) => {
        setSelectedHttp(el.details);
        setTree(el.files);
        openSelector();
      })
      .catch((err) => {
        console.error(err);
        setAlert(
          "Error",
          "There was an error retrieving data from the url provided, please check the URL and try again",
          null
        );
      })
      .finally(() => hideLoader());
  };

  const watchConnectionType = watch("connectionType");

  const options = [
    {
      label: "File Server",
      value: "http",
    },
    {
      label: "Zenodo",
      value: "zenodo",
    },
  ];

  const { httpServers, setSelectedHttp } = useContext(ServerContext);
  const { setAlert } = useContext(AlertContext);
  const { setTree, openSelector, setSaveMethod } = useContext(
    SourceTreeContext
  );
  const { showLoader, hideLoader } = useContext(LoadingContext);
  const { setFileServerPath } = useContext(CuratorContext);

  return (
    <Drawer heading="Where is the paper" defaultOpen={true}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid direction="column" container spacing={1}>
          <Grid item>
            <RadioInput
              name="connectionType"
              helperText="Select location type of the data source"
              options={options}
              row={true}
              register={register}
              error={errors.connectionType}
              defVal="http"
              id="connectionTypeRadio"
            />
          </Grid>
          <Grid item>
            {watchConnectionType == "http" ? (
              <SelectInputField
                id="dataServer"
                placeholder="Select a server from a list  or enter one"
                helperText="Select URL of remote server where paper content is organized and located. e.g. https://notebook.rcc.uchicago.edu/files/"
                label="File Server"
                options={httpServers}
                required={true}
                name="dataServer"
                error={errors.dataServer}
                control={control}
              />
            ) : (
              <TextInputField
                id="dataServer"
                placeholder="Enter zenodo record URL"
                name="dataServer"
                helperText="eg. https://zenodo.org/record/3981451"
                label="Zenodo"
                required={true}
                error={errors.dataServer}
                inputRef={register}
              />
            )}
          </Grid>
          <Grid item>
            <SubmitAndReset submitText="Search" />
          </Grid>
        </Grid>
      </form>
    </Drawer>
  );
};

export default FileServerInfoForm;
