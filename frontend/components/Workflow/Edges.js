import { EDGE_VERB, RELATED_TO, fromStoredEdge } from "../../Utils/workflowGraph";

// One stored edge -> one vis-network edge.
//
// BOTH SHAPES ARRIVE. `["from", "to"]` is what every record written before
// typed edges holds; `{from, to, type}` is what is written now. A legacy pair
// is passed through as the arrow it always was -- nothing here infers a type
// for one.
//
// Two things are DRAWN differently, because they mean differently:
//
//   related_to  states no direction, so it gets a head at each end rather
//               than one arrow that would claim an order nobody stated.
//
//   feedback    is a loop the curator was asked about and confirmed. Drawn
//               like ordinary flow it reads as a mistake in the picture
//               rather than a claim about the work, so it is dashed and
//               carries the word.
//
// Everything else keeps exactly the arrow it had. vis-network separates
// several edges between one pair on its own, so `A -> B` and `B -> A` stay
// two distinguishable curves.
const createEdge = (pair) => {
  if (Array.isArray(pair)) return { from: pair[0], to: pair[1] };
  if (!pair || typeof pair !== "object") return pair;

  const { from, to, type } = fromStoredEdge(pair);
  const edge = { ...pair, from, to };
  // Hovering an arrow says what it means, in the product's own words.
  if (type && EDGE_VERB[type]) edge.title = EDGE_VERB[type];

  if (type === RELATED_TO) {
    edge.arrows = { to: true, from: true, middle: false };
  }
  if (pair.feedback) {
    edge.dashes = true;
    edge.title = "feedback loop";
  }
  return edge;
};

export default createEdge;
