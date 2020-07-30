import { IdTypeMap, NodeType } from "./Types";

const changeChosenNodeSize = (values, id, selected, hovering) => {
  values.size = 30;
};

const createNode = (id, data) => {
  const type = id.charAt(0);
  const nodeData = data[type][id];
  const node = {
    id: id,
    ...NodeType[IdTypeMap[type]], // Set Shape Size and Color
    // title: "Hello",
    // info: val.details,
    chosen: {
      label: false,
      node: changeChosenNodeSize,
    },
    font: {
      multi: true,
      size: 25,
      color: "black",
      bold: {
        color: "black",
      },
    },
  };

  return node;
};

export default createNode;
