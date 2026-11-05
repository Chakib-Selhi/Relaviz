import { useMemo, useRef } from 'react';
import { nodeLabel } from '../../engine/index.js';
import { UI } from '../messages.fr.js';
import { NODE_HEIGHT, NODE_WIDTH, layoutTree, shorten } from '../tree-layout.js';

const PADDING = 8;

/**
 * Un arbre d'opérations en SVG (EF-06). Chaque nœud est un bouton accessible au clavier :
 * les flèches déplacent la sélection vers le parent, le premier enfant ou les voisins.
 * @param {{
 *   title: string,
 *   root: import('../../engine/types.js').Node,
 *   counts: Map<string, number>,
 *   schemas: Map<string, import('../../engine/types.js').Attribute[]>,
 *   namedResults: Set<string>,
 *   selectedId: string | null,
 *   highlightedId: string | null,
 *   onSelect: (id: string) => void,
 *   onHover: (id: string | null) => void,
 * }} props
 */
export default function TreeView({
  title,
  root,
  counts,
  schemas,
  namedResults,
  selectedId,
  highlightedId,
  onSelect,
  onHover,
}) {
  const layout = useMemo(() => layoutTree(root), [root]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.node.id, n])), [layout]);
  const refs = useRef(/** @type {Map<string, SVGGElement>} */ (new Map()));

  /** Déplace la sélection et le focus vers un autre nœud. */
  function move(/** @type {string | null | undefined} */ id) {
    if (!id) return;
    onSelect(id);
    refs.current.get(id)?.focus();
  }

  function onKeyDown(/** @type {React.KeyboardEvent} */ event, /** @type {string} */ id) {
    const placed = byId.get(id);
    if (!placed) return;
    const siblings = placed.parentId ? (byId.get(placed.parentId)?.childIds ?? []) : [];
    const index = siblings.indexOf(id);
    const targets = {
      ArrowUp: placed.parentId,
      ArrowDown: placed.childIds[0],
      ArrowLeft: siblings[index - 1],
      ArrowRight: siblings[index + 1],
    };
    if (event.key in targets) {
      event.preventDefault();
      move(targets[/** @type {keyof typeof targets} */ (event.key)]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  }

  return (
    <figure className="tree">
      <figcaption className="tree-title">{title}</figcaption>
      <div className="scroll-x">
        <svg
          width={layout.width + 2 * PADDING}
          height={layout.height + 2 * PADDING}
          viewBox={`${-PADDING} ${-PADDING} ${layout.width + 2 * PADDING} ${layout.height + 2 * PADDING}`}
          role="group"
          aria-label={UI.treeLabel}
        >
          {layout.nodes.flatMap((placed) =>
            placed.childIds.map((childId) => {
              const child = /** @type {import('../tree-layout.js').PlacedNode} */ (
                byId.get(childId)
              );
              return (
                <line
                  key={`${placed.node.id}-${childId}`}
                  className="tree-edge"
                  x1={placed.x}
                  y1={placed.y + NODE_HEIGHT}
                  x2={child.x}
                  y2={child.y}
                />
              );
            }),
          )}
          {layout.nodes.map(({ node, x, y }) => {
            const label = nodeLabel(node);
            const count = counts.get(node.id);
            const attributes = schemas.get(node.id);
            const kind =
              node.kind === 'relation'
                ? namedResults.has(node.name)
                  ? 'named'
                  : 'base'
                : 'operator';
            const classes = ['tree-node', `tree-node-${kind}`];
            if (node.id === selectedId) classes.push('selected');
            if (node.id === highlightedId) classes.push('highlighted');
            const description = [
              label,
              count === undefined ? '' : UI.tuples(count),
              attributes ? attributes.map((a) => a.name).join(', ') : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <g
                key={node.id}
                ref={(element) => {
                  if (element) refs.current.set(node.id, element);
                  else refs.current.delete(node.id);
                }}
                className={classes.join(' ')}
                transform={`translate(${x - NODE_WIDTH / 2}, ${y})`}
                role="button"
                tabIndex={node.id === selectedId || (!selectedId && node === root) ? 0 : -1}
                aria-pressed={node.id === selectedId}
                aria-label={description}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => onKeyDown(event, node.id)}
                onMouseEnter={() => onHover(node.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(node.id)}
                onBlur={() => onHover(null)}
              >
                <title>{description}</title>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="8" />
                <text x={NODE_WIDTH / 2} y="22" className="tree-label">
                  {shorten(label)}
                </text>
                {count !== undefined && (
                  <text x={NODE_WIDTH / 2} y="41" className="tree-count">
                    {UI.tuples(count)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
