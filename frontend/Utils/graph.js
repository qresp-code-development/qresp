const createVisited = (nodes) => {
  const visited = {};

  nodes.forEach((node) => {
    visited[node] = false;
  });

  return visited;
};

const createGraph = ({ nodes, edges }) => {
  const graph = {};
  nodes.forEach((node) => {
    graph[node] = [];
  });
  edges.forEach((edge) => {
    graph[edge.from].push(edge.to);
  });

  return graph;
};

// Returns the number of record in the corresponding section
const getNodeNumber = (id) => parseInt(id.substring(1));

/*
When a node is deleted, we rempa their ids to the lower number. 
So we also have to rempa the edges, this is what reduce means in this context. 
*/
const reduceEdgeNodeId = (node_number_to_delete, prefix, edge) => {
  if (edge.to.charAt(0) == prefix) {
    if (getNodeNumber(edge.to) > node_number_to_delete) {
      edge.to = prefix + (getNodeNumber(edge.to) - 1).toString();
    }
  }
  if (edge.from.charAt(0) == prefix) {
    if (getNodeNumber(edge.from) > node_number_to_delete) {
      edge.from = prefix + (getNodeNumber(edge.from) - 1).toString();
    }
  }
  return edge;
};

const isGraphCyclicUtil = (node, graph, visited, stack) => {
  if (!visited[node]) {
    visited[node] = true;
    stack[node] = true;

    for (let index = 0; index < graph[node].length; index++) {
      const adj = graph[node][index];
      if (!visited[adj]) {
        if (isGraphCyclicUtil(adj, graph, visited, stack)) return true;
      } else if (stack[adj]) return true;
    }
  }
  stack[node] = false;
  return false;
};

const isGraph = {
  connected: (workflow) => {
    const visited = createVisited(workflow.nodes);

    workflow.edges.forEach((edge) => {
      visited[edge.from] = true;
      visited[edge.to] = true;
    });

    return Object.values(visited).every((v) => v == true);
  },

  cyclic: (workflow) => {
    const graph = createGraph(workflow);
    const visited = createVisited(workflow.nodes);
    const stack = createVisited(workflow.nodes);

    const cycles = workflow.nodes.map((node) =>
      isGraphCyclicUtil(node, graph, visited, stack)
    );

    return cycles.some((v) => v == true);
  },
};

export { isGraph, getNodeNumber, reduceEdgeNodeId };
