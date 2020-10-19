// Descending Comparator
const comparator = (a, b) => {
  if (b < a) return -1;
  if (b > a) return 1;
  return 0;
};

// Switch b/w Ascending & Descending
const getComparator = (order, orderBy, columns) => {
  // Get function to get value from data object
  var sortVal;
  columns.forEach((col) => {
    if (col.name == orderBy && col.options.sort) {
      sortVal = col.options.value;
    }
  });
  return order === "desc"
    ? (a, b) => comparator(sortVal(a), sortVal(b))
    : (a, b) => -comparator(sortVal(a), sortVal(b));
};

// Sorting Function
const stableSort = (array, comparator, orderBy) => {
  const stabilizedThis = array.map((el, index) => [el, index]);

  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0][orderBy], b[0][orderBy]);
    if (order !== 0) return order;
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
};

export { getComparator, stableSort };
