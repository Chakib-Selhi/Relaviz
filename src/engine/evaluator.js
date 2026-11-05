/**
 * Évaluateur (docs/semantics.md, §5 et §7).
 *
 * Il exécute un programme déjà vérifié : chaque nœud est calculé en ordre postfixe, après ses
 * enfants, et produit un `TraceStep` (la relation obtenue et la durée de l'opération seule).
 * Les doublons sont éliminés après chaque opération (sémantique d'ensemble) et les conditions
 * suivent la logique à trois valeurs du SQL.
 */

/** @import { Attribute, Condition, Node, Operand, Program, Relation, TraceStep } from './types.js' */
/** @import { Database } from './schema-checker.js' */
import { nodeLabel } from './format.js';
import { matchingAttributes, splitReference } from './schema-checker.js';

/** @typedef {string | number | null} Value */
/** @typedef {Value[]} Tuple */
/** Valeur d'une condition : vrai, faux ou inconnu (`null`). */
/** @typedef {boolean | null} Truth */

/**
 * @typedef {object} Evaluation
 * @property {TraceStep[]} trace une étape par nœud, en ordre postfixe (affectations d'abord)
 * @property {Map<string, Relation>} results relation calculée pour chaque nœud, par identifiant
 */

const timer = /** @type {{ performance?: { now(): number } }} */ (globalThis).performance;
const now = () => (timer ? timer.now() : Date.now());

/**
 * Clé d'un tuple pour les ensembles : distingue 1 de '1' et rend deux NULL égaux (S4).
 * @param {Tuple} tuple
 */
export const tupleKey = (tuple) => JSON.stringify(tuple);

/**
 * Élimine les doublons en gardant le premier exemplaire de chaque tuple.
 * @param {Tuple[]} tuples
 * @returns {Tuple[]}
 */
