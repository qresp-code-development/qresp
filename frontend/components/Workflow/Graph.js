import { useEffect, useState, useRef, Fragment, useContext } from "react";
import PropTypes from "prop-types";

import {
  Network,
  DataSet,
} from "vis-network/standalone/umd/vis-network.min.js";

import createNode from "./Nodes";
import createEdge from "./Edges";
import DetailsDialog from "./Details";

import CuratorHelperContext from "../../Context/CuratorHelpers/curatorHelperContext";

// Global Edge Setting
// Enlarge Edge of the node being hovered
const changeChosenEdgeMiddleArrowScale = (values, id, selected, hovering) => {
  if (hovering || selected) {
    values.width = 3;
    values.shadowColor = "#9ea7aa";
    values.blurRadius = 5;
  }
};

// Global Node Setting
// Enlarge the node being hovered
const changeChosenNodeSize = (values, id, selected, hovering) => {
  if (hovering || selected) {
    values.size = 25;
    values.shadowColor = "#000";
  }
};

// Network Settings
const getOptions = (manipulate = {}) => {
  return {
    height: "700px",
    nodes: {
      chosen: {
        label: false,
        node: changeChosenNodeSize,
      },
    },
    edges: {
      arrows: {
        middle: true,
      },
      chosen: {
        label: false,
        edge: changeChosenEdgeMiddleArrowScale,
      },
    },
    physics: {
      minVelocity: 0.5,
    },
    interaction: {
      hover: true,
      dragNodes: true,
      dragView: true,
      tooltipDelay: 500,
      navigationButtons: true,
      zoomView: false,
    },
    layout: {
      improvedLayout: true,
      randomSeed: 1516362197, // Time at which the domain qresp.org was registered,
    },
    ...manipulate,
  };
};

const Graph = ({ workflow, data, manipulate }) => {
  const [details, setDetails] = useState({});
  const [showDetails, setShowDetails] = useState(false);

  const [positions, setPositions] = useState(null);

  const {
    workflowHelper: { fit, showLabels, onClick },
  } = useContext(CuratorHelperContext);

  // A reference to the div rendered by this component
  const domNode = useRef(null);

  // A reference to the vis network instance
  const network = useRef(null);
  const workflowNodes = workflow.nodes.map((id) =>
    createNode(
      id,
      data,
      showLabels,
      positions && positions[id] ? positions[id] : {}
    )
  );

  const workflowEdges = workflow.edges.map((pair) => createEdge(pair));

  const showDetailsDialog = (params) => {
    if (params.nodes.length > 0) {
      const id = params.nodes[0];
      const type = id.charAt(0);
      const nodeData = data[type][id];
      setDetails(nodeData);
      setShowDetails(true);
    }
  };

  useEffect(() => {
    // create a network
    const data = {
      nodes: new DataSet(workflowNodes),
      edges: new DataSet(workflowEdges),
    };

    const wflow = new Network(domNode.current, data, getOptions(manipulate));
    network.current = wflow;

    // To Show the Details Dialog Component on click on a node only if not editing
    if (onClick) wflow.on("click", showDetailsDialog);

    if (manipulate != {})
      wflow.on("dragEnd", (params) => {
        if (params.nodes.length > 0)
          setPositions({
            ...positions,
            [params.nodes[0]]: wflow.getPosition(params.nodes[0]),
          });
      });

    // Set positions after simulation
    wflow.on("stabilized", function (params) {
      const pos = {};
      workflowNodes.forEach(
        (node) => (pos[node.id] = network.current.getPosition(node.id))
      );
      setPositions(pos);
      wflow.fit();
    });

    // Change mouse pointer to a small hand
    wflow.on("hoverNode", function (params) {
      wflow.canvas.body.container.style.cursor = "pointer";
    });
    // Have to set pointer to regular after exiting a node hover
    wflow.on("blurNode", function (params) {
      wflow.canvas.body.container.style.cursor = "default";
    });

    if (
      positions == null ||
      Object.keys(positions).length != workflowNodes.length
    ) {
      const pos = {};
      workflowNodes.forEach(
        (node) => (pos[node.id] = wflow.getPosition(node.id))
      );
      setPositions(pos);
    }
  }, [workflow, showLabels, onClick]);

  useEffect(() => {
    network.current.stabilize();
  }, [fit]);

  return (
    <Fragment>
      <DetailsDialog
        showDetails={showDetails}
        details={details}
        setShowDetails={setShowDetails}
      />
      <div ref={domNode} style={{ border: "1px solid lightgrey" }}></div>
    </Fragment>
  );
};

Graph.defaultProps = {
  manipulate: {},
};

Graph.propTypes = {
  workflow: PropTypes.object,
  data: PropTypes.object,
  manipulate: PropTypes.object,
};

export default Graph;
