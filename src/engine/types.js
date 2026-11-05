/**
 * Modèle de données du moteur, tel que défini dans docs/PRD.md (section « Modèle de données »).
 * Ce fichier ne contient que des types JSDoc : il est vérifié par `npm run typecheck`
 * et importé par les autres modules du moteur avec `@import`.
 *
 * Ajouts par rapport au PRD, décrits dans docs/grammar.md :
 * - `Operand`, référencé par `Condition` mais non détaillé ;
 * - `positional` sur le nœud `rename` (décision D6) ;
 * - `Assignment` et `Program` pour les affectations nommées (décision D7) ;
 * - `Span`, alias de la position `{ start, end }` déjà présente dans `Node`.
 */

/** Position dans le texte saisi : indice de début (inclus) et de fin (exclus). */
/** @typedef {{ start: number, end: number }} Span */

/** @typedef {{ name: string, type: 'number' | 'text' | 'date', source?: string }} Attribute */

/** @typedef {{ name: string, attributes: Attribute[], tuples: Array<Array<string|number|null>> }} Relation */

/**
 * Nœud de l'arbre. kind détermine les champs présents.
 * Pour `rename`, `positional` contient les nouveaux noms de la forme `ρ[L(a, b)]` ; `mapping` est
 * alors vide et le vérificateur de schéma le complète à partir des attributs de l'enfant.
 * @typedef {(
 *   { kind: 'relation', name: string } |
 *   { kind: 'select', condition: Condition, child: Node } |
 *   { kind: 'project', attributes: string[], child: Node } |
 *   { kind: 'rename', mapping: Record<string,string>, newName?: string, positional?: string[], child: Node } |
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

/**
 * Affectation nommée : `Nom := expression`.
 * @typedef {{ name: string, expression: Node, span: Span }} Assignment
 */

/**
 * Programme analysé : les affectations dans l'ordre, puis l'expression finale (`null` si absente).
 * Sans expression finale, le résultat affiché est celui de la dernière affectation.
 * @typedef {{ assignments: Assignment[], result: Node | null }} Program
 */

export {};
