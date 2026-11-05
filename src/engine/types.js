/**
 * Modèle de données du moteur, tel que défini dans docs/PRD.md (section « Modèle de données »).
 * Ce fichier ne contient que des types JSDoc : il est vérifié par `npm run typecheck`
 * et importé par les autres modules du moteur avec `@import`.
 *
 * Seul ajout par rapport au PRD : `Operand`, référencé par `Condition` mais non détaillé.
 * Voir docs/grammar.md, section « Correspondance avec l'arbre syntaxique ».
 */

/** @typedef {{ name: string, type: 'number' | 'text' | 'date', source?: string }} Attribute */

/** @typedef {{ name: string, attributes: Attribute[], tuples: Array<Array<string|number|null>> }} Relation */

/**
 * Nœud de l'arbre. kind détermine les champs présents.
 * @typedef {(
 *   { kind: 'relation', name: string } |
 *   { kind: 'select', condition: Condition, child: Node } |
 *   { kind: 'project', attributes: string[], child: Node } |
 *   { kind: 'rename', mapping: Record<string,string>, newName?: string, child: Node } |
 *   { kind: 'product' | 'naturalJoin' | 'union' | 'minus' | 'intersect' | 'divide', left: Node, right: Node } |
 *   { kind: 'thetaJoin', condition: Condition, left: Node, right: Node }
 * ) & { id: string, span: { start: number, end: number } }} Node
 */

/** @typedef {{ kind: 'compare', op: string, left: Operand, right: Operand } | { kind: 'and' | 'or', left: Condition, right: Condition } | { kind: 'not', operand: Condition }} Condition */

/**
 * Opérande d'une comparaison : référence d'attribut (éventuellement qualifiée) ou littéral.
 * @typedef {(
 *   { kind: 'attribute', name: string, qualifier?: string } |
 *   { kind: 'literal', value: string | number | null }
 * ) & { span: { start: number, end: number } }} Operand
 */

/** @typedef {{ nodeId: string, result: Relation, durationMs: number }} TraceStep */

export {};
