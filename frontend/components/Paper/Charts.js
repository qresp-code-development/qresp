import { Fragment, useState, useContext } from "react";
import PropTypes from "prop-types";

import { SRLWrapper, useLightbox } from "simple-react-lightbox";

import { Typography, Button } from "@material-ui/core";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";
import Slider from "../HorizontalSlider";
import StyledTooltip from "../tooltip";
import ChartWorkflow from "./ChartWorkflow";
import { formatData } from "../Workflow/util";

import { useRouter } from "next/router";
import LoadingContext from "../../Context/Loading/loadingContext";
import AlertContext from "../../Context/Alert/alertContext";
import axios from "axios";

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

const ChartInfo = ({
  charts,
  fileserverpath,
  downloadPath,
  tools,
  scripts,
  datasets,
  external,
}) => {
  // Light Box Controls
  const { openLightbox } = useLightbox();

  // Chart Workflow Controls
  const [chartWorkflow, setChartWorkflow] = useState({});
  const [showChartWorkflow, setShowChartWorkflow] = useState(false);
  const router = useRouter();

  const { showLoader, hideLoader } = useContext(LoadingContext);
  const { setAlert } = useContext(AlertContext);

  const handleClick = async (e, id, query) => {
    e.preventDefault();
    showLoader();
    try {
      const data = await axios
        .post(`/api/explorer/chartworkflow`, {
          paperid: query.id,
          chartid: id,
        })
        .then((res) => res.data);
      setChartWorkflow(data);
      setShowChartWorkflow(true);
    } catch (error) {
      console.error(error);
      setAlert(
        "Error",
        "There was an error trying to fetch the chart workflow. Please try again later, if problems persist please contact the administrator. ",
        null
      );
    }
    hideLoader();
  };

  const workflowData = formatData(charts, tools, external, datasets, scripts);

  const FigureView = ({ rowdata }) => {
    const datatreeLink =
      rowdata.server +
      "/" +
      rowdata.imageFile.slice(
        rowdata.imageFile.startsWith("/") ? 1 : 0,
        rowdata.imageFile.lastIndexOf("/")
      );

    console.log(datatreeLink);
    return (
      <Fragment>
        <StyledTooltip title={rowdata.caption} placement="left" arrow>
          <Button focusRipple onClick={() => openLightbox(rowdata.index)}>
            <img
              src={rowdata["server"] + "/" + rowdata["imageFile"]}
              style={{ maxWidth: "60vh" }}
              alt={rowdata.caption}
              loading="lazy"
            ></img>
          </Button>
        </StyledTooltip>
        <Slider>
          <a
            href={datatreeLink}
            rel="noopener noreferrer"
            alt="View the data tree"
            target="_blank"
          >
            <img src="/images/datatree.png" className="imgButton" />
          </a>
          <a
            onClick={(e) => handleClick(e, rowdata.id, router.query)}
            href="showChartWorkflow"
          >
            <img src="/images/workflow-icon.png" className="imgButton" />
          </a>
          <a
            href={rowdata.downloadPath}
            rel="noopener noreferrer"
            alt="Download data associated to the paper Using Globus"
            target="_blank"
          >
            <img src="/images/download-icon.png" className="imgButton" />
          </a>
          {rowdata.notebookFile ? (
            <a
              href={
                "https://nbviewer.jupyter.org/url/" +
                rowdata.server +
                "/" +
                rowdata.notebookFile
              }
              rel="noopener noreferrer"
              alt="View Default Notebook File"
              target="_blank"
            >
              <img src="/images/jupyter-icon.png" className="imgButton" />
            </a>
          ) : null}
        </Slider>
        <style jsx>{`
          .imgButton {
            margin: auto;
            height: 32px;
            width: 32px;
          }
        `}</style>
      </Fragment>
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
    row["downloadPath"] = downloadPath;
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
      <ChartWorkflow
        showChartWorkflow={showChartWorkflow}
        setShowChartWorkflow={setShowChartWorkflow}
        data={workflowData}
        workflow={chartWorkflow}
      />
    </Fragment>
  );
};

ChartInfo.propTypes = {
  charts: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
};

export default ChartInfo;
