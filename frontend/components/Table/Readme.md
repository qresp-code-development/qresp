# Table Component

A Reusable Simple No Frills Table

## Features

1. Completely Customizable
2. Sort Available
3. Search Available
4. One Line Usage (after data prep)

## How to

The component has 4 required props:

- rows
- views
- headers
- displayorder

and the Table can be embedded as:

```javascript
<RecordTable headers={} rows={} views={} displayorder={} />
```

### Headers

As the name implies headers is an array of objects for the columns. Each object contains relevant information about the desired header. The following three components are required for each header object :

```javascript
header = {
  label:
    "String | This is the Label that will displayed at the top of the label",
  align: "String | Alignment in the table. <left|center|right>",
  value:
    "String | Sort & Search providing value. The sorting and searching will be done according to this value. Set null if you want to disable search and sort for the column",
};

// Headers Will Lool Like
headers = [header.., header.., header..]
```

### Rows

Rows contain the data to be presented. Each fow contains
