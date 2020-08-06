# Table Component

A Reusable Simple No Frills Table

## Features

1. Completely Customizable
2. Sort Available
3. Search Available
4. One Line Usage (after data prep)

## How to

The component has 2 props, both required:

- columns
- rows

and the Table can be embedded as:

```javascript
<RecordTable columns={} rows={} />
```

You can see real examples in the Charts, Tools, Scripts, Datasets components in Paper components. Another example is in the search page.

### Columns

As the name implies columns is an array of objects for the columns. Each object contains relevant information about the desired column. The following three components are required for each header object :

```javascript
header = {
  label:
    "String | This is the Label that will displayed at the top of the label",
  name: "String",
  view: "Object",
  options: {
    align: "String | Alignment in the table. <left|center|right>",
    sort: "boolean",
    searchable: "boolean",
    value: "function",
  },
};
```

#### Options

### Rows

Rows is an array contain the data to be presented. Each row is an object inside the array.

```
rows:[{},{},{}...]
```

Each row objects needs to have the _key_ as specified by the _name_ in the column object. And the value assciated to the key will be the data to be presented.
