/**
 * Point d'entrée public du moteur. L'interface n'appelle que `analyze`, qui enchaîne les trois
 * étapes et ne lève jamais d'exception pour une saisie invalide.
 *
 *   texte ─ parse ─▶ programme ─ checkProgram ─▶ schémas ─ evaluate ─▶ trace
 */

/** @import { Attribute, Node, Program, Relation, TraceStep } from './types.js' */
/** @import { ErrorInfo } from './errors.js' */
/** @import { Database } from './schema-checker.js' */
import { RelaVizError, toErrorInfo } from './errors.js';
import { evaluate } from './evaluator.js';
import { parse } from './parser.js';
import { checkProgram } from './schema-checker.js';

export { parse } from './parser.js';
export { formatCondition, formatNode, nodeLabel } from './format.js';
export { childrenOf } from './evaluator.js';
export { displayNames } from './schema-checker.js';

/**
 * @typedef {object} Analysis
 * @property {true} ok
 * @property {Program} program arbre analysé
 * @property {Map<string, Attribute[]>} schemas schéma de sortie de chaque nœud
 * @property {ErrorInfo[]} warnings avertissements non bloquants
 * @property {TraceStep[]} trace une étape par nœud, en ordre postfixe
 * @property {Map<string, Relation>} results relation de chaque nœud
 * @property {Node | null} root nœud du résultat affiché
 * @property {Relation | null} result relation du résultat affiché
 */

/**
 * @typedef {object} AnalysisFailure
 * @property {false} ok
 * @property {'syntax' | 'schema'} stage étape qui a échoué
 * @property {ErrorInfo} error
 */

/**
 * Analyse, vérifie et évalue un programme sur une base de données.
 * @param {string} text
 * @param {Database} database
 * @returns {Analysis | AnalysisFailure}
 */
export function analyze(text, database) {
  const parsed = parse(text);
  if (!parsed.ok) return { ok: false, stage: 'syntax', error: parsed.error };

  let checked;
  try {
    checked = checkProgram(parsed.program, database);
  } catch (error) {
    if (error instanceof RelaVizError) {
      return { ok: false, stage: 'schema', error: toErrorInfo(error, text) };
    }
    throw error;
  }

  const { trace, results } = evaluate(parsed.program, database, checked.schemas);
  const { root } = checked;
  return {
    ok: true,
    program: parsed.program,
    schemas: checked.schemas,
    warnings: checked.warnings.map((warning) => toErrorInfo(warning, text)),
    trace,
    results,
    root,
    result: root ? (results.get(root.id) ?? null) : null,
  };
}
