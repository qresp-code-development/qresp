import { useEffect, useRef } from "react";
import PropTypes from "prop-types";

// import { DataSet } from "vis-data/peer/umd/vis-data.min";
// import { Network } from "vis-network/peer/umd/vis-network.min";

import {
  Network,
  DataSet,
} from "vis-network/standalone/umd/vis-network.min.js";

import Drawer from "../drawer";

import { Typography, Box } from "@material-ui/core";

const changeChosenEdgeMiddleArrowScale = (values, id, selected, hovering) => {
  values.middleArrowScale = 1.1;
};

const Workflow = ({ workflow }) => {
  console.log(workflow);

  // A reference to the div rendered by this component
  const domNode = useRef(null);

  // A reference to the vis network instance
  const network = useRef(null);

  useEffect(() => {
    // create an array with nodes
    const nodes = new DataSet([
      { id: 1, label: "Node 1", color: "orange", shape: "square" },
      { id: 2, label: "Node 2" },
      { id: 3, label: "Node 3" },
      { id: 4, label: "Node 4" },
      { id: 5, label: "Node 5" },
    ]);

    // create an array with edges
    const edges = new DataSet([
      { from: 1, to: 3 },
      { from: 1, to: 2 },
      { from: 2, to: 4 },
      { from: 2, to: 5 },
      { from: 3, to: 3 },
    ]);

    // create a network
    const data = {
      nodes: nodes,
      edges: edges,
    };
    const options = {
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
        randomSeed: undefined,
      },
    };
    network.current = new Network(domNode.current, data, options);
  }, []);

  return (
    <Drawer heading="Workflow">
      <div ref={domNode}></div>
    </Drawer>
  );
};

Workflow.propTypes = {
  workflow: PropTypes.object.isRequired,
};

export default Workflow;
