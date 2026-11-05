import { displayNames } from '../../engine/index.js';
import { UI } from '../messages.fr.js';

/**
 * Table d'une relation (EF-07), lisible par un lecteur d'écran : légende, en-têtes de colonne.
 * @param {{ relation: import('../../engine/types.js').Relation, caption: string }} props
 */
export default function ResultTable({ relation, caption }) {
  const headers = displayNames(relation.attributes);
  return (
    <div className="scroll-x">
      <table className="result-table">
        <caption>
          {caption} <span className="badge">{UI.tuples(relation.tuples.length)}</span>
        </caption>
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th key={header} scope="col">
                {header}
                <span className="muted type"> {UI.types[relation.attributes[i].type]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {relation.tuples.length === 0 ? (
            <tr>
              <td colSpan={Math.max(headers.length, 1)} className="muted">
                {UI.emptyRelation}
              </td>
            </tr>
          ) : (
            relation.tuples.map((tuple) => (
              <tr key={JSON.stringify(tuple)}>
                {tuple.map((value, i) => (
                  <td key={headers[i]} className={value === null ? 'null' : typeof value}>
                    {value === null ? 'NULL' : String(value)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
