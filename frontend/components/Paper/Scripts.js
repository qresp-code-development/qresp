import PropTypes from "prop-types";

import { Typography } from "@material-ui/core";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";

const DescriptionView = ({ rowdata }) => {
  return (
    <Typography variant="body2" color="secondary" style={{ minWidth: "25vw" }}>
      {rowdata["readme"].charAt(0).toUpperCase(0) + rowdata["readme"].slice(1)}
    </Typography>
  );
};

const FilesView = ({ rowdata }) => {
  const fileLinks = rowdata["files"].map((file, index) => {
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
  return (
    <div
      style={{
        wordBreak: "break-all",
        maxHeight: "10vh",
        overflowY: "auto",
        paddingRight: "8px",
        whiteSpace: "normal",
      }}
    >
      {fileLinks}
    </div>
  );
};

const ScriptsInfo = ({ scripts, fileserverpath }) => {
  const TableHeaders = [
    { label: "Description", align: "left", value: "sortLabel" },
    { label: "Files", align: "left", value: null },
  ];

  const TableDisplayOrder = ["description", "files"];

  const rows = scripts.map((row) => {
    row["server"] = fileserverpath;
    return {
      description: row,
      files: row,
      sortLabel: row.readme,
    };
  });

  const views = { description: DescriptionView, files: FilesView };

  return (
    <Drawer heading="Scripts">
      <RecordTable
        rows={rows}
        headers={TableHeaders}
        views={views}
        displayorder={TableDisplayOrder}
      />
    </Drawer>
  );
};

ScriptsInfo.propTypes = {
  scripts: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
};

export default ScriptsInfo;
