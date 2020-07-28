import PropTypes from "prop-types";

import { Typography } from "@material-ui/core";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";

const DescriptionView = ({ rowdata }) => {
  return (
    <Typography variant="body2" color="secondary">
      {rowdata["readme"]}
    </Typography>
  );
};

const FilesView = ({ rowdata }) => {
  return rowdata["files"].map((file, index) => {
    file = file.trim();
    if (file[0] === ".") {
      file = file.slice(1);
    }
    return (
      <a
        href={
          file[0] === "/"
            ? rowdata["server"] + file
            : rowdata["server"] + "/" + file
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
  });
};

const DatasetInfo = ({ datasets, fileserverpath }) => {
  const TableHeaders = [
    { label: "Description", align: "left", value: "readme" },
    { label: "Files", align: "left", value: null },
  ];

  const TableDisplayOrder = ["description", "files"];

  const rows = datasets.map((row) => {
    row["server"] = fileserverpath;
    return {
      description: row,
      files: row,
      readme: row.readme,
    };
  });

  const views = { description: DescriptionView, files: FilesView };

  return (
    <Drawer heading="Datasets">
      {" "}
      <RecordTable
        rows={rows}
        headers={TableHeaders}
        views={views}
        displayorder={TableDisplayOrder}
      />
    </Drawer>
  );
};

DatasetInfo.propTypes = {
  datasets: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
};

export default DatasetInfo;
