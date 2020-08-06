import { Fragment } from "react";
import PropTypes from "prop-types";

import { SRLWrapper, useLightbox } from "simple-react-lightbox";

import { Typography, ButtonBase } from "@material-ui/core";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";
import StyledTooltip from "../tooltip";

const PropsView = ({ rowdata }) => {
  return (
    <Typography variant="body2" color="secondary">
      {rowdata["properties"].join(", ")}
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

const ChartInfo = ({ charts, fileserverpath }) => {
  // Light Box Controls
  const { openLightbox } = useLightbox();

  const FigureView = ({ rowdata }) => {
    return (
      <StyledTooltip title={rowdata.caption} placement="left" arrow>
        <ButtonBase focusRipple onClick={() => openLightbox(rowdata.index)}>
          <img
            src={rowdata["server"] + "/" + rowdata["imageFile"]}
            style={{ maxWidth: "100%" }}
            alt={rowdata.caption}
            loading="lazy"
          ></img>
        </ButtonBase>
      </StyledTooltip>
    );
  };

  const columns = [
    {
      label: "Figure/Table",
      name: "figure",
      view: FigureView,
      options: {
        align: "center",
        sort: true,
        searchable: false,
        value: (data) => data.number,
      },
    },
    {
      label: "Properties",
      name: "props",
      view: PropsView,
      options: {
        align: "center",
        sort: true,
        searchable: true,
        value: (data) => data.properties.join(""),
      },
    },
    {
      label: "Files",
      name: "files",
      view: FilesView,
      options: {
        align: "right",
        sort: false,
        searchable: false,
        value: null,
      },
    },
  ];

  const Gallery = [];
  const options = {
    settings: {
      lightboxTransitionSpeed: 0.3,
    },
    caption: {
      captionContainerPadding: "32px",
    },
    thumbnails: {
      showThumbnails: false,
    },
  };

  const rows = charts.map((row, index) => {
    row["index"] = index;
    row["server"] = fileserverpath;
    Gallery.push({
      src: row["server"] + "/" + row["imageFile"],
      caption: row["caption"],
    });
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
    };
  });

  return (
    <Fragment>
      <SRLWrapper images={Gallery} options={options} />
      <Drawer heading="Charts">
        <RecordTable rows={rows} columns={columns} />
      </Drawer>
    </Fragment>
  );
};

ChartInfo.propTypes = {
  charts: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
};

export default ChartInfo;
