import apiEndpoint from "../Context/axios";

const node = (label, value, folder) => {
  const node = {
    label: label,
    value: value,
    folder: folder,
  };
  if (folder) {
    node["children"] = null;
  }
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
    throw error;
  }
};

const getStructure = async (url, type, service) => {
  const list = await getList(url, type, service);
  const details = list.details;

  const subFolders = await Promise.all(
    list.files.map((el) => {
      if (el.folder) {
        const data = getList(el.value, type, false).then((data) => data.files);
        return data;
      }
      return [];
    })
  );

  list.files.forEach((element, i) => {
    element.children = subFolders[i];
  });

  return { files: list.files, details };
};

export { getList, getStructure };
