import { Fragment, useState, useContext } from "react";
import PropTypes from "prop-types";

// simple-react-lightbox is dead (no React >=17 support); replaced with
// yet-another-react-lightbox driven by plain open/index state.
import Lightbox from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";
import { Close, OpenInFull, PictureAsPdf } from "@mui/icons-material";

import RecordTable from "../Table/Table";
import Drawer from "../drawer";
import {
  buildDirectoryUrl,
  buildFileUrl,
  buildImageUrl,
  isMixedContent,
  isPdfFile,
} from "../../Utils/fileServerUrl";
import ChartActions from "./ChartActions";
import StyledTooltip from "../tooltip";
import ChartWorkflow from "./ChartWorkflow";
import { formatData } from "../Workflow/util";
import { figureLabel } from "../../Utils/artifactLabel";

import { useRouter } from "next/router";
import LoadingContext from "../../Context/Loading/loadingContext";
import AlertContext from "../../Context/Alert/alertContext";
import axios from "axios";

// PDF figures get the browser's own PDF viewer (the RCC file server sends no
// frame restrictions). Re-exported for existing importers.
export { isPdfFile, figureLabel };

const DetailsView = ({ rowdata }) => {
  const label = figureLabel(rowdata.number);
  const keywords = (rowdata.properties || []).filter(Boolean);
  return (
    <Box sx={{ textAlign: "left", minWidth: { md: 280 } }} data-testid="chart-details">
      {label && (
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: "#800000" }}>
          {label}
        </Typography>
      )}
      <Typography
        variant="body2"
        sx={{ mt: 0.5, lineHeight: 1.6, color: rowdata.caption ? "text.primary" : "text.disabled" }}
      >
        {rowdata.caption || "No caption provided."}
      </Typography>
      {keywords.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Key words
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {keywords.map((word) => (
              <Chip key={word} size="small" variant="outlined" label={word} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
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
        href={buildFileUrl(rowdata["server"], file)}
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
  showWorkflows = true,
  server,
  showSlider = true,
  inDrawer = true,
  editColumn = [],
}) => {
  // Light Box Controls: the open slide index (-1 = closed).
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  // PDFs cannot go in the lightbox; they expand into a dialog instead.
  const [expandedPdf, setExpandedPdf] = useState(null);

  // Chart Workflow Controls
  const [chartWorkflow, setChartWorkflow] = useState({});
  const [showChartWorkflow, setShowChartWorkflow] = useState(false);
  const router = useRouter();

  const { showLoader, hideLoader } = useContext(LoadingContext);
  const { setAlert } = useContext(AlertContext);

  const handleClick = async (e, chartid, paperid) => {
    e.preventDefault();
    showLoader();
    try {
      const data = await axios
        .get(`${server}/api/paper/${paperid}/chart/${chartid}`)
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

  const workflowData = showSlider
    ? formatData(charts, tools, external, datasets, scripts)
    : null;

  const FigureView = ({ rowdata }) => {
    const datatreeLink = buildDirectoryUrl(rowdata.server, rowdata.imageFile);
    const imageUrl = buildImageUrl(rowdata.server, rowdata.imageFile);
    // Decided once, from the URL alone -- the browser will block this before
    // any request is made, so it is knowable before the image errors.
    const mixedContent = isMixedContent(imageUrl);

    // Three different reasons produce no URL, and they need three different
    // things from the reader: save the file server, pick an image, or fix a
    // path that cannot be resolved. One shared sentence sent people looking
    // in the wrong place.
    if (!imageUrl) {
      const reason = !rowdata.imageFile
        ? "Figure Image not selected — set it on this chart."
        : !rowdata.server
        ? "File Server path not saved — save it in “Where is the paper”."
        : "Invalid image path — it must be a relative path inside the paper " +
          "folder, with no “..”, backslash or full URL.";
      return (
        <Typography
          variant="caption"
          color="error"
          data-testid="chart-image-missing"
          sx={{ display: "block", p: 1 }}
        >
          {reason}
        </Typography>
      );
    }

    const pdf = isPdfFile(rowdata.imageFile);

    return (
      <Fragment>
        {pdf ? (
          <Box sx={{ width: { xs: "60vw", md: 240 }, maxWidth: 240, mx: "auto" }}>
            {mixedContent ? (
              <Typography
                variant="caption"
                color="error"
                component="span"
                data-testid="chart-image-error"
                sx={{ display: "block", p: 1, overflowWrap: "anywhere" }}
              >
                Blocked: this page is HTTPS and the file server URL is HTTP.
                Save an https:// file server path.{" "}
                <a href={imageUrl} rel="noopener noreferrer" target="_blank">
                  Open PDF
                </a>
              </Typography>
            ) : (
              <Box
                component="object"
                data={`${imageUrl}#toolbar=0&navpanes=0&view=FitH`}
                type="application/pdf"
                aria-label={rowdata.caption || rowdata.imageFile}
                data-testid="chart-pdf"
                sx={{
                  display: "block",
                  width: "100%",
                  height: 180,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "#fafafa",
                }}
              >
                {/* Rendered only where the browser has no inline PDF viewer
                    (e.g. some mobile browsers). */}
                <Box
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    p: 2,
                  }}
                >
                  <PictureAsPdf sx={{ fontSize: 40, color: "#800000" }} />
                  <Typography variant="body2" color="text.secondary">
                    PDF figure
                  </Typography>
                </Box>
              </Box>
            )}
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 1,
                mt: 0.75,
                fontSize: "0.8rem",
              }}
            >
              {!mixedContent && (
                <Fragment>
                  <a
                    href={imageUrl}
                    data-testid="chart-pdf-expand"
                    onClick={(e) => {
                      e.preventDefault();
                      setExpandedPdf({ url: imageUrl, title: figureLabel(rowdata.number) || rowdata.imageFile, caption: rowdata.caption });
                    }}
                  >
                    Expand
                  </a>
                  <span aria-hidden="true">·</span>
                </Fragment>
              )}
              <a href={imageUrl} rel="noopener noreferrer" target="_blank" data-testid="chart-pdf-open">
                Open PDF
              </a>
              <span aria-hidden="true">·</span>
              <a href={datatreeLink} rel="noopener noreferrer" target="_blank">
                Check file server access
              </a>
            </Box>
          </Box>
        ) : (
        <StyledTooltip title={rowdata.caption} placement="left" arrow>
          <Button
            focusRipple
            onClick={() => setLightboxIndex(rowdata.index)}
            aria-label={`Expand ${figureLabel(rowdata.number) || "figure"}`}
            sx={{ flexDirection: "column", "&:hover .expand-hint": { opacity: 1 } }}
          >
            <img
              src={imageUrl}
              style={{ maxWidth: "min(240px, 60vw)", maxHeight: 200, objectFit: "contain" }}
              alt={rowdata.caption || rowdata.imageFile}
              loading="lazy"
              data-testid="chart-image"
              onError={(event) => {
                // The server path is right but the file is not reachable:
                // a labelled failure beats a silent empty box.
                event.currentTarget.style.display = "none";
                const note = event.currentTarget.nextElementSibling;
                if (note) note.style.display = "block";
              }}
            ></img>
            <Typography
              className="expand-hint"
              variant="caption"
              color="text.secondary"
              sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5, opacity: 0.7, textTransform: "none" }}
            >
              <OpenInFull sx={{ fontSize: 14 }} /> Click to expand
            </Typography>
            {/* One line, then the two ways out.
                
                WHY THIS IS SHORT. Almost every cause of a failed chart image
                is on the RCC file server, not in Qresp: the file has moved,
                the directory is not published, or -- observed in the field --
                the server's TLS certificate has expired, which Chrome reports
                as NET::ERR_CERT_DATE_INVALID and refuses before any bytes are
                read. Qresp cannot tell those apart from inside the page, and
                it must not try to work around any of them: no bypass proxy,
                no relaxed verification, no credentials. So the message says
                the one thing that is certainly true, and Open image is what
                shows the reader the browser's own, specific reason.
                
                The single cause this code CAN establish is mixed content --
                an http file server on an https page, refused before the
                request -- because that one is fixed in Qresp, by saving an
                https:// file-server path. */}
            <Typography
              variant="caption"
              color="error"
              component="span"
              data-testid="chart-image-error"
              sx={{ display: "none", p: 1, overflowWrap: "anywhere" }}
            >
              {mixedContent
                ? "Blocked: this page is HTTPS and the file server URL is " +
                  "HTTP. Save an https:// file server path."
                : "Image unavailable from the RCC file server."}{" "}
              <a href={imageUrl} rel="noopener noreferrer" target="_blank">
                Open image
              </a>{" "}
              ·{" "}
              <a href={datatreeLink} rel="noopener noreferrer" target="_blank">
                Check file server access
              </a>
            </Typography>
          </Button>
        </StyledTooltip>
        )}
        {showSlider && (
          <ChartActions
            filesHref={datatreeLink}
            onWorkflow={
              showWorkflows
                ? (e) => handleClick(e, rowdata.id, router.query.id, rowdata)
                : undefined
            }
            downloadHref={rowdata.downloadPath || undefined}
            notebookHref={
              rowdata.notebookFile
                ? "https://nbviewer.jupyter.org/url/" +
                  rowdata.server.replace(/(^\w+:|^)\/\//, "") +
                  "/" +
                  rowdata.notebookFile
                : undefined
            }
          />
        )}
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
      label: "Caption & key words",
      name: "props",
      view: DetailsView,
      options: {
        align: "left",
        sort: true,
        searchable: true,
        value: (data) => `${data.caption || ""} ${(data.properties || []).join(" ")}`,
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
    ...editColumn,
  ];

  const Gallery = [];

  const rows = charts.map((row) => {
    row["server"] = fileserverpath;
    row["downloadPath"] = downloadPath;

    // The lightbox only shows images, so PDF figures stay out of it and the
    // index is the row's position among the image figures.
    if (isPdfFile(row["imageFile"])) {
      row["index"] = -1;
    } else {
      row["index"] = Gallery.length;
      Gallery.push({
        src: buildImageUrl(row["server"], row["imageFile"]),
        title: figureLabel(row["number"]),
        description: row["caption"],
      });
    }
    return {
      figure: row,
      props: {
        server: fileserverpath,
        number: row["number"],
        caption: row["caption"],
        properties: row["properties"] || [],
      },
      files: {
        server: fileserverpath,
        files: row["files"],
      },
    };
  });

  return (
    <Fragment>
      <Lightbox
        open={lightboxIndex >= 0}
        index={lightboxIndex >= 0 ? lightboxIndex : 0}
        close={() => setLightboxIndex(-1)}
        slides={Gallery}
        plugins={[Captions]}
        animation={{ fade: 300 }}
      />
      <Dialog
        open={Boolean(expandedPdf)}
        onClose={() => setExpandedPdf(null)}
        maxWidth="lg"
        fullWidth
      >
        {expandedPdf && (
          <Fragment>
            <DialogTitle sx={{ pr: 6 }}>
              {expandedPdf.title}
              <IconButton
                aria-label="Close"
                onClick={() => setExpandedPdf(null)}
                sx={{ position: "absolute", right: 8, top: 8 }}
              >
                <Close />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box
                component="object"
                data={`${expandedPdf.url}#view=FitH`}
                type="application/pdf"
                aria-label={expandedPdf.caption || expandedPdf.title}
                sx={{ display: "block", width: "100%", height: "75vh", border: 0 }}
              />
              {expandedPdf.caption && (
                <Typography variant="body2" sx={{ mt: 1.5, lineHeight: 1.6 }}>
                  {expandedPdf.caption}
                </Typography>
              )}
            </DialogContent>
          </Fragment>
        )}
      </Dialog>
      {inDrawer ? (
        <Drawer heading="Charts">
          <RecordTable rows={rows} columns={columns} />
        </Drawer>
      ) : (
        <RecordTable rows={rows} columns={columns} />
      )}
      {showWorkflows ? (
        <ChartWorkflow
          showChartWorkflow={showChartWorkflow}
          setShowChartWorkflow={setShowChartWorkflow}
          data={workflowData}
          workflow={chartWorkflow}
        />
      ) : null}
    </Fragment>
  );
};

ChartInfo.propTypes = {
  charts: PropTypes.array.isRequired,
  fileserverpath: PropTypes.string.isRequired,
  showSlider: PropTypes.bool,
  downloadPath: PropTypes.string,
  tools: PropTypes.array,
  scripts: PropTypes.array,
  datasets: PropTypes.array,
  external: PropTypes.array,
  server: PropTypes.string,
  showWorkflows: PropTypes.bool,
  inDrawer: PropTypes.bool,
  editColumn: PropTypes.array,
};

export default ChartInfo;
