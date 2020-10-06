const createEdge = (pair) => {
  if (Array.isArray(pair))
    return {
      from: pair[0],
      to: pair[1],
    };
  return pair;
};

export default createEdge;
