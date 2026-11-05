/**
 * Traducteur SQL (docs/semantics.md, §8).
 *
 * Chaque nœud non feuille devient une CTE `WITH`, dans l'ordre postfixe du mode pas à pas : la
 * requête se lit donc étape par étape, comme l'arbre. L'en-tête de chaque CTE nomme ses colonnes
 * (`n3(titre, nom) AS (...)`), ce qui règle les noms en double après un produit : ils deviennent
 * `"Livre.idAuteur"` et `"Auteur.idAuteur"`, comme dans les tables de l'interface.
 *
 * La traduction suit la sémantique d'ensemble du moteur : `DISTINCT` partout, `UNION`, `EXCEPT`
 * et `INTERSECT` pour les opérations ensemblistes, et une double négation `NOT EXISTS` avec `IS`
 * (égalité qui considère deux NULL égaux) pour la division.
 */

/** @import { Attribute, Condition, Node, Operand, Program } from './types.js' */
import { childrenOf } from './evaluator.js';
import { formatLiteral, nodeLabel } from './format.js';
import { displayNames, matchingAttributes, splitReference } from './schema-checker.js';

/**
 * @typedef {object} SqlStep
 * @property {string} nodeId nœud traduit
 * @property {string} name nom de la CTE (identifiant du nœud ou nom de l'affectation)
 * @property {string} sql définition de la CTE, sans le nom
 */

/**
 * @typedef {object} SqlTranslation
 * @property {string} sql requête complète
 * @property {SqlStep[]} steps une CTE par nœud non feuille, en ordre postfixe
 * @property {string[]} ctes texte de chaque CTE (`nom(colonnes) AS (...)`), dans le même ordre
 */

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Mots réservés SQL qui doivent être entre guillemets s'ils servent de nom. */
const SQL_KEYWORDS = new Set(
  (
    'all and as between by case cross distinct else end except exists from group having in ' +
    'inner intersect is join left limit natural not null on or order outer right select ' +
    'table then union using values when where with'
  ).split(' '),
);

/**
 * Écrit un identifiant SQL, entre guillemets seulement si nécessaire.
 * @param {string} name
 */
export function quoteIdentifier(name) {
  return SIMPLE_IDENTIFIER.test(name) && !SQL_KEYWORDS.has(name.toLowerCase())
    ? name
    : `"${name.replaceAll('"', '""')}"`;
}

/**
 * Traduit un programme vérifié en SQL.
 * @param {Program} program
 * @param {Map<string, Attribute[]>} schemas schémas calculés par le vérificateur
 * @returns {SqlTranslation | null} `null` pour un programme vide
 */
export function translateProgram(program, schemas) {
  return new SqlTranslator(schemas).run(program);
}

/**
 * Requête qui retourne le résultat d'une étape intermédiaire : toutes les CTE, puis la CTE voulue.
 * Sert à vérifier chaque nœud avec SQLite et à afficher le SQL d'une étape dans l'interface.
 * @param {SqlTranslation} translation
 * @param {string} name nom de la CTE (identifiant du nœud ou nom de l'affectation)
 */
export function queryForStep(translation, name) {
  return `WITH\n${translation.ctes.join(',\n')}\nSELECT * FROM ${quoteIdentifier(name)};`;
}

class SqlTranslator {
  /** @param {Map<string, Attribute[]>} schemas */
  constructor(schemas) {
    this.schemas = schemas;
    /** @type {SqlStep[]} */
    this.steps = [];
  }

  /**
   * @param {Program} program
   * @returns {SqlTranslation | null}
   */
  run(program) {
    for (const assignment of program.assignments) {
      const source = this.translate(assignment.expression);
      this.steps.push({
        nodeId: assignment.expression.id,
        name: assignment.name,
        sql: `SELECT * FROM ${source}`,
      });
    }
    const last = program.assignments.at(-1);
    let final;
    if (program.result) final = this.translate(program.result);
    else if (last) final = quoteIdentifier(last.name);
    else return null;

    const select = `SELECT * FROM ${final}`;
    if (this.steps.length === 0) return { sql: `${select};`, steps: [], ctes: [] };
    const ctes = this.steps.map(
      (step) =>
        `${quoteIdentifier(step.name)}(${this.columnsOf(step.nodeId).join(', ')}) AS (\n  ${step.sql.replaceAll('\n', '\n  ')}\n)`,
    );
    return { sql: `WITH\n${ctes.join(',\n')}\n${select};`, steps: this.steps, ctes };
  }

