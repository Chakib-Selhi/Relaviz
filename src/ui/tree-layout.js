/**
 * Placement de l'arbre d'opérations, sans bibliothèque.
 *
 * Un arbre de requête dépasse rarement une trentaine de nœuds : un placement simple suffit.
 * Les feuilles occupent des colonnes successives de gauche à droite, chaque parent est centré
 * au-dessus de ses enfants et chaque niveau de profondeur occupe une ligne. Cela évite tout
 * chevauchement, puisque deux sous-arbres n'ont jamais de colonne en commun.
 */

/** @import { Node } from '../engine/types.js' */
import { childrenOf } from '../engine/index.js';

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 52;
export const COLUMN_GAP = 20;
export const LEVEL_GAP = 40;

/**
 * @typedef {object} PlacedNode
 * @property {Node} node
 * @property {number} x centre horizontal
 * @property {number} y haut du nœud
 * @property {string | null} parentId
 * @property {string[]} childIds
 */

/**
 * @param {Node} root
 * @returns {{ nodes: PlacedNode[], width: number, height: number }}
 */
export function layoutTree(root) {
  /** @type {PlacedNode[]} */
  const nodes = [];
  let nextColumn = 0;
  let maxDepth = 0;

  /**
   * @param {Node} node
   * @param {number} depth
   * @param {string | null} parentId
   * @returns {number} centre horizontal du nœud
   */
  function place(node, depth, parentId) {
    maxDepth = Math.max(maxDepth, depth);
    const children = childrenOf(node);
    let x;
    if (children.length === 0) {
      x = nextColumn * (NODE_WIDTH + COLUMN_GAP) + NODE_WIDTH / 2;
      nextColumn += 1;
    } else {
      const xs = children.map((child) => place(child, depth + 1, node.id));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    nodes.push({
      node,
      x,
      y: depth * (NODE_HEIGHT + LEVEL_GAP),
      parentId,
      childIds: children.map((c) => c.id),
    });
    return x;
  }

  place(root, 0, null);
  return {
    nodes,
    width: nextColumn * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP,
    height: (maxDepth + 1) * (NODE_HEIGHT + LEVEL_GAP) - LEVEL_GAP,
  };
}

/**
 * Plus petit nœud dont la position contient l'indice donné (pour relier le curseur à l'arbre).
 * @param {Node[]} roots
 * @param {number} offset
 * @returns {Node | null}
 */
export function nodeAtOffset(roots, offset) {
  /** @type {Node | null} */
  let best = null;
  const visit = (/** @type {Node} */ node) => {
    if (offset < node.span.start || offset > node.span.end) return;
    if (!best || node.span.end - node.span.start <= best.span.end - best.span.start) best = node;
    childrenOf(node).forEach(visit);
  };
  roots.forEach(visit);
  return best;
}

/**
 * Raccourcit une étiquette trop longue pour la boîte d'un nœud.
 * @param {string} label
 * @param {number} [max]
 */
export function shorten(label, max = 20) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
