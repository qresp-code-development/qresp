import axios from "axios";

const node = (label, value, folder, fsp = null) => {
  value = value.endsWith("/") ? value.slice(0, value.length - 1) : value;
  value = !fsp ? value : value.replace(fsp, "");
  const node = {
    label: label,
    value: value,
  };
  if (folder) {
    node["children"] = [];
  }
  return node;
};

const getList = async (url, type, service, fsp = null) => {
  const server = window.location.href.slice(
    0,
    window.location.href.lastIndexOf("/")
  );

  try {
    const response = await axios.post(
      server + "/api/dircont",
      JSON.stringify({ link: url, src: type, service: service }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const files = response.data.files.map((el) =>
      node(el.title, el.key, el.folder, fsp)
    );

    const details = response.data.services;

    return { files, details };
  } catch (error) {
    throw error;
  }
};

const findAndSetChildren = (state, parentValue, children) => {
  state.forEach((node) => {
    if (node.value == parentValue) {
      node.children = [...children];
      return;
    } else {
      if (node.children && node.children.length > 0)
        findAndSetChildren(node.children, parentValue, children);
    }
  });
  return state;
};

export { getList, findAndSetChildren };
