import { useContext, Fragment } from "react";

import axios from "axios";
import { Box } from "@material-ui/core";

import StyledButton from "../button";
import { convertStatetoReqSchema } from "../../Utils/model";

import CuratorContext from "../../Context/Curator/curatorContext";
import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import ServerContext from "../../Context/Servers/serverContext";
import AlertContext from "../../Context/Alert/alertContext";

const variableTotext = {
  curatorInfo: "Curator Information",
  paperInfo: "Paper Information",
  fileServerPathInfo: "File Server Information",
  referenceInfo: "Reference Information",
  documentationInfo: "Documentation Information",
  licenseInfo: "License Information",
};

const validate = () => {};

const Publish = () => {
  const { metadata, charts, tools, datasets, scripts } = useContext(
    CuratorContext
  );

  const { editing } = useContext(CuratorHelperContext);
  const { selectedHttp } = useContext(ServerContext);
  const { setAlert } = useContext(AlertContext);

  const onClick = () => {
    const incomplete = Object.keys(editing)
      .map((el) => (editing[el] ? el : null))
      .filter((el) => el != null && el != "documentationInfo");

    if (incomplete.length > 0 || charts.length == 0) {
      setAlert(
        "Something's Missing",
        <div>
          {incomplete.length > 0 && (
            <div>
              The following required sections are not saved, please complete
              them (if not already) and save them:
              <ul>
                {incomplete.map((el, i) => (
                  <li key={i}>{variableTotext[el]}</li>
                ))}
              </ul>
            </div>
          )}
          {(charts.length == 0 || datasets.length == 0) && (
            <div>
              {incomplete.length > 0 ? "Also, you " : "You "}
              need atleast one item in each of the sections below to publish on
              Qresp:
              <ul>
                {charts.length == 0 && <li>Charts</li>}
                {datasets.length == 0 && <li>Datasets</li>}
              </ul>
            </div>
          )}
        </div>,
        null
      );
    } else {
      console.log(convertStatetoReqSchema(metadata, selectedHttp));
    }
  };

  return (
    <Box my={3}>
      <StyledButton fullWidth onClick={onClick}>
        Publish
      </StyledButton>
    </Box>
  );
};

export default Publish;
