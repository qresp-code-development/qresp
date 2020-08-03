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

const DetailsDialog = ({ showDetails, details, setShowDetails }) => {
  const handleClose = () => {
    setShowDetails(false);
  };

  const type = details.id ? IdTypeMap[details.id.charAt(0)] : null;

  const title = type
    ? type[0] +
      type.slice(1).toLowerCase() +
      " " +
      details.id[0].toUpperCase() +
      details.id.slice(1)
    : null;

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
      console.log(details);
      details.URLs = details.URLs.filter((el) => (el.length > 0 ? el : null));
      const URLs = (
        <Fragment>
          <LabelValue
            label="URLs"
            value={details.URLs.map((el, index) => (
              <a
                href={el}
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
      content = <Fragment></Fragment>;
      break;
    case "SCRIPT":
      content = <Fragment></Fragment>;
      break;
    case "DATASET":
      content = <Fragment></Fragment>;
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
