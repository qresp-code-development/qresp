import React from "react";
import PropTypes from "prop-types";

import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  withStyles,
  Tooltip,
} from "@material-ui/core";

import RecordTable from "../Table/Table";

const StyledAccordion = withStyles({
  root: {
    borderRadius: "5px",
  },
})(Accordion);

const StyledAccordionSummary = withStyles({
  root: {
    backgroundColor: "rgba(0,0,0,.03)",
  },
})(AccordionSummary);

import { ExpandMore } from "@material-ui/icons";

const PropsView = ({ rowdata }) => {
  return (
    <Typography variant="body2" color="secondary">
      {rowdata["properties"].join(", ")}
    </Typography>
  );
};

const FilesView = ({ rowdata }) => {
  return (
    <p style={{ maxWidth: "250px" }}>
      {rowdata["files"].map((file, index) => {
        file = file.trim();
        return (
          <a
            href={rowdata["server"] + "/" + file}
            key={index}
            style={{ color: "#007bff" }}
          >
            {index != 0 ? ", " : null}
            {file.length > 1 ? file.slice(file.lastIndexOf("/") + 1) : null}
          </a>
        );
      })}
    </p>
  );
};

const StyledTooltip = withStyles((theme) => ({
  tooltip: {
    backgroundColor: "#f5f5f9",
    color: "rgba(0, 0, 0, 0.87)",
    fontSize: theme.typography.pxToRem(12),
    border: "1px solid #dadde9",
  },
}))(Tooltip);

const FigureView = ({ rowdata }) => {
  return (
    <StyledTooltip title={rowdata.caption} placement="left" arrow>
      <img
        src={rowdata["server"] + "/" + rowdata["imageFile"]}
        style={{ maxWidth: "100%" }}
        alt={rowdata.caption}
        loading="lazy"
      ></img>
    </StyledTooltip>
  );
};

const ChartInfo = ({ charts, fileserverpath }) => {
  const TableHeaders = [
    { label: "Figure/Table", align: "center", value: "index" },
    { label: "Properties", align: "center", value: null },
    { label: "Files", align: "right", value: null },
  ];

  const TableDisplayOrder = ["figure", "props", "files"];

  const rows = charts.map((row) => {
    row["server"] = fileserverpath;
    return {
      figure: row,
      props: {
        server: fileserverpath,
        properties: row["properties"],
      },
      files: {
        server: fileserverpath,
        files: row["files"],
      },
      index: row["number"],
    };
  });

  const views = { figure: FigureView, props: PropsView, files: FilesView };

  // console.log(charts);
  return (
    <StyledAccordion elevation={4} square={true}>
      <StyledAccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="h4">
          <Box fontWeight="bold">Charts</Box>
        </Typography>
      </StyledAccordionSummary>
      <AccordionDetails>
        <Box display="flex" flexDirection="column" m={2}>
          <RecordTable
            rows={rows}
            headers={TableHeaders}
            views={views}
            displayorder={TableDisplayOrder}
          />
        </Box>
      </AccordionDetails>
    </StyledAccordion>
  );
};

ChartInfo.propTypes = {
  charts: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
};

export default ChartInfo;