  /**
   * Traduit un nœud et retourne le nom à utiliser dans FROM (table, affectation ou CTE).
   * @param {Node} node
   * @returns {string}
   */
  translate(node) {
    const sources = childrenOf(node).map((child) => this.translate(child));
    if (node.kind === 'relation') return quoteIdentifier(node.name);
    this.steps.push({ nodeId: node.id, name: node.id, sql: this.select(node, sources) });
    return node.id;
  }

  /**
   * Colonnes d'un nœud, déjà écrites en SQL.
   * @param {string} nodeId
   */
  columnsOf(nodeId) {
    return displayNames(this.schema(nodeId)).map(quoteIdentifier);
  }

  /** @param {string} nodeId */
  schema(nodeId) {
    return /** @type {Attribute[]} */ (this.schemas.get(nodeId));
  }

  /**
   * Requête SELECT d'un nœud non feuille. Le commentaire rappelle l'opérateur de l'arbre.
   * @param {Exclude<Node, { kind: 'relation' }>} node
   * @param {string[]} sources noms des enfants
   * @returns {string}
   */
  select(node, sources) {
    const [left, right] = sources;
    const comment = `-- ${nodeLabel(node)}\n`;
    switch (node.kind) {
      case 'select': {
        const columns = this.columnsOf(node.child.id);
        const condition = this.condition(
          node.condition,
          this.schema(node.child.id),
          (i) => columns[i],
        );
        return `${comment}SELECT DISTINCT * FROM ${left}\nWHERE ${condition}`;
      }
      case 'project': {
        const schema = this.schema(node.child.id);
        const columns = this.columnsOf(node.child.id);
        const selected = node.attributes.map((reference) => {
          const { name, qualifier } = splitReference(reference);
          return columns[matchingAttributes(schema, name, qualifier)[0]];
        });
        return `${comment}SELECT DISTINCT ${selected.join(', ')} FROM ${left}`;
      }
      case 'rename':
        return `${comment}SELECT DISTINCT * FROM ${left}`;
      case 'product':
        return `${comment}SELECT DISTINCT l.*, r.* FROM ${left} AS l CROSS JOIN ${right} AS r`;
      case 'thetaJoin': {
        const leftColumns = this.columnsOf(node.left.id);
        const rightColumns = this.columnsOf(node.right.id);
        const condition = this.condition(node.condition, this.schema(node.id), (i) =>
          i < leftColumns.length
            ? `l.${leftColumns[i]}`
            : `r.${rightColumns[i - leftColumns.length]}`,
        );
        return `${comment}SELECT DISTINCT l.*, r.* FROM ${left} AS l\nJOIN ${right} AS r ON ${condition}`;
      }
      case 'naturalJoin':
        return comment + this.naturalJoin(node.left.id, node.right.id, left, right);
      case 'union':
        return `${comment}SELECT * FROM ${left}\nUNION\nSELECT * FROM ${right}`;
      case 'minus':
        return `${comment}SELECT * FROM ${left}\nEXCEPT\nSELECT * FROM ${right}`;
      case 'intersect':
        return `${comment}SELECT * FROM ${left}\nINTERSECT\nSELECT * FROM ${right}`;
      case 'divide':
        return comment + this.division(node.left.id, node.right.id, left, right);
    }
  }

