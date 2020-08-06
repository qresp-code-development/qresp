import PropTypes from "prop-types";

import { Typography, Box } from "@material-ui/core";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";
import { SimpleLabelValue } from "../labelvalue";
import { Fragment } from "react";

import { capitalizeFirstLetter } from "../../Utils/utils";

const KindView = ({ rowdata }) => {
  return (
    <Typography variant="body2" color="secondary">
      {capitalizeFirstLetter(rowdata)}
    </Typography>
  );
};

const DetailsView = ({ rowdata }) => {
  var label1, label2, value1, value2;

  var label1 = "Facility Name";
  var value1 = rowdata.facilityName;
  var label2 = "Measurement";
  var value2 = rowdata.measurement;

  if (rowdata.kind == "software") {
    label1 = "Package Name";
    value1 = rowdata.packageName;
    label2 = "Version";
    value2 = rowdata.version;
  }

  return (
    <Fragment>
      <SimpleLabelValue label={label1} value={value1} />
      <SimpleLabelValue label={label2} value={value2} />
    </Fragment>
  );
};

const ToolsInfo = ({ tools }) => {
  const TableHeaders = [
    { label: "Kind", align: "left", value: "kind" },
    { label: "Details", align: "left", value: null },
  ];

  const TableDisplayOrder = ["kind", "details"];

  const rows = tools.map((row) => {
    return {
      kind: row.kind,
      details: row,
    };
  });

  const views = { kind: KindView, details: DetailsView };

  return (
    <Drawer heading="Tools">
      <RecordTable
        rows={rows}
        headers={TableHeaders}
        views={views}
        displayorder={TableDisplayOrder}
      />
    </Drawer>
  );
};

ToolsInfo.propTypes = {
  tools: PropTypes.array.isRequired,
};

export default ToolsInfo;
