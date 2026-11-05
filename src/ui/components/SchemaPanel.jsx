import { UI } from '../messages.fr.js';

/**
 * Panneau de schéma (EF-02) : relations, attributs, types et nombre de tuples.
 * @param {{ database: import('../../data/index.js').SampleDatabase }} props
 */
export default function SchemaPanel({ database }) {
  return (
    <section className="panel schema" aria-labelledby="schema-title">
      <h2 id="schema-title">{UI.schemaTitle}</h2>
      <p className="muted">{database.description}</p>
      <ul className="schema-list">
        {database.relations.map((relation) => (
          <li key={relation.name}>
            <div className="schema-relation">
              <strong>{relation.name}</strong>
              <span className="badge">{UI.tuples(relation.tuples.length)}</span>
            </div>
            <ul className="schema-attributes">
              {relation.attributes.map((attribute) => (
                <li key={attribute.name}>
                  <code>{attribute.name}</code>{' '}
                  <span className="muted">{UI.types[attribute.type]}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
