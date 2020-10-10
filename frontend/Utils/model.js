const convertStateToSchema = (state, serverInformation) => {
  const schema = {
    ...state.curatorInfo,
    ...state.referenceInfo,
    ...state.paperInfo,
    // PIs: state.paperInfo.PIs,
    // abstract: state.referenceInfo.abstract,
    // authors: state.referenceInfo.authors,
    // collections: state.paperInfo.collections,
    // publication: state.referenceInfo.publication,
    // doi: state.referenceInfo.doi,
    documentation: state.documentation,
    fileServerPath: state.fileServerPath,
    charts: state.charts,
    tools: state.tools,
    datasets: state.datasets,
    scripts: state.scripts,
    heads: state.heads,
    workflows: state.workflow,
  };

  return schema;
};

const convertSchemaToState = (schema) => {};

export { convertSchemaToState, convertStateToSchema };
