import PropTypes from "prop-types";

import { Typography } from "@material-ui/core";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";

const DescriptionView = ({ rowdata }) => {
  return (
    <Typography variant="body2" color="secondary" style={{ maxWidth: "40vw" }}>
      {rowdata["readme"]}
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

const DatasetInfo = ({ datasets, fileserverpath, editColumn, inDrawer }) => {
  const columns = [
    {
      label: "Description",
      name: "description",
      view: DescriptionView,
      options: {
        align: "left",
        sort: true,
        searchable: true,
        value: (data) => data.readme,
      },
    },
    {
      label: "Files",
      name: "files",
      view: FilesView,
      options: {
        align: "left",
        sort: false,
        searchable: false,
        value: null,
      },
    },
    ...editColumn,
  ];

  const rows = datasets.map((row) => {
    row["server"] = fileserverpath;
    return {
      description: row,
      files: row,
    };
  });

  const views = { description: DescriptionView, files: FilesView };

  return inDrawer ? (
    <Drawer heading="Datasets">
      <RecordTable rows={rows} columns={columns} />
    </Drawer>
  ) : (
    <RecordTable rows={rows} columns={columns} />
  );
};

DatasetInfo.defaultProps = {
  inDrawer: true,
  editColumn: [],
};

DatasetInfo.propTypes = {
  datasets: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
  editColumn: PropTypes.array,
  inDrawer: PropTypes.bool,
};

export default DatasetInfo;
