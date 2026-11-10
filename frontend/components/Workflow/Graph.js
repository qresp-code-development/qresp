import { useEffect, useMemo, useState, useRef, Fragment, useContext } from "react";
import PropTypes from "prop-types";

import { Network, DataSet } from "vis-network/standalone";

import { Box, Button, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import {
  AccountTree,
  AddLink,
  CenterFocusStrong,
  DeleteOutlined,
  Download,
  ZoomIn,
  ZoomOut,
} from "@mui/icons-material";

import createNode, { nodeLabel } from "./Nodes";
import createEdge from "./Edges";
import DetailsDialog from "./Details";
import { IdTypeMap } from "./Types";
import { layoutWorkflow, Y_GAP } from "../../Utils/workflowLayout";

import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";
import SpotlightContext from "../../Context/Spotlight/spotlightContext";

const FONT = '"Roboto", "Helvetica Neue", Arial, sans-serif';
const EDGE_COLOR = "#9AA7B0";
const EDGE_ACTIVE = "#37474F";
const EDGE_STYLE = {
  color: { color: EDGE_COLOR, highlight: EDGE_ACTIVE, hover: EDGE_ACTIVE, inherit: false },
  width: 1.4,
};

// The drawing's settings. No physics: the layout is computed (see
// workflowLayout), so nothing drifts, nothing jiggles when a node is dragged,
// and the same record always draws the same way.
const getOptions = (height, manipulation) => ({
  height: `${height}px`,
  width: "100%",
  autoResize: true,
  physics: false,
  layout: { improvedLayout: false },
  nodes: {
    shape: "box",
    margin: { top: 9, bottom: 9, left: 12, right: 12 },
    borderWidth: 1.5,
    borderWidthSelected: 2.5,
    shapeProperties: { borderRadius: 6 },
    widthConstraint: { minimum: 112, maximum: 176 },
    shadow: { enabled: true, color: "rgba(15, 23, 42, 0.10)", size: 8, x: 0, y: 2 },
    font: {
      face: FONT,
      size: 13,
      color: "#263238",
      multi: "html",
      bold: { face: FONT, size: 10, color: "#607D8B", mod: "bold" },
    },
    chosen: { label: false, node: true },
  },
  edges: {
    arrows: { to: { enabled: true, scaleFactor: 0.55, type: "arrow" } },
    ...EDGE_STYLE,
    hoverWidth: 0.8,
    selectionWidth: 1.2,
    // Curves computed from the two endpoints every frame, so they follow a
    // dragged node from whichever side it now sits on.
    smooth: { enabled: true, type: "cubicBezier", forceDirection: "horizontal", roundness: 0.45 },
  },
  interaction: {
    hover: true,
    dragNodes: true,
    dragView: true,
    // A page scroll must stay a page scroll; zoom is on the toolbar.
    zoomView: false,
    tooltipDelay: 250,
    navigationButtons: false,
    keyboard: false,
  },
  manipulation: manipulation || { enabled: false },
});

const ToolButton = ({ title, onClick, children, disabled }) => (
  <Tooltip title={title} describeChild>
    <span>
      <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={title}>
        {children}
      </IconButton>
    </span>
  </Tooltip>
);

const Graph = ({ workflow, data, manipulate = {} }) => {
  const [details, setDetails] = useState({});
  const [showDetails, setShowDetails] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const domNode = useRef(null);
  const network = useRef(null);
  const nodeSet = useRef(null);
  const edgeSet = useRef(null);
  // Where the curator has dragged nodes this session. Layout is presentation
  // only and never saved, but a rebuild must not throw the drags away.
  const dragged = useRef({});
  const lit = useRef("");
  const litWas = useRef(null);

  const helper = useContext(CuratorHelperContext) || {};
  const { fit, onClick } = helper.workflowHelper || {};
  const { spotlight, setSpotlight } = useContext(SpotlightContext) || {};

  const editable = Boolean(manipulate && manipulate.manipulation);

  const layout = useMemo(
    () => layoutWorkflow(workflow.nodes, workflow.edges),
    [workflow]
  );
  const height = Math.min(640, Math.max(340, layout.rows * Y_GAP + 150));

  // What the boxes say, so a renamed caption updates without a rebuild.
  const labelsKey = workflow.nodes
    .map((id) => nodeLabel(IdTypeMap[id.charAt(0)], id, (data[id.charAt(0)] || {})[id]))
    .join("\u0001");

  const fitView = (animate = true) => {
    if (!network.current) return;
    network.current.fit({
      maxZoomLevel: 1.15,
      animation: animate ? { duration: 350, easingFunction: "easeInOutQuad" } : false,
    });
  };

  const rearrange = () => {
    const wflow = network.current;
    if (!wflow) return;
    dragged.current = {};
    Object.entries(layout.positions).forEach(([id, pos]) => wflow.moveNode(id, pos.x, pos.y));
    fitView();
  };

  const zoom = (factor) => {
    const wflow = network.current;
    if (!wflow) return;
    wflow.moveTo({
      scale: Math.min(2.5, Math.max(0.3, wflow.getScale() * factor)),
      animation: { duration: 200, easingFunction: "easeInOutQuad" },
    });
  };

  const downloadPng = () => {
    const canvas = domNode.current && domNode.current.querySelector("canvas");
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    const link = document.createElement("a");
    link.download = "workflow.png";
    link.href = out.toDataURL("image/png");
    link.click();
  };

  // Show a node's neighbourhood: everything not joined to it fades back.
  const focusOn = (id) => {
    const nodes = nodeSet.current;
    const edges = edgeSet.current;
    const wflow = network.current;
    if (!nodes || !edges || !wflow) return;
    const keep = new Set([id, ...wflow.getConnectedNodes(id)]);
    const keepEdges = new Set(wflow.getConnectedEdges(id));
    nodes.update(nodes.getIds().map((n) => ({ id: n, opacity: keep.has(n) ? 1 : 0.22 })));
    edges.update(
      edges.getIds().map((e) => ({
        id: e,
        color: {
          ...EDGE_STYLE.color,
          color: keepEdges.has(e) ? EDGE_ACTIVE : "rgba(154, 167, 176, 0.25)",
        },
        width: keepEdges.has(e) ? 2 : 1.4,
      }))
    );
  };
  const clearFocus = () => {
    const nodes = nodeSet.current;
    const edges = edgeSet.current;
    if (!nodes || !edges) return;
    nodes.update(nodes.getIds().map((n) => ({ id: n, opacity: 1 })));
    edges.update(edges.getIds().map((e) => ({ id: e, ...EDGE_STYLE })));
  };

  useEffect(() => {
    const nodes = new DataSet(
      workflow.nodes.map((id) =>
        createNode(id, data, true, dragged.current[id] || layout.positions[id] || {})
      )
    );
    // Two nodes joined both ways get opposite curves so the arrows separate.
    const built = workflow.edges.map((pair) => createEdge(pair));
    const pairs = new Set(built.map((edge) => `${edge.from}\u0000${edge.to}`));
    const edges = new DataSet(
      built.map((edge) =>
        pairs.has(`${edge.to}\u0000${edge.from}`)
          ? { ...edge, smooth: { enabled: true, type: "curvedCW", roundness: 0.22 } }
          : edge
      )
    );

    let manipulation = null;
    if (editable) {
      const given = manipulate.manipulation;
      manipulation = {
        ...given,
        enabled: true,
        // The toolbar below replaces vis's own edit bar.
        initiallyActive: false,
        addEdge: (edgeData, callback) => {
          setConnecting(false);
          if (given.addEdge) given.addEdge(edgeData, callback);
          else callback(null);
        },
        // Stored edges have no ids; hand the handler the endpoints too.
        deleteEdge: (edgeData, callback) => {
          const endpoints = (edgeData.edges || [])
            .map((id) => edges.get(id))
            .filter(Boolean)
            .map(({ from, to }) => ({ from, to }));
          if (given.deleteEdge) given.deleteEdge({ ...edgeData, endpoints }, callback);
          else callback(null);
        },
      };
    }

    const wflow = new Network(
      domNode.current,
      { nodes, edges },
      getOptions(height, manipulation)
    );
    network.current = wflow;
    nodeSet.current = nodes;
    edgeSet.current = edges;
    fitView(false);

    if (onClick) {
      wflow.on("click", (params) => {
        if (params.nodes.length > 0) {
          const id = params.nodes[0];
          setDetails((data[id.charAt(0)] || {})[id] || {});
          setShowDetails(true);
        }
      });
    }
    wflow.on("dragEnd", (params) => {
      params.nodes.forEach((id) => {
        dragged.current[id] = wflow.getPosition(id);
      });
    });
    wflow.on("select", (params) =>
      setHasSelection(params.nodes.length > 0 || params.edges.length > 0)
    );
    wflow.on("hoverNode", (params) => {
      wflow.canvas.body.container.style.cursor = "pointer";
      focusOn(params.node);
      if (setSpotlight) setSpotlight(params.node);
    });
    wflow.on("blurNode", () => {
      wflow.canvas.body.container.style.cursor = "default";
      clearFocus();
      if (setSpotlight) setSpotlight("");
    });
    wflow.on("selectNode", (params) => {
      if (setSpotlight && params.nodes.length) setSpotlight(params.nodes[0]);
    });
    wflow.on("deselectNode", () => {
      if (setSpotlight) setSpotlight("");
    });

    // One network at a time: the old one is torn down, listeners and all.
    return () => {
      wflow.destroy();
      if (network.current === wflow) network.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow, onClick, editable, height]);

  // Renamed artifacts: relabel in place.
  useEffect(() => {
    const nodes = nodeSet.current;
    if (!nodes) return;
    nodes.update(
      workflow.nodes
        .filter((id) => nodes.get(id))
        .map((id) => {
          const fresh = createNode(id, data, true);
          return { id, label: fresh.label, title: fresh.title };
        })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsKey]);

  // "Rearrange" from outside (e.g. after adding external data).
  const firstFit = useRef(true);
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    rearrange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // POINTED AT FROM THE LIST: outline the matching box. The fill is left
  // alone -- colour is how a curator tells a Figure from a Tool at a glance.
  useEffect(() => {
    const nodes = nodeSet.current;
    if (!nodes) return;
    const changes = [];
    if (lit.current && lit.current !== spotlight && litWas.current) {
      if (nodes.get(lit.current)) changes.push(litWas.current);
      litWas.current = null;
    }
    if (spotlight && spotlight !== lit.current) {
      const node = nodes.get(spotlight);
      if (node) {
        litWas.current = {
          id: spotlight,
          color: node.color,
          borderWidth: node.borderWidth === undefined ? 1.5 : node.borderWidth,
        };
        const fill =
          typeof node.color === "string" ? { background: node.color } : { ...(node.color || {}) };
        changes.push({ id: spotlight, color: { ...fill, border: "#111111" }, borderWidth: 3 });
      }
    }
    lit.current = spotlight;
    if (changes.length) nodes.update(changes);
  }, [spotlight]);

  const toggleConnect = () => {
    const wflow = network.current;
    if (!wflow) return;
    if (connecting) {
      wflow.disableEditMode();
      setConnecting(false);
    } else {
      wflow.addEdgeMode();
      setConnecting(true);
    }
  };

  const empty = workflow.nodes.length === 0;
  const panel = {
    position: "absolute",
    top: 8,
    zIndex: 2,
    display: "flex",
    border: "1px solid",
    borderColor: "divider",
    borderRadius: 1.5,
    bgcolor: "rgba(255,255,255,0.94)",
  };

  return (
    <Fragment>
      <DetailsDialog showDetails={showDetails} details={details} setShowDetails={setShowDetails} />
      <Box
        className="qresp-graph"
        sx={{
          position: "relative",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
          backgroundColor: "#FBFCFD",
          backgroundImage: "radial-gradient(#DCE3E8 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {editable ? (
          <Paper elevation={0} sx={{ ...panel, left: 8, p: 0.5, gap: 0.5 }}>
            <Button
              size="small"
              startIcon={<AddLink />}
              variant={connecting ? "contained" : "text"}
              onClick={toggleConnect}
              disableElevation
              sx={{ textTransform: "none" }}
              data-testid="graph-connect"
            >
              {connecting ? "Cancel connection" : "Draw connection"}
            </Button>
            <Button
              size="small"
              startIcon={<DeleteOutlined />}
              disabled={!hasSelection}
              onClick={() => network.current && network.current.deleteSelected()}
              sx={{ textTransform: "none" }}
              data-testid="graph-delete"
            >
              Delete selected
            </Button>
          </Paper>
        ) : null}
        <Paper elevation={0} sx={{ ...panel, right: 8, p: 0.25 }}>
          <ToolButton title="Zoom in" onClick={() => zoom(1.25)}>
            <ZoomIn fontSize="small" />
          </ToolButton>
          <ToolButton title="Zoom out" onClick={() => zoom(0.8)}>
            <ZoomOut fontSize="small" />
          </ToolButton>
          <ToolButton title="Fit to view" onClick={() => fitView()}>
            <CenterFocusStrong fontSize="small" />
          </ToolButton>
          <ToolButton title="Re-arrange left to right" onClick={rearrange}>
            <AccountTree fontSize="small" />
          </ToolButton>
          <ToolButton title="Download as PNG" onClick={downloadPng} disabled={empty}>
            <Download fontSize="small" />
          </ToolButton>
        </Paper>
        {connecting ? (
          <Typography
            variant="caption"
            sx={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2,
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: "#263238",
              color: "#fff",
            }}
          >
            Drag from one box to another to connect them.
          </Typography>
        ) : null}
        {empty ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1,
              pointerEvents: "none",
            }}
          >
            Nothing in the workflow yet.
          </Typography>
        ) : null}
        <div ref={domNode} aria-label="Workflow diagram" role="img" />
      </Box>
      <style jsx global>{`
        .qresp-graph .vis-manipulation,
        .qresp-graph .vis-edit-mode,
        .qresp-graph .vis-close {
          display: none !important;
        }
        div.vis-tooltip {
          background: #ffffff;
          border: 1px solid #e0e6ea;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
          padding: 10px 12px;
          font-family: ${FONT};
          font-size: 13px;
          color: #263238;
          white-space: normal;
        }
      `}</style>
    </Fragment>
  );
};

Graph.propTypes = {
  workflow: PropTypes.object,
  data: PropTypes.object,
  manipulate: PropTypes.object,
};

export default Graph;