  /**
   * Jointure naturelle écrite avec une égalité explicite sur les attributs communs : les noms de
   * colonnes des CTE peuvent être qualifiés, ce qui empêcherait `NATURAL JOIN` de les reconnaître.
   * `=` n'est jamais vrai pour NULL, comme dans le moteur.
   * @param {string} leftId
   * @param {string} rightId
   * @param {string} left
   * @param {string} right
   */
  naturalJoin(leftId, rightId, left, right) {
    const leftSchema = this.schema(leftId);
    const rightSchema = this.schema(rightId);
    const leftColumns = this.columnsOf(leftId);
    const rightColumns = this.columnsOf(rightId);
    /** @type {string[]} */
    const equalities = [];
    /** @type {string[]} */
    const kept = [];
    rightSchema.forEach((attribute, r) => {
      const l = leftSchema.findIndex((a) => a.name === attribute.name);
      if (l >= 0) equalities.push(`l.${leftColumns[l]} = r.${rightColumns[r]}`);
      else kept.push(`r.${rightColumns[r]}`);
    });
    const columns = ['l.*', ...kept].join(', ');
    if (equalities.length === 0) {
      return `SELECT DISTINCT ${columns} FROM ${left} AS l CROSS JOIN ${right} AS r`;
    }
    return `SELECT DISTINCT ${columns} FROM ${left} AS l\nJOIN ${right} AS r ON ${equalities.join(' AND ')}`;
  }

  /**
   * Division R ÷ S : les groupes de R pour lesquels il n'existe aucun tuple de S absent du groupe.
   * @param {string} dividendId
   * @param {string} divisorId
   * @param {string} dividend
   * @param {string} divisor
   */
  division(dividendId, divisorId, dividend, divisor) {
    const dividendSchema = this.schema(dividendId);
    const divisorSchema = this.schema(divisorId);
    const dividendColumns = this.columnsOf(dividendId);
    const divisorColumns = this.columnsOf(divisorId);
    const divisorIndices = divisorSchema.map((a) =>
      dividendSchema.findIndex((d) => d.name === a.name),
    );
    const kept = dividendColumns.filter((_, i) => !divisorIndices.includes(i));
    const sameGroup = kept.map((c) => `r2.${c} IS r1.${c}`);
    const sameDivisor = divisorIndices.map(
      (i, j) => `r2.${dividendColumns[i]} IS s.${divisorColumns[j]}`,
    );
    return [
      `SELECT DISTINCT ${kept.map((c) => `r1.${c}`).join(', ')} FROM ${dividend} AS r1`,
      'WHERE NOT EXISTS (',
      `  SELECT 1 FROM ${divisor} AS s`,
      '  WHERE NOT EXISTS (',
      `    SELECT 1 FROM ${dividend} AS r2`,
      `    WHERE ${[...sameGroup, ...sameDivisor].join(' AND ')}`,
      '  )',
      ')',
    ].join('\n');
  }

  /**
   * Condition SQL. Les priorités SQL (comparaison > NOT > AND > OR) sont celles de la grammaire :
   * seules les parenthèses nécessaires sont ajoutées.
   * @param {Condition} condition
   * @param {Attribute[]} schema
   * @param {(index: number) => string} column colonne SQL d'un attribut du schéma
   * @param {number} [parentPrecedence]
   * @returns {string}
   */
  condition(condition, schema, column, parentPrecedence = 0) {
    const precedence = { or: 1, and: 2, not: 3, compare: 4 }[condition.kind];
    let text;
    switch (condition.kind) {
      case 'compare': {
        const left = this.operand(condition.left, schema, column);
        if (condition.op === 'is') text = `${left} IS NULL`;
        else if (condition.op === 'is not') text = `${left} IS NOT NULL`;
        else text = `${left} ${condition.op} ${this.operand(condition.right, schema, column)}`;
        break;
      }
      case 'not':
        text = `NOT ${this.condition(condition.operand, schema, column, precedence)}`;
        break;
      default: {
        const left = this.condition(condition.left, schema, column, precedence);
        const right = this.condition(condition.right, schema, column, precedence + 1);
        text = `${left} ${condition.kind.toUpperCase()} ${right}`;
      }
    }
    return precedence < parentPrecedence ? `(${text})` : text;
  }

  /**
   * @param {Operand} operand
   * @param {Attribute[]} schema
   * @param {(index: number) => string} column
   */
  operand(operand, schema, column) {
    if (operand.kind === 'literal') return formatLiteral(operand.value);
    return column(matchingAttributes(schema, operand.name, operand.qualifier)[0]);
  }
}
