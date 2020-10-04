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

const ToolsInfo = ({ tools, inDrawer, editColumn }) => {
  const columns = [
    {
      label: "Kind",
      name: "kind",
      view: KindView,
      options: {
        align: "left",
        sort: true,
        searchable: true,
        value: (data) => data,
      },
    },
    {
      label: "Details",
      name: "details",
      view: DetailsView,
      options: {
        align: "left",
        sort: true,
        searchable: true,
        value: (data) => {
          if (data.packageName && data.packageName.length > 0)
            return data.packageName;
          return data.facilityName;
        },
      },
    },
    ...editColumn,
  ];

  const rows = tools.map((row) => {
    return {
      kind: row.kind,
      details: row,
    };
  });

  return inDrawer ? (
    <Drawer heading="Tools">
      <RecordTable rows={rows} columns={columns} />
    </Drawer>
  ) : (
    <RecordTable rows={rows} columns={columns} />
  );
};

ToolsInfo.defaultProps = {
  inDrawer: true,
  editColumn: [],
};

ToolsInfo.propTypes = {
  tools: PropTypes.array.isRequired,
  inDrawer: PropTypes.bool,
  editColumn: PropTypes.array,
};

export default ToolsInfo;
