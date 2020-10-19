const formatData = (charts, tools, external, datasets, scripts) => {
  /*
  Format Data for the workflow object
  */

  const data = {
    c: {},
    t: {},
    s: {},
    d: {},
    h: {},
  };

  charts.forEach((element) => {
    data.c[element.id] = element;
  });
  tools.forEach((element) => {
    data.t[element.id] = element;
  });
  scripts.forEach((element) => {
    data.s[element.id] = element;
  });
  datasets.forEach((element) => {
    data.d[element.id] = element;
  });
  external.forEach((element) => {
    data.h[element.id] = element;
  });

  return data;
};

const formatWorkflow = (workflow) => {
  workflow = workflow || {};
  const newWorkflow = {
    edges: workflow.edges ? workflow.edges : [],
    nodes: workflow.nodes ? Object.keys(workflow.nodes) : [],
  };

  return newWorkflow;
};

export { formatData, formatWorkflow };
