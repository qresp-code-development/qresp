import { useEffect, useContext, useRef } from "react";
import PropTypes from "prop-types";

import {
  Network,
  DataSet,
} from "vis-network/standalone/umd/vis-network.min.js";

import createNode from "./Nodes";
import createEdge from "./Edges";

const changeChosenEdgeMiddleArrowScale = (values, id, selected, hovering) => {
  values.middleArrowScale = 1.1;
};

const options = {
  height: "700px",
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
  },
  layout: {
    improvedLayout: true,
    randomSeed: 2020,
  },
};

const Graph = ({ workflow, data }) => {
  // A reference to the div rendered by this component
  const domNode = useRef(null);

  // A reference to the vis network instance
  const network = useRef(null);

  const workflowNodes = workflow.nodes.map((id) => createNode(id, data));
  const workflowEdges = workflow.edges.map((pair) => createEdge(pair));

  useEffect(() => {
    // create a network
    const data = {
      nodes: new DataSet(workflowNodes),
      edges: new DataSet(workflowEdges),
    };

    const wflow = new Network(domNode.current, data, options);
    wflow.fit();
    network.current = wflow;
  }, [workflow]);

  return <div ref={domNode} style={{ border: "1px solid lightgrey" }}></div>;
};

Graph.propTypes = {
  workflow: PropTypes.object,
  data: PropTypes.object,
};

export default Graph;
