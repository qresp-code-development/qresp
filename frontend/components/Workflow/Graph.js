import { useEffect, useState, useRef, Fragment } from "react";
import PropTypes from "prop-types";

import {
  Network,
  DataSet,
} from "vis-network/standalone/umd/vis-network.min.js";

import createNode from "./Nodes";
import createEdge from "./Edges";
import DetailsDialog from "./Details";

// Global Edge Setting
const changeChosenEdgeMiddleArrowScale = (values, id, selected, hovering) => {
  values.middleArrowScale = 1.25;
};

// Global Node Setting
const changeChosenNodeSize = (values, id, selected, hovering) => {
  values.size = 30;
};

// Network Settings
const options = {
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
    minVelocity: 0.75,
  },
  interaction: {
    hover: true,
    dragNodes: true,
    dragView: false,
    tooltipDelay: 500,
  },
  layout: {
    improvedLayout: true,
    randomSeed: 2020,
  },
};

const Graph = ({ workflow, data }) => {
  const [details, setDetails] = useState({});
  const [showDetails, setShowDetails] = useState(false);

  // A reference to the div rendered by this component
  const domNode = useRef(null);

  // A reference to the vis network instance
  const network = useRef(null);

  const workflowNodes = workflow.nodes.map((id) => createNode(id, data));
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

    const wflow = new Network(domNode.current, data, options);
    network.current = wflow;
    wflow.on("click", showDetailsDialog);
    wflow.fit();
  }, [workflow]);

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

Graph.propTypes = {
  workflow: PropTypes.object,
  data: PropTypes.object,
};

export default Graph;
