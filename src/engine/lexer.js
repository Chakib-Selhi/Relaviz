/**
 * Analyseur lexical : transforme le texte saisi en une suite de jetons (docs/grammar.md, §2).
 *
 * Le lexer est écrit à la main, sans expression régulière globale : il avance caractère par
 * caractère avec un indice `pos`, ce qui donne à chaque jeton sa position exacte (`span`) et
 * permet des messages d'erreur précis. À chaque position, il applique la règle du plus long
 * préfixe : `<=` est reconnu avant `<`, `->` et `--` avant `-`.
 */

/** @import { Span } from './types.js' */
import { RelaVizError } from './errors.js';

/**
 * @typedef {(
 *   'IDENT' | 'NUMBER' | 'STRING' |
 *   'SELECT' | 'PROJECT' | 'RENAME' | 'PRODUCT' | 'JOIN' | 'UNION' | 'MINUS' | 'INTERSECT' |
 *   'DIVIDE' | 'AND' | 'OR' | 'NOT' | 'IS' | 'NULL' | 'ASSIGN' | 'ARROW' |
 *   'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE' |
 *   'LPAREN' | 'RPAREN' | 'LBRACKET' | 'RBRACKET' | 'COMMA' | 'DOT' | 'SEMI' | 'EOF'
 * )} TokenType
 */

/**
 * Jeton. `text` est le texte source exact ; `value` vaut le nom pour `IDENT`, le nombre pour
 * `NUMBER`, la chaîne sans apostrophes pour `STRING`, et `null` pour les autres jetons.
 * @typedef {{ type: TokenType, text: string, value: string | number | null, span: Span }} Token
 */

/** Mots-clés, en minuscules : la comparaison se fait sans tenir compte de la casse (D3). */
/** @type {ReadonlyMap<string, TokenType>} */
const KEYWORDS = new Map([
  ['select', 'SELECT'],
  ['project', 'PROJECT'],
  ['rename', 'RENAME'],
  ['x', 'PRODUCT'],
  ['join', 'JOIN'],
  ['union', 'UNION'],
  ['minus', 'MINUS'],
  ['intersect', 'INTERSECT'],
  ['divide', 'DIVIDE'],
  ['and', 'AND'],
  ['or', 'OR'],
  ['not', 'NOT'],
  ['is', 'IS'],
  ['null', 'NULL'],
]);

/** Mots et symboles réservés aux opérateurs de la V1.1. */
const FUTURE_KEYWORDS = new Set([
  'leftjoin',
  'rightjoin',
  'fulljoin',
  'group',
  'as',
  'count',
  'sum',
  'avg',
  'min',
  'max',
]);
const FUTURE_SYMBOLS = new Set(['⟕', '⟖', '⟗', 'γ']);

/** Opérateurs de deux caractères, essayés avant ceux d'un caractère (plus long préfixe). */
/** @type {ReadonlyMap<string, TokenType>} */
const TWO_CHAR_SYMBOLS = new Map([
  [':=', 'ASSIGN'],
  ['->', 'ARROW'],
  ['<>', 'NE'],
  ['!=', 'NE'],
  ['<=', 'LE'],
  ['>=', 'GE'],
]);

/** @type {ReadonlyMap<string, TokenType>} */
const ONE_CHAR_SYMBOLS = new Map([
  ['σ', 'SELECT'],
  ['π', 'PROJECT'],
  ['ρ', 'RENAME'],
  ['×', 'PRODUCT'],
  ['⋈', 'JOIN'],
  ['⨝', 'JOIN'],
  ['∪', 'UNION'],
  ['−', 'MINUS'],
  ['-', 'MINUS'],
  ['∩', 'INTERSECT'],
  ['÷', 'DIVIDE'],
  ['∧', 'AND'],
  ['∨', 'OR'],
  ['¬', 'NOT'],
  ['←', 'ASSIGN'],
  ['→', 'ARROW'],
  ['=', 'EQ'],
  ['≠', 'NE'],
  ['<', 'LT'],
  ['≤', 'LE'],
  ['>', 'GT'],
  ['≥', 'GE'],
  ['(', 'LPAREN'],
  [')', 'RPAREN'],
  ['[', 'LBRACKET'],
  [']', 'RBRACKET'],
  [',', 'COMMA'],
  ['.', 'DOT'],
  [';', 'SEMI'],
]);

// Lettres latines, accentuées comprises ; les lettres grecques (σ, π, ρ) sont exclues (D8).
const IDENT_START = /[\p{Script=Latin}_]/u;
const IDENT_PART = /[\p{Script=Latin}0-9_]/u;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;

/** @param {string | undefined} char */
const isDigit = (char) => char !== undefined && DIGIT.test(char);
/** @param {string | undefined} char */
const isIdentPart = (char) => char !== undefined && IDENT_PART.test(char);

/**
 * Indique si un jeton est un mot-clé écrit en lettres (`union`, `x`...), par opposition à un
 * symbole (`∪`, `×`). Sert à l'analyseur pour signaler un mot réservé utilisé comme nom.
 * @param {Token} token
 */
