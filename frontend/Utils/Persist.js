const WebStore = {
  set: function (key, value) {
    if (!key || !value) {
      return;
    }

    if (typeof value === "object") {
      value = JSON.stringify(value);
    }
    localStorage.setItem(key, value);
  },
  get: function (key) {
    var value = localStorage.getItem(key);

    // Check if no value is returned
    if (!value || value == "") {
      return null;
    }

    // assume it is an object that has been stringified
    if (value[0] === "{" || value[0] === "[") {
      value = JSON.parse(value);
    }

    return value;
  },
};

export default WebStore;
