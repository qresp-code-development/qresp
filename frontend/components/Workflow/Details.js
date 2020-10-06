import { Fragment } from "react";
import PropTypes from "prop-types";

import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
  Typography,
} from "@material-ui/core";

import LabelValue from "../labelvalue";
import { IdTypeMap } from "./Types";

import { capitalizeFirstLetter } from "../../Utils/utils";

const DetailsDialog = ({ showDetails, details, setShowDetails }) => {
  const handleClose = () => {
    setShowDetails(false);
  };

  const type = details.id ? IdTypeMap[details.id.charAt(0)] : null;

  const title = type
    ? capitalizeFirstLetter(type) + " " + capitalizeFirstLetter(details.id)
    : null;

  var URLs = null;
  var files = null;

  var content = "";
  switch (type) {
    case "CHART":
      content = (
        <Fragment>
          <img
            src={details["server"] + "/" + details["imageFile"]}
            style={{
              maxWidth: "100%",
              marginLeft: "auto",
              marginRight: "auto",
              display: "block",
              border: "solid 1px gray",
            }}
            alt={details.caption}
            loading="lazy"
          ></img>
          <br />
          <Typography
            variant="body2"
            color="secondary"
            align="justify"
            gutterBottom
          >
            {details.caption}
          </Typography>
          <LabelValue
            label="Properties"
            value={details.properties.join(", ")}
          />
        </Fragment>
      );
      break;
    case "TOOL":
      details.URLs = details.URLS
        ? details.URLs.filter((el) => (el.length > 0 ? el : null))
        : [];
      URLs = (
        <Fragment>
          <LabelValue
            label="URLs"
            value={details.URLs.map((el, index) => (
              <a
                href={el}
                style={{ color: "#007bff" }}
                rel="noopener noreferrer"
                target="_blank"
                key={index}
              >
                {index == 0 ? el : " ," + el}
              </a>
            ))}
          />
        </Fragment>
      );
      if (details.kind == "software") {
        content = (
          <Fragment>
            <LabelValue label="Kind" value="Software" />
            <LabelValue label="Package Name" value={details.packageName} />
            <LabelValue label="Version" value={details.version} />
            {details.programName ? (
              <LabelValue label="Executable Name" value={details.programName} />
            ) : null}
            {details.URLs.length > 0 ? URLs : null}
          </Fragment>
        );
      } else {
        content = (
          <Fragment>
            <LabelValue label="Kind" value="Experiment" />
            <LabelValue label="Facility Name" value={details.facilityName} />
            <LabelValue label="Measurement" value={details.measurement} />
            {details.URLs.length > 0 ? URLs : null}
          </Fragment>
        );
      }
      break;
    case "EXTERNAL":
    case "SCRIPT":
    case "DATASET":
      details.URLs = details.URLs
        ? details.URLs.filter((el) => (el.length > 0 ? el : null))
        : [];
      URLs = (
        <Fragment>
          <LabelValue
            label="URLs"
            value={details.URLs.map((el, index) => (
              <a
                href={el}
                rel="noopener noreferrer"
                style={{ color: "#007bff" }}
                target="_blank"
                key={index}
              >
                {index == 0 ? el : " ," + el}
              </a>
            ))}
          />
        </Fragment>
      );
      files = details.files
        ? details.files.map((file, index) => {
            file = file.trim();
            if (file[0] === ".") {
              file = file.slice(1);
            }
            return (
              <a
                href={
                  file[0] === "/"
                    ? details.server + file
                    : details.server + "/" + file
                }
                key={index}
                style={{ color: "#007bff" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {index != 0 ? ", " : null}
                {file.length > 1 ? file.slice(file.lastIndexOf("/") + 1) : null}
              </a>
            );
          })
        : [];

      content = (
        <Fragment>
          <LabelValue label="Description" value={details.readme} />
          {details.URLs.length > 0 ? URLs : null}
          {files.length > 0 ? <LabelValue label="Files" value={files} /> : null}
        </Fragment>
      );
      break;
    default:
      break;
  }

  return (
    <div>
      <Dialog onClose={handleClose} open={showDetails}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>{content}</DialogContent>
        <DialogActions>
          <Button autoFocus onClick={handleClose} color="primary">
            Dismiss
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

DetailsDialog.propTypes = {
  showDetails: PropTypes.bool.isRequired,
  setShowDetails: PropTypes.func.isRequired,
  details: PropTypes.object.isRequired,
};

export default DetailsDialog;
