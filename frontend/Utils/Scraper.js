import apiEndpoint from "../Context/axios";

const node = (label, value, folder) => {
  const node = {
    label: label,
    value: value,
    folder: folder,
    children: [],
  };
  return node;
};

const getList = async (url, type, service) => {
  const server = window.location.href.slice(
    0,
    window.location.href.lastIndexOf("/")
  );

  try {
    const response = await apiEndpoint.post(
      server + "/api/dircont",
      JSON.stringify({ link: url, src: type, service: service }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const files = response.data.files.map((el) =>
      node(el.title, el.key, el.folder)
    );

    const details = response.data.services;

    return { files, details };
  } catch (error) {
    console.error(error);
    return false;
  }
};

const getStructure = (url, maxDepth) => {
  const structure = {
    label: "",
    value: "",
    children: [],
  };
  const stack = [structure];
};

export { getList };

export default getStructure;
