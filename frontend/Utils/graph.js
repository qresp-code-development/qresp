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

export { isGraph };
