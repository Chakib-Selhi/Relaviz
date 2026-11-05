import { useEffect, useState } from 'react';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { loadSqlJs, verifyWithSql } from '../../engine/index.js';
import { UI } from '../messages.fr.js';
import ResultTable from './ResultTable.jsx';

/** Chargement de sql.js dans le navigateur, avec l'URL du WebAssembly fournie par Vite. */
const loadInBrowser = () => loadSqlJs(() => wasmUrl);

/**
 * Onglet SQL (EF-09, EF-10) : requête traduite, puis vérification avec SQLite. sql.js n'est
 * chargé qu'au premier affichage de cet onglet.
 * @param {{
 *   sql: string | null,
 *   result: import('../../engine/types.js').Relation | null,
 *   database: { relations: import('../../engine/types.js').Relation[] },
 *   loadSql?: () => Promise<import('../../engine/sql-oracle.js').SqlJs>,
 * }} props
 */
export default function SqlPanel({ sql, result, database, loadSql = loadInBrowser }) {
  const [verification, setVerification] = useState(
    /** @type {{ sql: string, status: 'identical' | 'different' | 'failed', detail?: any } | null} */ (
      null
    ),
  );

  useEffect(() => {
    if (!sql || !result) return undefined;
    let cancelled = false;
    loadSql()
      .then((SQL) => {
        const outcome = verifyWithSql(SQL, database, sql, result);
        if (!cancelled) {
          setVerification({
            sql,
            status: outcome.identical ? 'identical' : 'different',
            detail: outcome,
          });
        }
      })
      .catch((/** @type {Error} */ error) => {
        if (!cancelled) setVerification({ sql, status: 'failed', detail: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [sql, result, database, loadSql]);

  if (!sql || !result) return <p className="muted">{UI.sqlUnavailable}</p>;

  const current = verification?.sql === sql ? verification : null;
  const attributes = result.attributes;
  return (
    <section aria-labelledby="sql-title">
      <h3 id="sql-title">{UI.sqlTitle}</h3>
      <pre className="sql">
        <code>{sql}</code>
      </pre>
      <div aria-live="polite">
        {!current && <p className="muted">{UI.sqlLoading}</p>}
        {current?.status === 'identical' && (
          <p className="status status-ok">✓ {UI.sqlIdentical(result.tuples.length)}</p>
        )}
        {current?.status === 'failed' && (
          <p className="status status-error">{UI.sqlFailed(current.detail)}</p>
        )}
        {current?.status === 'different' && (
          <>
            <p className="status status-error">✗ {UI.sqlDifferent}</p>
            <ResultTable
              caption={UI.sqlOnlyEngine}
              relation={{ name: '', attributes, tuples: current.detail.onlyEngine }}
            />
            <ResultTable
              caption={UI.sqlOnlySql}
              relation={{ name: '', attributes, tuples: current.detail.onlySql }}
            />
          </>
        )}
      </div>
    </section>
  );
}