export function distinct(tuples) {
  const seen = new Set();
  return tuples.filter((tuple) => {
    const key = tupleKey(tuple);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Évalue un programme vérifié.
 * @param {Program} program
 * @param {Database} database
 * @param {Map<string, Attribute[]>} schemas schémas calculés par le vérificateur
 * @returns {Evaluation}
 */
export function evaluate(program, database, schemas) {
  return new Evaluator(database, schemas).run(program);
}

class Evaluator {
  /**
   * @param {Database} database
   * @param {Map<string, Attribute[]>} schemas
   */
  constructor(database, schemas) {
    /** @type {Map<string, Tuple[]>} */
    this.tables = new Map(database.relations.map((r) => [r.name, r.tuples]));
    this.schemas = schemas;
    /** @type {TraceStep[]} */
    this.trace = [];
    /** @type {Map<string, Relation>} */
    this.results = new Map();
  }

  /**
   * @param {Program} program
   * @returns {Evaluation}
   */
  run(program) {
    for (const assignment of program.assignments) {
      // Un résultat nommé masque ensuite toute référence à ce nom.
      this.tables.set(assignment.name, this.evaluate(assignment.expression).tuples);
    }
    if (program.result) this.evaluate(program.result);
    return { trace: this.trace, results: this.results };
  }

  /**
   * @param {Node} node
   * @returns {Relation}
   */
  evaluate(node) {
    const children = childrenOf(node).map((child) => this.evaluate(child).tuples);
    const start = now();
    const tuples = distinct(this.compute(node, children));
    const result = { name: nodeLabel(node), attributes: this.schema(node), tuples };
    this.trace.push({ nodeId: node.id, result, durationMs: now() - start });
    this.results.set(node.id, result);
    return result;
  }

  /** @param {Node} node */
  schema(node) {
    return /** @type {Attribute[]} */ (this.schemas.get(node.id));
  }

  /**
   * Calcule les tuples d'un nœud à partir de ceux de ses enfants.
   * @param {Node} node
   * @param {Tuple[][]} children tuples des enfants, dans l'ordre
   * @returns {Tuple[]}
   */
  compute(node, children) {
    const [first, second] = children;
    switch (node.kind) {
      case 'relation':
        return /** @type {Tuple[]} */ (this.tables.get(node.name));
      case 'select': {
        const test = compileCondition(node.condition, this.schema(node.child));
        return first.filter((tuple) => test(tuple) === true);
      }
      case 'project': {
        const schema = this.schema(node.child);
        const indices = node.attributes.map((reference) => {
          const { name, qualifier } = splitReference(reference);
          return matchingAttributes(schema, name, qualifier)[0];
        });
        return first.map((tuple) => indices.map((i) => tuple[i]));
      }
      case 'rename':
        return first;
      case 'product':
        return first.flatMap((l) => second.map((r) => [...l, ...r]));
      case 'thetaJoin': {
        const test = compileCondition(node.condition, this.schema(node));
        return first
          .flatMap((l) => second.map((r) => [...l, ...r]))
          .filter((t) => test(t) === true);
      }
      case 'naturalJoin':
        return naturalJoin(this.schema(node.left), this.schema(node.right), first, second);
      case 'union':
        return [...first, ...second];
      case 'minus': {
        const excluded = new Set(second.map(tupleKey));
        return first.filter((tuple) => !excluded.has(tupleKey(tuple)));
      }
      case 'intersect': {
        const kept = new Set(second.map(tupleKey));
        return first.filter((tuple) => kept.has(tupleKey(tuple)));
      }
      case 'divide':
        return divide(this.schema(node.left), this.schema(node.right), first, second);
    }
  }
}

/**
 * @param {Node} node
 * @returns {Node[]}
 */
export function childrenOf(node) {
  switch (node.kind) {
    case 'relation':
      return [];
    case 'select':
    case 'project':
    case 'rename':
      return [node.child];
    default:
      return [node.left, node.right];
  }
}

/**
 * Jointure par hachage sur les attributs de même nom. Une clé contenant NULL n'associe rien.
 * @param {Attribute[]} leftSchema
 * @param {Attribute[]} rightSchema
 * @param {Tuple[]} left
 * @param {Tuple[]} right
 * @returns {Tuple[]}
 */
function naturalJoin(leftSchema, rightSchema, left, right) {
  /** @type {Array<[number, number]>} paires (indice à gauche, indice à droite) */
  const common = [];
  rightSchema.forEach((attribute, r) => {
    const l = leftSchema.findIndex((a) => a.name === attribute.name);
    if (l >= 0) common.push([l, r]);
  });
  const commonRight = new Set(common.map(([, r]) => r));

  /** @type {Map<string, Tuple[]>} */
  const index = new Map();
  for (const tuple of right) {
    const key = common.map(([, r]) => tuple[r]);
    if (key.includes(null)) continue;
    const rest = tuple.filter((_, i) => !commonRight.has(i));
    const bucket = index.get(tupleKey(key));
    if (bucket) bucket.push(rest);
    else index.set(tupleKey(key), [rest]);
  }

  return left.flatMap((tuple) => {
    const key = common.map(([l]) => tuple[l]);
    if (key.includes(null)) return [];
    return (index.get(tupleKey(key)) ?? []).map((rest) => [...tuple, ...rest]);
  });
}

/**
 * Division : regroupe le dividende sur les attributs restants et garde les groupes qui
 * contiennent toutes les valeurs du diviseur.
 * @param {Attribute[]} dividendSchema
 * @param {Attribute[]} divisorSchema
 * @param {Tuple[]} dividend
 * @param {Tuple[]} divisor
 * @returns {Tuple[]}
 */
function divide(dividendSchema, divisorSchema, dividend, divisor) {
  const divisorIndices = divisorSchema.map((a) =>
    dividendSchema.findIndex((d) => d.name === a.name),
  );
  const used = new Set(divisorIndices);
  const kept = dividendSchema.map((_, i) => i).filter((i) => !used.has(i));
  const required = new Set(divisor.map(tupleKey));

  /** @type {Map<string, { values: Tuple, found: Set<string> }>} */
  const groups = new Map();
  for (const tuple of dividend) {
    const values = kept.map((i) => tuple[i]);
    const key = tupleKey(values);
    let group = groups.get(key);
    if (!group) {
      group = { values, found: new Set() };
      groups.set(key, group);
    }
    group.found.add(tupleKey(divisorIndices.map((i) => tuple[i])));
  }

  return [...groups.values()]
    .filter((group) => [...required].every((key) => group.found.has(key)))
    .map((group) => group.values);
}

/**
 * Compile une condition en fonction : les références d'attributs sont résolues une seule fois.
 * @param {Condition} condition
 * @param {Attribute[]} schema
 * @returns {(tuple: Tuple) => Truth}
 */
export function compileCondition(condition, schema) {
  switch (condition.kind) {
    case 'and': {
      const left = compileCondition(condition.left, schema);
      const right = compileCondition(condition.right, schema);
      return (tuple) => and(left(tuple), right(tuple));
    }
    case 'or': {
      const left = compileCondition(condition.left, schema);
      const right = compileCondition(condition.right, schema);
      return (tuple) => or(left(tuple), right(tuple));
    }
    case 'not': {
      const operand = compileCondition(condition.operand, schema);
      return (tuple) => not(operand(tuple));
    }
    default: {
      const left = compileOperand(condition.left, schema);
      const right = compileOperand(condition.right, schema);
      const { op } = condition;
      if (op === 'is') return (tuple) => left(tuple) === null;
      if (op === 'is not') return (tuple) => left(tuple) !== null;
      return (tuple) => compare(left(tuple), op, right(tuple));
    }
  }
}

/**
 * @param {Operand} operand
 * @param {Attribute[]} schema
 * @returns {(tuple: Tuple) => Value}
 */
function compileOperand(operand, schema) {
  if (operand.kind === 'literal') {
    const { value } = operand;
    return () => value;
  }
  const index = matchingAttributes(schema, operand.name, operand.qualifier)[0];
  return (tuple) => tuple[index];
}

/**
 * Comparaison à trois valeurs : inconnu dès qu'un opérande vaut NULL.
 * @param {Value} left
 * @param {string} op
 * @param {Value} right
 * @returns {Truth}
 */
export function compare(left, op, right) {
  if (left === null || right === null) return null;
  switch (op) {
    case '=':
      return left === right;
    case '<>':
      return left !== right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    default:
      return left >= right;
  }
}

/** Tables de Kleene. */
/** @type {(a: Truth, b: Truth) => Truth} */
export const and = (a, b) =>
  a === false || b === false ? false : a === null || b === null ? null : true;
/** @type {(a: Truth, b: Truth) => Truth} */
export const or = (a, b) =>
  a === true || b === true ? true : a === null || b === null ? null : false;
/** @type {(a: Truth) => Truth} */
export const not = (a) => (a === null ? null : !a);
