import { IdTypeMap, NodeType } from "./Types";

const hoverTooltip = (type, id, nodeData) => {
  const maxCaptionLength = 200;
  const displayId = id.charAt(0).toUpperCase() + id.slice(1);
  const displayType = type.charAt(0) + type.slice(1).toLowerCase();
  switch (type) {
    case "CHART":
      return `
        <p style="
          max-width:400px;
          white-space:normal;
          text-align:justify;
          word-break:break-all;
          ">
          <img
            src=${nodeData["server"] + "/" + nodeData["imageFile"]}
            style="
              max-width:400px;
              max-height:400px;
              "
            alt="${nodeData.caption}"
            loading="lazy"
          ></img>
          <br>
          <strong>${
            displayType + " " + displayId
          }:</strong> ${nodeData.caption.slice(0, maxCaptionLength)}${
        nodeData.caption.length > maxCaptionLength ? "..." : ""
      }</p>
      `;
    case "TOOL":
      if (nodeData.kind == "software") {
        return `<p>
        <strong>Tool ${displayId}:</strong> Software<br>
        <strong>Package Name:</strong> ${nodeData.packageName}<br>
        <strong>Version:</strong> ${nodeData.version}<br>
        </p>`;
      }

      return `<p>
      <strong>Tool ${displayId}:</strong> Experiment<br>
      <strong>Facility Name:</strong> ${nodeData.facilityName}<br>
      <strong>Measurement:</strong> ${nodeData.measurement}<br>
      </p>`;

    default:
      return `<p style="
      max-width:400px;
      white-space:normal;
      text-align:justify;
      word-break:break-all;">
        <strong>${displayType + " " + displayId}:</strong> ${
        nodeData && nodeData.readme
      }</p>`;
  }
};

const createNode = (id, data) => {
  const type = id.charAt(0);
  const nodeData = data[type][id];
  const node = {
    id: id,
    ...NodeType[IdTypeMap[type]], // Set Shape Size and Color
    title: hoverTooltip(IdTypeMap[type], id, nodeData),
    // info: val.details,
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