export function isKeywordWord(token) {
  return token.type !== 'IDENT' && KEYWORDS.has(token.text.toLowerCase());
}

/**
 * Découpe le texte en jetons. Le dernier jeton est toujours `EOF`.
 * @param {string} text
 * @returns {Token[]}
 * @throws {RelaVizError} si un caractère ou un littéral est invalide
 */
export function tokenize(text) {
  /** @type {Token[]} */
  const tokens = [];
  let pos = 0;

  /**
   * @param {TokenType} type
   * @param {number} start
   * @param {string | number | null} [value]
   */
  const push = (type, start, value = null) => {
    tokens.push({ type, text: text.slice(start, pos), value, span: { start, end: pos } });
  };

  while (pos < text.length) {
    const char = text[pos];
    const start = pos;

    if (WHITESPACE.test(char)) {
      pos += 1;
    } else if (text.startsWith('--', pos)) {
      // Commentaire jusqu'à la fin de la ligne.
      while (pos < text.length && text[pos] !== '\n') pos += 1;
    } else if (IDENT_START.test(char)) {
      while (isIdentPart(text[pos])) pos += 1;
      const word = text.slice(start, pos);
      const lower = word.toLowerCase();
      const keyword = KEYWORDS.get(lower);
      if (keyword) {
        push(keyword, start);
      } else if (FUTURE_KEYWORDS.has(lower)) {
        throw new RelaVizError('FUTURE_OPERATOR', { start, end: pos }, { operator: word });
      } else {
        push('IDENT', start, word);
      }
    } else if (isDigit(char)) {
      while (isDigit(text[pos])) pos += 1;
      if (text[pos] === '.' && isDigit(text[pos + 1])) {
        pos += 1;
        while (isDigit(text[pos])) pos += 1;
      }
      if (isIdentPart(text[pos])) {
        while (isIdentPart(text[pos])) pos += 1;
        const malformed = text.slice(start, pos);
        throw new RelaVizError('MALFORMED_NUMBER', { start, end: pos }, { text: malformed });
      }
      push('NUMBER', start, Number(text.slice(start, pos)));
    } else if (char === "'") {
      const { value, end } = readString(text, start);
      pos = end;
      push('STRING', start, value);
    } else if (char === '"') {
      throw doubleQuotedString(text, start);
    } else if (TWO_CHAR_SYMBOLS.has(text.slice(pos, pos + 2))) {
      const type = /** @type {TokenType} */ (TWO_CHAR_SYMBOLS.get(text.slice(pos, pos + 2)));
      pos += 2;
      push(type, start);
    } else if (ONE_CHAR_SYMBOLS.has(char)) {
      pos += 1;
      push(/** @type {TokenType} */ (ONE_CHAR_SYMBOLS.get(char)), start);
    } else {
      throw unexpectedCharacter(text, start);
    }
  }

  tokens.push({ type: 'EOF', text: '', value: null, span: { start: pos, end: pos } });
  return tokens;
}

/**
 * Lit une chaîne entre apostrophes ; `''` représente une apostrophe.
 * @param {string} text
 * @param {number} start position de l'apostrophe ouvrante
 * @returns {{ value: string, end: number }} valeur et position après l'apostrophe fermante
 */
function readString(text, start) {
  let pos = start + 1;
  let value = '';
  for (;;) {
    const char = text[pos];
    if (char === undefined || char === '\n' || char === '\r') {
      throw new RelaVizError('UNTERMINATED_STRING', { start, end: pos });
    }
    if (char === "'") {
      if (text[pos + 1] === "'") {
        value += "'";
        pos += 2;
      } else {
        return { value, end: pos + 1 };
      }
    } else {
      value += char;
      pos += 1;
    }
  }
}

/**
 * Construit l'erreur d'une chaîne écrite entre guillemets, en proposant la bonne écriture.
 * @param {string} text
 * @param {number} start
 */
function doubleQuotedString(text, start) {
  let end = start + 1;
  while (end < text.length && text[end] !== '"' && text[end] !== '\n') end += 1;
  const content = text.slice(start + 1, end);
  if (text[end] === '"') end += 1;
  return new RelaVizError('DOUBLE_QUOTED_STRING', { start, end }, { content });
}

/**
 * Construit l'erreur d'un caractère non reconnu, avec un message dédié aux cas fréquents.
 * @param {string} text
 * @param {number} start
 */
function unexpectedCharacter(text, start) {
  const char = String.fromCodePoint(/** @type {number} */ (text.codePointAt(start)));
  const span = { start, end: start + char.length };
  if (FUTURE_SYMBOLS.has(char))
    return new RelaVizError('FUTURE_OPERATOR', span, { operator: char });
  if (char === ':') return new RelaVizError('LONE_COLON', span);
  if (char === '!') return new RelaVizError('LONE_EXCLAMATION', span);
  return new RelaVizError('UNEXPECTED_CHARACTER', span, { char });
}
