/**
 * Analyseur syntaxique à descente récursive (docs/grammar.md, §3 et §4).
 *
 * Chaque règle EBNF correspond à une méthode de la classe `Parser` : lire le code revient à lire
 * la grammaire. Les opérateurs binaires sont analysés par une boucle `while` par niveau de
 * priorité, ce qui construit des arbres associatifs à gauche sans récursion à gauche.
 *
 * Un jeton d'avance suffit partout, sauf pour reconnaître une affectation (`Nom :=`, deux jetons)
 * et le renommage, traité par factorisation à gauche. Il n'y a donc jamais de retour arrière.
 *
 * L'analyse s'arrête à la première erreur : les méthodes lèvent une `RelaVizError`, que la
 * fonction publique `parse` convertit en valeur de retour.
 */

/** @import { Assignment, Condition, Node, Operand, Program, Span } from './types.js' */
/** @import { ErrorInfo } from './errors.js' */
/** @import { Token, TokenType } from './lexer.js' */
import { RelaVizError, toErrorInfo } from './errors.js';
import { formatOperand } from './format.js';
import { isKeywordWord, tokenize } from './lexer.js';

/**
 * Résultat de `parse` : le programme, ou la première erreur rencontrée.
 * @typedef {{ ok: true, program: Program } | { ok: false, error: ErrorInfo }} ParseResult
 */

/** Forme normalisée de chaque comparateur (toutes les écritures donnent la même valeur). */
/** @type {Partial<Record<TokenType, string>>} */
const COMPARATORS = { EQ: '=', NE: '<>', LT: '<', LE: '<=', GT: '>', GE: '>=' };

/** Opérateurs binaires sans paramètre du niveau `join_expr`. */
/** @type {Partial<Record<TokenType, 'product' | 'divide' | 'naturalJoin'>>} */
const JOIN_LEVEL_KINDS = { PRODUCT: 'product', DIVIDE: 'divide', JOIN: 'naturalJoin' };

/** Jetons qui peuvent commencer une expression relationnelle. */
/** @type {ReadonlySet<TokenType>} */
const EXPRESSION_START = new Set(['IDENT', 'LPAREN', 'SELECT', 'PROJECT', 'RENAME']);

/**
 * Analyse un programme complet.
 * @param {string} text texte saisi par l'utilisateur
 * @returns {ParseResult}
 */
export function parse(text) {
  try {
    return { ok: true, program: new Parser(tokenize(text)).parseProgram() };
  } catch (error) {
    if (error instanceof RelaVizError) return { ok: false, error: toErrorInfo(error, text) };
    throw error;
  }
}

/** @typedef {{ name: string, qualifier?: string, text: string, span: Span }} AttributeRef */

/**
 * Champs propres à chaque type de nœud, sans `id` ni `span` (ajoutés par `Parser.node`).
 * @typedef {Node extends infer N ? (N extends unknown ? Omit<N, 'id' | 'span'> : never) : never} NodeFields
 */

class Parser {
  /** @param {Token[]} tokens suite de jetons terminée par EOF */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.nodeCount = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Programme : program = { assignment , [ SEMI ] } , [ expression , [ SEMI ] ] ;
  // ---------------------------------------------------------------------------------------------

  /** @returns {Program} */
  parseProgram() {
    /** @type {Assignment[]} */
    const assignments = [];
    /** @type {Node | null} */
    let result = null;

    while (!this.check('EOF')) {
      if (this.startsAssignment()) {
        assignments.push(this.parseAssignment());
        this.match('SEMI');
      } else {
        result = this.parseExpression();
        this.match('SEMI');
        if (!this.check('EOF')) throw this.unexpectedAfterExpression();
      }
    }
    return { assignments, result };
  }

  /**
   * Deux jetons d'avance : un nom suivi de `:=` ou `←` commence une affectation.
   * @returns {boolean}
   */
  startsAssignment() {
    if (this.peek(1).type !== 'ASSIGN') return false;
    const name = this.peek();
    if (name.type === 'IDENT') return true;
    if (isKeywordWord(name)) throw this.reservedWord(name);
    return false;
  }

