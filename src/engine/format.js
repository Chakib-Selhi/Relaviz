/**
 * Mise en forme textuelle de l'arbre : étiquette d'un nœud (affichée dans l'arbre de l'interface)
 * et notation compacte d'un arbre entier (utilisée par les tests et les messages).
 *
 * Les conditions sont écrites en infixe avec le minimum de parenthèses : comme les priorités sont
 * fixées par la grammaire (comparaison > not > and > or), le texte reste non ambigu.
 */

/** @import { Condition, Node, Operand } from './types.js' */

/** Symbole des opérateurs binaires sans paramètre. */
const BINARY_SYMBOLS = {
  product: '×',
  naturalJoin: '⋈',
  union: '∪',
  minus: '−',
  intersect: '∩',
  divide: '÷',
};

/** Priorité des conditions, de la plus faible à la plus forte. */
const CONDITION_PRECEDENCE = { or: 1, and: 2, not: 3, compare: 4 };

/**
 * Écrit un littéral comme dans la syntaxe d'entrée : nombre, `null` ou chaîne entre apostrophes.
 * @param {string | number | null} value
 */
export function formatLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

/** @param {Operand} operand */
export function formatOperand(operand) {
  if (operand.kind === 'literal') return formatLiteral(operand.value);
  return operand.qualifier ? `${operand.qualifier}.${operand.name}` : operand.name;
}

/**
 * @param {Condition} condition
 * @param {number} [parentPrecedence] priorité du contexte ; des parenthèses sont ajoutées au besoin
 * @returns {string}
 */
export function formatCondition(condition, parentPrecedence = 0) {
  const precedence = CONDITION_PRECEDENCE[condition.kind];
  let text;
  switch (condition.kind) {
    case 'compare':
      text =
        condition.op === 'is' || condition.op === 'is not'
          ? `${formatOperand(condition.left)} ${condition.op} null`
          : `${formatOperand(condition.left)} ${condition.op} ${formatOperand(condition.right)}`;
      break;
    case 'not':
      text = `not ${formatCondition(condition.operand, precedence)}`;
      break;
    default:
      // and, or : associatifs à gauche, donc un enfant droit de même priorité garde ses parenthèses.
      text = `${formatCondition(condition.left, precedence)} ${condition.kind} ${formatCondition(
        condition.right,
        precedence + 1,
      )}`;
  }
  return precedence < parentPrecedence ? `(${text})` : text;
}

/**
 * Étiquette d'un nœud seul, sans ses enfants : `σ[annee > 2020]`, `⋈`, `Livre`...
 * @param {Node} node
 * @returns {string}
 */
export function nodeLabel(node) {
  switch (node.kind) {
    case 'relation':
      return node.name;
    case 'select':
      return `σ[${formatCondition(node.condition)}]`;
    case 'project':
      return `π[${node.attributes.join(', ')}]`;
    case 'rename': {
      const parts = [];
      if (node.newName !== undefined) {
        parts.push(
          node.positional ? `${node.newName}(${node.positional.join(', ')})` : node.newName,
        );
      }
      for (const [from, to] of Object.entries(node.mapping)) parts.push(`${from}→${to}`);
      return `ρ[${parts.join(', ')}]`;
    }
    case 'thetaJoin':
      return `⋈[${formatCondition(node.condition)}]`;
    default:
      return BINARY_SYMBOLS[node.kind];
  }
}

/**
 * Notation préfixée compacte d'un arbre entier : `∪(σ[a = 1](R), S)`.
 * @param {Node} node
 * @returns {string}
 */
export function formatNode(node) {
  const label = nodeLabel(node);
  switch (node.kind) {
    case 'relation':
      return label;
    case 'select':
    case 'project':
    case 'rename':
      return `${label}(${formatNode(node.child)})`;
    default:
      return `${label}(${formatNode(node.left)}, ${formatNode(node.right)})`;
  }
}
