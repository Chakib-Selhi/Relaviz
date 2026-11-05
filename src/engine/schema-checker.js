/**
 * Vérificateur de schéma (docs/semantics.md).
 *
 * Il parcourt l'arbre en ordre postfixe et calcule le schéma de sortie de chaque nœud : les
 * attributs (nom, type, source) que produira l'opération. Il s'arrête à la première erreur de
 * nom, de type ou de compatibilité, en levant une `RelaVizError` positionnée. Les cas suspects
 * mais valides (jointure naturelle sans attribut commun) deviennent des avertissements.
 *
 * L'évaluateur ne s'exécute qu'après cette vérification : il peut donc supposer que chaque
 * référence d'attribut désigne exactement un attribut et que chaque comparaison est bien typée.
 */

/** @import { Attribute, Condition, Node, Operand, Program, Relation, Span } from './types.js' */
import { RelaVizError } from './errors.js';
import { formatOperand } from './format.js';

/** @typedef {{ relations: Relation[] }} Database */

/**
 * Résultat de la vérification.
 * @typedef {object} CheckResult
 * @property {Map<string, Attribute[]>} schemas schéma de sortie de chaque nœud, par identifiant
 * @property {RelaVizError[]} warnings avertissements non bloquants
 * @property {Node | null} root nœud dont le résultat est affiché (expression finale ou dernière affectation)
 */

/** Nom des types dans les messages. */
const TYPE_NAMES = { number: 'nombre', text: 'texte', date: 'date' };

