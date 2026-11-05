/**
 * Oracle SQL : exécute la requête traduite avec SQLite (sql.js) et compare son résultat à celui
 * du moteur (EF-10). Le moteur reste la référence ; toute divergence est un bogue.
 *
 * sql.js (environ 1 Mo avec le WebAssembly) n'est chargé qu'à la demande, par `loadSqlJs`.
 * L'interface fournit l'URL du fichier .wasm ; sous Node (tests), sql.js le trouve seul.
 */

/** @import { Relation } from './types.js' */
/** @import { Database } from './schema-checker.js' */
/** @import { Tuple } from './evaluator.js' */
import { tupleKey } from './evaluator.js';
import { quoteIdentifier } from './sql-translator.js';

/**
 * Partie de l'API de sql.js utilisée ici.
 * @typedef {{ exec(sql: string): Array<{ columns: string[], values: Tuple[] }>, run(sql: string, params?: Tuple): unknown, close(): void }} SqlDatabase
 * @typedef {{ Database: new () => SqlDatabase }} SqlJs
 */

/**
 * @typedef {object} Comparison
 * @property {boolean} identical les deux résultats sont égaux comme ensembles
 * @property {Tuple[]} onlyEngine tuples présents seulement dans le résultat du moteur
 * @property {Tuple[]} onlySql tuples présents seulement dans le résultat de SQLite
 */

/** @type {Promise<SqlJs> | null} */
let loading = null;

/**
 * Charge sql.js une seule fois (import dynamique : le module n'entre pas dans le premier bundle).
 * @param {(file: string) => string} [locateFile] URL des fichiers .wasm, pour le navigateur
 * @returns {Promise<SqlJs>}
 */
export function loadSqlJs(locateFile) {
  loading ??= import('sql.js').then((module) =>
    module.default(locateFile ? { locateFile } : undefined),
  );
  return loading;
}

/**
 * Crée une base SQLite en mémoire avec les relations de la base. Les colonnes n'ont pas de type
 * déclaré : SQLite conserve alors exactement les valeurs fournies (nombres, textes, NULL).
 * @param {SqlJs} SQL
 * @param {Database} database
 * @returns {SqlDatabase}
 */
export function createSqlDatabase(SQL, database) {
  const db = new SQL.Database();
  for (const relation of database.relations) {
    const table = quoteIdentifier(relation.name);
    const columns = relation.attributes.map((a) => quoteIdentifier(a.name)).join(', ');
    db.run(`CREATE TABLE ${table} (${columns})`);
    const placeholders = relation.attributes.map(() => '?').join(', ');
    for (const tuple of relation.tuples)
      db.run(`INSERT INTO ${table} VALUES (${placeholders})`, tuple);
  }
  return db;
}

/**
 * Exécute une requête et retourne ses tuples.
 * @param {SqlDatabase} db
 * @param {string} sql
 * @returns {Tuple[]}
 */
export function runQuery(db, sql) {
  const results = db.exec(sql);
  return results.length === 0 ? [] : results[results.length - 1].values;
}

/**
 * Compare deux résultats comme ensembles de tuples, sans tenir compte de l'ordre.
 * @param {Tuple[]} engineTuples
 * @param {Tuple[]} sqlTuples
 * @returns {Comparison}
 */
export function compareResults(engineTuples, sqlTuples) {
  const engineKeys = new Set(engineTuples.map(tupleKey));
  const sqlKeys = new Set(sqlTuples.map(tupleKey));
  const onlyEngine = engineTuples.filter((t) => !sqlKeys.has(tupleKey(t)));
  const onlySql = sqlTuples.filter((t) => !engineKeys.has(tupleKey(t)));
  return { identical: onlyEngine.length === 0 && onlySql.length === 0, onlyEngine, onlySql };
}

/**
 * Exécute la requête traduite sur la base et la compare au résultat du moteur.
 * @param {SqlJs} SQL
 * @param {Database} database
 * @param {string} sql
 * @param {Relation} engineResult
 * @returns {Comparison & { sqlTuples: Tuple[] }}
 */
export function verifyWithSql(SQL, database, sql, engineResult) {
  const db = createSqlDatabase(SQL, database);
  try {
    const sqlTuples = runQuery(db, sql);
    return { ...compareResults(engineResult.tuples, sqlTuples), sqlTuples };
  } finally {
    db.close();
  }
}