  /** @returns {Assignment} */
  parseAssignment() {
    const name = this.advance();
    this.advance(); // ASSIGN
    const expression = this.parseExpression();
    return { name: name.text, expression, span: this.spanFrom(name.span.start) };
  }

  /** Erreur pour un jeton qui suit l'expression finale. */
  unexpectedAfterExpression() {
    const token = this.peek();
    if (token.type === 'IDENT' && this.peek(1).type === 'ASSIGN') {
      return new RelaVizError('ASSIGNMENT_AFTER_RESULT', token.span, { name: token.text });
    }
    return this.missingOperatorOr(
      () => new RelaVizError('UNEXPECTED_TOKEN', token.span, { found: token.text }),
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Expressions relationnelles, du niveau le plus faible au plus fort (§4.1)
  // ---------------------------------------------------------------------------------------------

  /** expression = union_expr ; */
  parseExpression() {
    return this.parseUnionExpr();
  }

  /**
   * union_expr = intersect_expr , { ( UNION | MINUS ) , intersect_expr } ;
   * @returns {Node}
   */
  parseUnionExpr() {
    const start = this.peek().span.start;
    let left = this.parseIntersectExpr();
    while (this.check('UNION', 'MINUS')) {
      const operator = this.advance();
      const right = this.parseIntersectExpr();
      left = this.binary(operator.type === 'UNION' ? 'union' : 'minus', left, right, start);
    }
    return left;
  }

  /**
   * intersect_expr = join_expr , { INTERSECT , join_expr } ;
   * @returns {Node}
   */
  parseIntersectExpr() {
    const start = this.peek().span.start;
    let left = this.parseJoinExpr();
    while (this.match('INTERSECT')) {
      const right = this.parseJoinExpr();
      left = this.binary('intersect', left, right, start);
    }
    return left;
  }

  /**
   * join_expr = unary_expr , { join_operator , unary_expr } ;
   * join_operator = PRODUCT | DIVIDE | JOIN , [ LBRACKET , condition , RBRACKET ] ;
   * @returns {Node}
   */
  parseJoinExpr() {
    const start = this.peek().span.start;
    let left = this.parseUnaryExpr();
    while (this.check('PRODUCT', 'DIVIDE', 'JOIN')) {
      const operator = this.advance();
      if (operator.type === 'JOIN' && this.match('LBRACKET')) {
        const condition = this.parseCondition();
        this.expect('RBRACKET', '« ] »', `pour fermer la condition de ${operator.text}`);
        const right = this.parseUnaryExpr();
        left = this.node({ kind: 'thetaJoin', condition, left, right }, start);
      } else {
        const kind = /** @type {'product' | 'divide' | 'naturalJoin'} */ (
          JOIN_LEVEL_KINDS[operator.type]
        );
        left = this.binary(kind, left, this.parseUnaryExpr(), start);
      }
    }
    return left;
  }

  /**
   * unary_expr = SELECT [ condition ] unary_expr | PROJECT [ attribute_list ] unary_expr
   *            | RENAME [ rename_spec ] unary_expr | primary ;
   * @returns {Node}
   */
  parseUnaryExpr() {
    const operator = this.peek();
    const start = operator.span.start;
    switch (operator.type) {
      case 'SELECT': {
        this.advance();
        this.expect('LBRACKET', '« [ »', `après « ${operator.text} »`);
        const condition = this.parseCondition();
        this.expect('RBRACKET', '« ] »', `pour fermer la condition de ${operator.text}`);
        const child = this.parseUnaryExpr();
        return this.node({ kind: 'select', condition, child }, start);
      }
      case 'PROJECT': {
        this.advance();
        this.expect('LBRACKET', '« [ »', `après « ${operator.text} »`);
        const attributes = this.parseAttributeList();
        this.expect('RBRACKET', '« ] »', `pour fermer la liste d’attributs de ${operator.text}`);
        const child = this.parseUnaryExpr();
        return this.node({ kind: 'project', attributes, child }, start);
      }
      case 'RENAME': {
        this.advance();
        this.expect('LBRACKET', '« [ »', `après « ${operator.text} »`);
        const spec = this.parseRenameSpec();
        this.expect('RBRACKET', '« ] »', `pour fermer le renommage de ${operator.text}`);
        const child = this.parseUnaryExpr();
        return this.node({ kind: 'rename', ...spec, child }, start);
      }
      default:
        return this.parsePrimary();
    }
  }

  /**
   * primary = IDENT | LPAREN , expression , RPAREN ;
   * Les parenthèses ne créent pas de nœud : elles ne servent qu'au regroupement.
   * @returns {Node}
   */
  parsePrimary() {
    const token = this.peek();
    if (token.type === 'IDENT') {
      this.advance();
      return this.node({ kind: 'relation', name: token.text }, token.span.start);
    }
    if (token.type === 'LPAREN') {
      this.advance();
      const inner = this.parseExpression();
      if (!this.check('RPAREN')) {
        throw this.missingOperatorOr(() =>
          this.expectedError('« ) »', 'pour fermer la parenthèse ouverte'),
        );
      }
      this.advance();
      return inner;
    }
    const previous = this.previous();
    throw new RelaVizError('EXPECTED_EXPRESSION', token.span, {
      after: previous ? previous.text : '',
      found: token.text,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Paramètres de π et ρ (§3.3)
  // ---------------------------------------------------------------------------------------------

  /**
   * attribute_list = attribute_ref , { COMMA , attribute_ref } ;
   * Une référence qualifiée est conservée telle quelle (`Livre.titre`).
   * @returns {string[]}
   */
  parseAttributeList() {
    const attributes = [this.parseAttributeRef().text];
    while (this.match('COMMA')) attributes.push(this.parseAttributeRef().text);
    return attributes;
  }

  /**
   * attribute_ref = IDENT , [ DOT , IDENT ] ;
   * @returns {AttributeRef}
   */
  parseAttributeRef() {
    const first = this.expectName('nom d’attribut');
    if (!this.match('DOT')) {
      return { name: first.text, text: first.text, span: first.span };
    }
    const second = this.expectName('nom d’attribut', `après « ${first.text}. »`);
    return {
      name: second.text,
      qualifier: first.text,
      text: `${first.text}.${second.text}`,
      span: { start: first.span.start, end: second.span.end },
    };
  }

  /**
   * rename_spec = relation_rename | attribute_renames ;
   * Les deux formes commencent par un nom : on lit une référence d'attribut, puis le jeton suivant
   * décide (factorisation à gauche, sans retour arrière).
   * @returns {{ mapping: Record<string, string>, newName?: string, positional?: string[] }}
   */
  parseRenameSpec() {
    const first = this.parseAttributeRef();

    if (this.check('ARROW')) {
      /** @type {Record<string, string>} */
      const mapping = Object.create(null);
      let ref = first;
      for (;;) {
        this.expect('ARROW', '« -> »', `pour renommer « ${ref.text} »`);
        const target = this.expectName('nouveau nom d’attribut');
        if (Object.hasOwn(mapping, ref.text)) {
          throw new RelaVizError('DUPLICATE_RENAME', ref.span, { attribute: ref.text });
        }
        mapping[ref.text] = target.text;
        if (!this.match('COMMA')) return { mapping };
        ref = this.parseAttributeRef();
      }
    }

    if (first.qualifier !== undefined) {
      throw new RelaVizError('QUALIFIED_RELATION_NAME', first.span, { name: first.text });
    }
    if (!this.match('LPAREN')) return { mapping: {}, newName: first.name };

    const positional = [this.expectName('nouveau nom d’attribut').text];
    while (this.match('COMMA')) positional.push(this.expectName('nouveau nom d’attribut').text);
    this.expect('RPAREN', '« ) »', 'pour fermer la liste des nouveaux noms');
    return { mapping: {}, newName: first.name, positional };
  }

  // ---------------------------------------------------------------------------------------------
  // Conditions (§3.4) : or < and < not < comparaison
  // ---------------------------------------------------------------------------------------------

  /** condition = or_cond ; */
  parseCondition() {
    return this.parseOrCond();
  }

  /**
   * or_cond = and_cond , { OR , and_cond } ;
   * @returns {Condition}
   */
  parseOrCond() {
    let left = this.parseAndCond();
    while (this.match('OR')) left = { kind: 'or', left, right: this.parseAndCond() };
    return left;
  }

  /**
   * and_cond = not_cond , { AND , not_cond } ;
   * @returns {Condition}
   */
  parseAndCond() {
    let left = this.parseNotCond();
    while (this.match('AND')) left = { kind: 'and', left, right: this.parseNotCond() };
    return left;
  }

  /**
   * not_cond = NOT , not_cond | atom_cond ;
   * @returns {Condition}
   */
  parseNotCond() {
    if (this.match('NOT')) return { kind: 'not', operand: this.parseNotCond() };
    return this.parseAtomCond();
  }

  /**
   * atom_cond = LPAREN condition RPAREN | operand comparator operand | operand IS [NOT] NULL ;
   * Un opérande ne commence jamais par `(` : une parenthèse ouvre donc toujours une sous-condition.
   * @returns {Condition}
   */
  parseAtomCond() {
    if (this.match('LPAREN')) {
      const condition = this.parseCondition();
      this.expect('RPAREN', '« ) »', 'pour fermer la condition');
      return condition;
    }

    const left = this.parseOperand();

    const is = this.match('IS');
    if (is) {
      const negated = this.match('NOT') !== null;
      const nullToken = this.expect(
        'NULL',
        '« null »',
        `après « ${is.text}${negated ? ' not' : ''} »`,
      );
      return {
        kind: 'compare',
        op: negated ? 'is not' : 'is',
        left,
        right: { kind: 'literal', value: null, span: nullToken.span },
      };
    }

    const op = COMPARATORS[this.peek().type];
    if (op === undefined) {
      throw this.expectedError(
        'opérateur de comparaison (=, <>, <, <=, >, >=) ou « is null »',
        `après « ${formatOperand(left)} »`,
      );
    }
    this.advance();
    const right = this.parseOperand({ left, op });
    if (COMPARATORS[this.peek().type] !== undefined) {
      throw new RelaVizError('CHAINED_COMPARISON', this.peek().span);
    }
    return { kind: 'compare', op, left, right };
  }

  /**
   * operand = attribute_ref | [ MINUS ] , NUMBER | STRING ;
   * @param {{ left: Operand, op: string }} [comparison] comparaison en cours, pour l'aide sur null
   * @returns {Operand}
   */
  parseOperand(comparison) {
    const token = this.peek();
    switch (token.type) {
      case 'IDENT': {
        const ref = this.parseAttributeRef();
        return ref.qualifier === undefined
          ? { kind: 'attribute', name: ref.name, span: ref.span }
          : { kind: 'attribute', name: ref.name, qualifier: ref.qualifier, span: ref.span };
      }
      case 'NUMBER':
      case 'STRING':
        this.advance();
        return { kind: 'literal', value: token.value, span: token.span };
      case 'MINUS': {
        this.advance();
        const number = this.expect('NUMBER', 'nombre', `après « ${token.text} »`);
        return {
          kind: 'literal',
          value: -(/** @type {number} */ (number.value)),
          span: { start: token.span.start, end: number.span.end },
        };
      }
      case 'NULL': {
        const subject = comparison ? formatOperand(comparison.left) : 'attribut';
        const test = comparison?.op === '<>' ? 'is not null' : 'is null';
        throw new RelaVizError('NULL_COMPARISON', token.span, { suggestion: `${subject} ${test}` });
      }
      default:
        if (isKeywordWord(token)) throw this.reservedWord(token);
        throw this.expectedError('valeur ou nom d’attribut');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Outils : lecture des jetons, construction des nœuds, erreurs
  // ---------------------------------------------------------------------------------------------

  /**
   * Jeton courant, ou suivant avec `offset`. Ne dépasse jamais EOF.
   * @param {number} [offset]
   * @returns {Token}
   */
  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  /** @returns {Token | undefined} dernier jeton consommé */
  previous() {
    return this.pos > 0 ? this.tokens[this.pos - 1] : undefined;
  }

  /** @param {...TokenType} types */
  check(...types) {
    return types.includes(this.peek().type);
  }

  /** @returns {Token} */
  advance() {
    const token = this.peek();
    if (token.type !== 'EOF') this.pos += 1;
    return token;
  }

  /**
   * Consomme le jeton courant s'il a l'un des types donnés.
   * @param {...TokenType} types
   * @returns {Token | null}
   */
  match(...types) {
    return this.check(...types) ? this.advance() : null;
  }

  /**
   * Consomme un jeton du type attendu, ou lève une erreur qui dit ce qui manquait.
   * @param {TokenType} type
   * @param {string} expected description de ce qui est attendu, par exemple « ] »
   * @param {string} [context] précision, par exemple « pour fermer la condition de σ »
   * @returns {Token}
   */
  expect(type, expected, context = '') {
    if (this.check(type)) return this.advance();
    throw this.expectedError(expected, context);
  }

  /**
   * Consomme un nom (IDENT). Un mot réservé à cette place reçoit un message dédié.
   * @param {string} expected
   * @param {string} [context]
   * @returns {Token}
   */
  expectName(expected, context = '') {
    const token = this.peek();
    if (token.type === 'IDENT') return this.advance();
    if (isKeywordWord(token)) throw this.reservedWord(token);
    throw this.expectedError(expected, context);
  }

  /**
   * @param {string} expected
   * @param {string} [context]
   */
  expectedError(expected, context = '') {
    const token = this.peek();
    if (token.type === 'EOF')
      return new RelaVizError('UNEXPECTED_END', token.span, { expected, context });
    return new RelaVizError('EXPECTED_TOKEN', token.span, { expected, context, found: token.text });
  }

  /**
   * Si le jeton courant pourrait commencer une expression, c'est qu'un opérateur manque entre
   * le jeton précédent et lui (`Livre Auteur`). Sinon, l'erreur fournie est utilisée.
   * @param {() => RelaVizError} otherwise
   */
  missingOperatorOr(otherwise) {
    const token = this.peek();
    const previous = this.previous();
    if (previous && EXPRESSION_START.has(token.type)) {
      return new RelaVizError('MISSING_OPERATOR', token.span, {
        before: previous.text,
        after: token.text,
      });
    }
    return otherwise();
  }

  /** @param {Token} token */
  reservedWord(token) {
    return new RelaVizError('RESERVED_WORD', token.span, { word: token.text });
  }

  /**
   * Position qui va de `start` à la fin du dernier jeton consommé (parenthèses fermantes comprises).
   * @param {number} start
   * @returns {Span}
   */
  spanFrom(start) {
    const last = this.previous();
    return { start, end: last ? last.span.end : start };
  }

  /**
   * Crée un nœud. L'identifiant est attribué après l'analyse des enfants : les identifiants
   * suivent donc l'ordre postfixe, celui du mode pas à pas (EF-08).
   * @param {NodeFields} fields
   * @param {number} start
   * @returns {Node}
   */
  node(fields, start) {
    this.nodeCount += 1;
    return /** @type {Node} */ ({
      id: `n${this.nodeCount}`,
      ...fields,
      span: this.spanFrom(start),
    });
  }

  /**
   * @param {'product' | 'naturalJoin' | 'union' | 'minus' | 'intersect' | 'divide'} kind
   * @param {Node} left
   * @param {Node} right
   * @param {number} start
   */
  binary(kind, left, right, start) {
    return this.node({ kind, left, right }, start);
  }
}
