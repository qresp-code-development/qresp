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

const getList = async (url, type) => {
  const server = window.location.href.slice(
    0,
    window.location.href.lastIndexOf("/")
  );

  try {
    const response = await apiEndpoint.post(
      server + "/api/dircont",
      JSON.stringify({ link: url, src: type }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const list = response.data.map((el) => node(el.title, el.key, el.folder));
    return list;
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