/** Symbole des opérateurs binaires dans les messages. */
const OPERATOR_SYMBOLS = { union: '∪', minus: '−', intersect: '∩' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vérifie un programme analysé sur une base de données.
 * @param {Program} program
 * @param {Database} database
 * @returns {CheckResult}
 * @throws {RelaVizError} à la première erreur de schéma
 */
export function checkProgram(program, database) {
  return new SchemaChecker(program, database).run();
}

/**
 * Indices des attributs qui correspondent à une référence (`titre` ou `Livre.titre`).
 * @param {Attribute[]} schema
 * @param {string} name
 * @param {string} [qualifier]
 * @returns {number[]}
 */
export function matchingAttributes(schema, name, qualifier) {
  /** @type {number[]} */
  const indices = [];
  schema.forEach((attribute, index) => {
    if (attribute.name === name && (qualifier === undefined || attribute.source === qualifier)) {
      indices.push(index);
    }
  });
  return indices;
}

/**
 * Découpe une référence écrite `Livre.titre` ou `titre` (forme stockée par la projection).
 * @param {string} reference
 * @returns {{ name: string, qualifier?: string }}
 */
export function splitReference(reference) {
  const dot = reference.indexOf('.');
  return dot < 0
    ? { name: reference }
    : { qualifier: reference.slice(0, dot), name: reference.slice(dot + 1) };
}

/**
 * Nom le plus proche parmi les candidats, pour proposer une correction : même nom à la casse
 * près, sinon distance d'édition d'au plus un tiers de la longueur.
 * @param {string} name
 * @param {Iterable<string>} candidates
 * @returns {string | undefined}
 */
export function closestName(name, candidates) {
  const list = [...candidates];
  const sameIgnoringCase = list.find((c) => c.toLowerCase() === name.toLowerCase());
  if (sameIgnoringCase) return sameIgnoringCase;
  const maxDistance = Math.max(1, Math.floor(name.length / 3));
  let best;
  let bestDistance = Infinity;
  for (const candidate of list) {
    const distance = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance <= maxDistance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Distance de Levenshtein (insertion, suppression, substitution).
 * @param {string} a
 * @param {string} b
 */
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length];
}

/** @param {string | undefined} candidate */
const didYouMean = (candidate) => (candidate ? `Vouliez-vous dire « ${candidate} » ?` : '');

/**
 * Liste lisible : « a », « b » ou « c ».
 * @param {string[]} items
 */
const quotedList = (items) => {
  const quoted = items.map((item) => `« ${item} »`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} ou ${quoted.at(-1)}` : quoted[0];
};

/** @param {string} value */
function isValidDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

class SchemaChecker {
  /**
   * @param {Program} program
   * @param {Database} database
   */
  constructor(program, database) {
    this.program = program;
    /** @type {Map<string, Attribute[]>} relations de la base, attributs avec leur source */
    this.base = new Map(
      database.relations.map((relation) => [
        relation.name,
        relation.attributes.map((a) => ({ name: a.name, type: a.type, source: relation.name })),
      ]),
    );
    /** @type {Map<string, Attribute[]>} résultats nommés déjà définis */
    this.named = new Map();
    /** @type {Map<string, Attribute[]>} */
    this.schemas = new Map();
    /** @type {RelaVizError[]} */
    this.warnings = [];
  }

  /** @returns {CheckResult} */
  run() {
    for (const assignment of this.program.assignments) {
      const { name } = assignment;
      const nameSpan = { start: assignment.span.start, end: assignment.span.start + name.length };
      if (this.base.has(name))
        throw new RelaVizError('ASSIGNMENT_SHADOWS_RELATION', nameSpan, { name });
      if (this.named.has(name)) throw new RelaVizError('DUPLICATE_ASSIGNMENT', nameSpan, { name });
      this.named.set(name, nameResult(this.check(assignment.expression), name));
    }
    if (this.program.result) this.check(this.program.result);
    const root = this.program.result ?? this.program.assignments.at(-1)?.expression ?? null;
    return { schemas: this.schemas, warnings: this.warnings, root };
  }

  /**
   * Calcule (et mémorise) le schéma de sortie d'un nœud.
   * @param {Node} node
   * @returns {Attribute[]}
   */
  check(node) {
    const schema = this.schemaOf(node);
    this.schemas.set(node.id, schema);
    return schema;
  }

  /**
   * @param {Node} node
   * @returns {Attribute[]}
   */
  schemaOf(node) {
    switch (node.kind) {
      case 'relation':
        return this.relationSchema(node.name, node.span);
      case 'select': {
        const schema = this.check(node.child);
        this.checkCondition(node.condition, schema);
        return schema;
      }
      case 'project': {
        const schema = this.check(node.child);
        const span = headSpan(node.span, node.child.span);
        const result = node.attributes.map((reference) => {
          const { name, qualifier } = splitReference(reference);
          return schema[this.resolve(schema, name, qualifier, span)];
        });
        return ensureUnique(result, span, 'Citez chaque attribut une seule fois.');
      }
      case 'rename':
        return this.renameSchema(node, this.check(node.child));
      case 'product':
      case 'thetaJoin': {
        const result = [...this.check(node.left), ...this.check(node.right)];
        ensureUnique(
          result,
          node.span,
          'Renommez une des deux opérandes avec ρ, par exemple ρ[L2](Livre).',
        );
        if (node.kind === 'thetaJoin') this.checkCondition(node.condition, result);
        return result;
      }
      case 'naturalJoin':
        return this.naturalJoinSchema(node, this.check(node.left), this.check(node.right));
      case 'divide':
        return this.divisionSchema(node, this.check(node.left), this.check(node.right));
      default:
        return this.setOperationSchema(
          /** @type {'union' | 'minus' | 'intersect'} */ (node.kind),
          node.span,
          this.check(node.left),
          this.check(node.right),
        );
    }
  }

  /**
   * @param {string} name
   * @param {Span} span
   * @returns {Attribute[]}
   */
  relationSchema(name, span) {
    const schema = this.named.get(name) ?? this.base.get(name);
    if (schema) return schema;
    if (this.program.assignments.some((a) => a.name === name)) {
      throw new RelaVizError('USED_BEFORE_DEFINITION', span, { name });
    }
    const hint = didYouMean(closestName(name, [...this.base.keys(), ...this.named.keys()]));
    throw new RelaVizError('UNKNOWN_RELATION', span, { name, hint });
  }

  /**
   * @param {Extract<Node, { kind: 'rename' }>} node
   * @param {Attribute[]} schema
   * @returns {Attribute[]}
   */
  renameSchema(node, schema) {
    const span = headSpan(node.span, node.child.span);
    let result = schema.map((attribute) => ({ ...attribute }));

    if (node.positional) {
      if (node.positional.length !== schema.length) {
        throw new RelaVizError('RENAME_ARITY', span, {
          expected: String(schema.length),
          found: String(node.positional.length),
        });
      }
      const names = node.positional;
      result = result.map((attribute, i) => ({ ...attribute, name: names[i] }));
    }

    /** @type {Set<number>} */
    const renamed = new Set();
    for (const [reference, target] of Object.entries(node.mapping)) {
      const { name, qualifier } = splitReference(reference);
      const index = this.resolve(schema, name, qualifier, span);
      if (renamed.has(index)) {
        throw new RelaVizError('DUPLICATE_RENAME', span, { attribute: reference });
      }
      renamed.add(index);
      result[index] = { ...result[index], name: target };
    }

    if (node.newName !== undefined) {
      const source = node.newName;
      result = result.map((attribute) => ({ ...attribute, source }));
    }
    return ensureUnique(result, span, 'Choisissez des noms distincts.');
  }

  /**
   * Jointure naturelle : attributs de gauche, puis ceux de droite qui ne sont pas communs.
   * @param {Node} node
   * @param {Attribute[]} left
   * @param {Attribute[]} right
   * @returns {Attribute[]}
   */
  naturalJoinSchema(node, left, right) {
    const commonNames = new Set(
      right.map((a) => a.name).filter((name) => left.some((a) => a.name === name)),
    );
    for (const name of commonNames) {
      const leftAttribute = left[this.resolve(left, name, undefined, node.span)];
      const rightAttribute = right[this.resolve(right, name, undefined, node.span)];
      if (leftAttribute.type !== rightAttribute.type) {
        throw new RelaVizError('COMMON_ATTRIBUTE_TYPE_MISMATCH', node.span, {
          operator: '⋈',
          name,
          left: TYPE_NAMES[leftAttribute.type],
          right: TYPE_NAMES[rightAttribute.type],
        });
      }
    }
    if (commonNames.size === 0) {
      this.warnings.push(new RelaVizError('NATURAL_JOIN_AS_PRODUCT', node.span));
    }
    const result = [...left, ...right.filter((a) => !commonNames.has(a.name))];
    return ensureUnique(result, node.span, 'Renommez une des deux opérandes avec ρ.');
  }

  /**
   * Division R ÷ S : attributs de R absents de S.
   * @param {Node} node
   * @param {Attribute[]} dividend
   * @param {Attribute[]} divisor
   * @returns {Attribute[]}
   */
  divisionSchema(node, dividend, divisor) {
    /** @type {Set<number>} */
    const used = new Set();
    for (const attribute of divisor) {
      const matches = matchingAttributes(dividend, attribute.name);
      if (matches.length === 0) {
        throw new RelaVizError('DIVISION_MISSING_ATTRIBUTE', node.span, { name: attribute.name });
      }
      const index = this.resolve(dividend, attribute.name, undefined, node.span);
      if (dividend[index].type !== attribute.type) {
        throw new RelaVizError('COMMON_ATTRIBUTE_TYPE_MISMATCH', node.span, {
          operator: '÷',
          name: attribute.name,
          left: TYPE_NAMES[dividend[index].type],
          right: TYPE_NAMES[attribute.type],
        });
      }
      used.add(index);
    }
    const result = dividend.filter((_, i) => !used.has(i));
    if (result.length === 0) throw new RelaVizError('DIVISION_NO_REMAINING_ATTRIBUTE', node.span);
    return result;
  }

  /**
   * ∪ − ∩ : même nombre d'attributs et mêmes types, position par position (S2).
   * @param {'union' | 'minus' | 'intersect'} kind
   * @param {Span} span
   * @param {Attribute[]} left
   * @param {Attribute[]} right
   * @returns {Attribute[]}
   */
  setOperationSchema(kind, span, left, right) {
    const operator = OPERATOR_SYMBOLS[kind];
    if (left.length !== right.length) {
      throw new RelaVizError('INCOMPATIBLE_ARITY', span, {
        operator,
        left: String(left.length),
        right: String(right.length),
      });
    }
    left.forEach((attribute, i) => {
      if (attribute.type !== right[i].type) {
        throw new RelaVizError('INCOMPATIBLE_TYPES', span, {
          operator,
          position: String(i + 1),
          left: `${attribute.name} : ${TYPE_NAMES[attribute.type]}`,
          right: `${right[i].name} : ${TYPE_NAMES[right[i].type]}`,
        });
      }
    });
    return left;
  }

  /**
   * Vérifie les noms et les types d'une condition (S3).
   * @param {Condition} condition
   * @param {Attribute[]} schema
   */
  checkCondition(condition, schema) {
    switch (condition.kind) {
      case 'and':
      case 'or':
        this.checkCondition(condition.left, schema);
        this.checkCondition(condition.right, schema);
        return;
      case 'not':
        this.checkCondition(condition.operand, schema);
        return;
      default: {
        const leftType = this.operandType(condition.left, schema);
        if (condition.op === 'is' || condition.op === 'is not') return;
        const rightType = this.operandType(condition.right, schema);
        this.checkComparable(condition.left, leftType, condition.right, rightType);
      }
    }
  }

  /**
   * Type d'un opérande : type de l'attribut, `number` ou `string` pour un littéral.
   * @param {Operand} operand
   * @param {Attribute[]} schema
   * @returns {'number' | 'text' | 'date' | 'string'}
   */
  operandType(operand, schema) {
    if (operand.kind === 'attribute') {
      return schema[this.resolve(schema, operand.name, operand.qualifier, operand.span)].type;
    }
    return typeof operand.value === 'number' ? 'number' : 'string';
  }

  /**
   * @param {Operand} left
   * @param {'number' | 'text' | 'date' | 'string'} leftType
   * @param {Operand} right
   * @param {'number' | 'text' | 'date' | 'string'} rightType
   */
  checkComparable(left, leftType, right, rightType) {
    // Une chaîne littérale se compare à un texte, ou à une date si elle en est une.
    for (const [operand, own, other] of /** @type {const} */ ([
      [left, leftType, rightType],
      [right, rightType, leftType],
    ])) {
      if (own === 'string' && other === 'date' && operand.kind === 'literal') {
        const value = String(operand.value);
        if (!isValidDate(value)) throw new RelaVizError('INVALID_DATE', operand.span, { value });
      }
    }
    const normalize = (/** @type {string} */ type) => (type === 'string' ? 'text' : type);
    const compatible =
      normalize(leftType) === normalize(rightType) ||
      (leftType === 'date' && rightType === 'string') ||
      (leftType === 'string' && rightType === 'date');
    if (!compatible) {
      const typeName = (/** @type {string} */ type) =>
        type === 'string' ? 'texte' : TYPE_NAMES[/** @type {'number' | 'text' | 'date'} */ (type)];
      throw new RelaVizError(
        'TYPE_MISMATCH',
        { start: left.span.start, end: right.span.end },
        {
          left: formatOperand(left),
          leftType: typeName(leftType),
          right: formatOperand(right),
          rightType: typeName(rightType),
        },
      );
    }
  }

  /**
   * Résout une référence d'attribut en un indice unique, ou lève l'erreur adaptée.
   * @param {Attribute[]} schema
   * @param {string} name
   * @param {string | undefined} qualifier
   * @param {Span} span
   * @returns {number}
   */
  resolve(schema, name, qualifier, span) {
    const matches = matchingAttributes(schema, name, qualifier);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const candidates = matches.map((i) => `${schema[i].source}.${name}`);
      throw new RelaVizError('AMBIGUOUS_ATTRIBUTE', span, {
        name,
        candidates: quotedList(candidates),
      });
    }
    const sources = [...new Set(schema.map((a) => a.source ?? ''))];
    if (qualifier !== undefined && !sources.includes(qualifier)) {
      throw new RelaVizError('UNKNOWN_QUALIFIER', span, {
        name,
        qualifier,
        available: sources.join(', '),
      });
    }
    const reference = qualifier === undefined ? name : `${qualifier}.${name}`;
    const candidates = schema
      .filter((a) => qualifier === undefined || a.source === qualifier)
      .map((a) => a.name);
    throw new RelaVizError('UNKNOWN_ATTRIBUTE', span, {
      name: reference,
      available: displayNames(schema).join(', '),
      hint: didYouMean(closestName(name, candidates)),
    });
  }
}

/**
 * Noms affichés : qualifiés seulement quand le nom existe plusieurs fois.
 * @param {Attribute[]} schema
 */
export function displayNames(schema) {
  return schema.map((attribute) =>
    schema.filter((a) => a.name === attribute.name).length > 1
      ? `${attribute.source}.${attribute.name}`
      : attribute.name,
  );
}

/**
 * Schéma d'un résultat nommé : la source devient le nom de l'affectation, sauf pour les noms
 * présents plusieurs fois, qui gardent leur source d'origine pour rester distinguables.
 * @param {Attribute[]} schema
 * @param {string} name
 * @returns {Attribute[]}
 */
function nameResult(schema, name) {
  return schema.map((attribute) =>
    schema.filter((a) => a.name === attribute.name).length > 1
      ? attribute
      : { ...attribute, source: name },
  );
}

/**
 * Lève une erreur si deux attributs ont le même nom et la même source.
 * @param {Attribute[]} schema
 * @param {Span} span
 * @param {string} hint
 * @returns {Attribute[]}
 */
function ensureUnique(schema, span, hint) {
  const seen = new Set();
  for (const attribute of schema) {
    const key = `${attribute.source}.${attribute.name}`;
    if (seen.has(key))
      throw new RelaVizError('DUPLICATE_ATTRIBUTE', span, { attribute: key, hint });
    seen.add(key);
  }
  return schema;
}

/**
 * Partie d'un opérateur unaire à souligner : l'opérateur et ses paramètres, sans l'opérande.
 * @param {Span} span
 * @param {Span} childSpan
 * @returns {Span}
 */
function headSpan(span, childSpan) {
  return { start: span.start, end: Math.max(span.start + 1, childSpan.start) };
}
