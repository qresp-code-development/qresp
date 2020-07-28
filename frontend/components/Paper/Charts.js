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
  return (
    <p style={{ maxWidth: "250px" }}>
      {rowdata["files"].map((file, index) => {
        file = file.trim();
        return (
          <a
            href={rowdata["server"] + "/" + file}
            key={index}
            style={{ color: "#007bff" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            {index != 0 ? ", " : null}
            {file.length > 1 ? file.slice(file.lastIndexOf("/") + 1) : null}
          </a>
        );
      })}
    </p>
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

  const TableHeaders = [
    { label: "Figure/Table", align: "center", value: "index" },
    { label: "Properties", align: "center", value: null },
    { label: "Files", align: "right", value: null },
  ];

  const TableDisplayOrder = ["figure", "props", "files"];

  const Gallery = [];
  const options = {
    settings: {
      lightboxTransitionSpeed: 0.3,
    },
    caption: {
      captionContainerPadding: "16px",
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
      index: row["number"],
    };
  });

  const views = { figure: FigureView, props: PropsView, files: FilesView };

  return (
    <Fragment>
      <SRLWrapper images={Gallery} options={options} />
      <Drawer heading="Charts">
        <RecordTable
          rows={rows}
          headers={TableHeaders}
          views={views}
          displayorder={TableDisplayOrder}
        />
      </Drawer>
    </Fragment>
  );
};

ChartInfo.propTypes = {
  charts: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
};

export default ChartInfo;
