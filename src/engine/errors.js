/**
 * Erreurs du moteur : un code stable, un message en français et une position dans le texte.
 *
 * Les messages sont centralisés dans `MESSAGES_FR` pour qu'une traduction (EF-16) n'ait qu'un
 * catalogue à remplacer. Les modules du moteur lèvent des `RelaVizError` ; les fonctions publiques
 * (par exemple `parse`) les convertissent en `ErrorInfo`, un objet simple que l'interface affiche.
 */

/** @import { Span } from './types.js' */

/**
 * @typedef {(
 *   'UNEXPECTED_CHARACTER' | 'LONE_COLON' | 'LONE_EXCLAMATION' | 'UNTERMINATED_STRING' |
 *   'DOUBLE_QUOTED_STRING' | 'MALFORMED_NUMBER' | 'FUTURE_OPERATOR' |
 *   'EXPECTED_TOKEN' | 'UNEXPECTED_END' | 'EXPECTED_EXPRESSION' | 'MISSING_OPERATOR' |
 *   'UNEXPECTED_TOKEN' | 'RESERVED_WORD' | 'CHAINED_COMPARISON' | 'NULL_COMPARISON' |
 *   'QUALIFIED_RELATION_NAME' | 'DUPLICATE_RENAME' | 'ASSIGNMENT_AFTER_RESULT'
 * )} ErrorCode
 */

/**
 * Erreur telle que l'interface l'affiche. `line` et `column` commencent à 1.
 * @typedef {{ code: ErrorCode, message: string, span: Span, line: number, column: number }} ErrorInfo
 */

/** @param {string} text */
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** @param {string} context */
const withContext = (context) => (context ? ` ${context}` : '');

/**
 * Catalogue des messages. Chaque entrée reçoit les paramètres de l'erreur.
 * @type {Record<ErrorCode, (params: Record<string, string>) => string>}
 */
export const MESSAGES_FR = {
  // Erreurs lexicales
  UNEXPECTED_CHARACTER: ({ char }) => `Caractère inattendu « ${char} ».`,
  LONE_COLON: () => '« : » seul n’est pas reconnu : écrivez « := » pour une affectation.',
  LONE_EXCLAMATION: () =>
    '« ! » seul n’est pas reconnu : écrivez « != » ou « <> » pour « différent de ».',
  UNTERMINATED_STRING: () => 'Chaîne non terminée : il manque l’apostrophe fermante.',
  DOUBLE_QUOTED_STRING: ({ content }) =>
    `Les chaînes s’écrivent entre apostrophes : '${content}' et non "${content}".`,
  MALFORMED_NUMBER: ({ text }) => `Nombre mal formé « ${text} ».`,
  FUTURE_OPERATOR: ({ operator }) =>
    `L’opérateur « ${operator} » sera disponible dans une version ultérieure.`,

  // Erreurs de syntaxe
  EXPECTED_TOKEN: ({ expected, context, found }) =>
    `${capitalize(expected)} attendu${withContext(context)}, trouvé « ${found} ».`,
  UNEXPECTED_END: ({ expected, context }) =>
    `Fin de l’expression inattendue : ${expected} attendu${withContext(context)}.`,
  EXPECTED_EXPRESSION: ({ after, found }) =>
    `Expression attendue${after ? ` après « ${after} »` : ''}${found ? `, trouvé « ${found} »` : ''}.`,
  MISSING_OPERATOR: ({ before, after }) => `Opérateur attendu entre « ${before} » et « ${after} ».`,
  UNEXPECTED_TOKEN: ({ found }) => `« ${found} » inattendu.`,
  RESERVED_WORD: ({ word }) => `« ${word} » est un mot réservé et ne peut pas servir de nom.`,
  CHAINED_COMPARISON: () =>
    'Une comparaison ne s’enchaîne pas : utilisez and, par exemple « a > 1 and a < 5 ».',
  NULL_COMPARISON: ({ suggestion }) =>
    `Utilisez « ${suggestion} » : une comparaison avec null n’est jamais vraie.`,
  QUALIFIED_RELATION_NAME: ({ name }) =>
    `Le nouveau nom de relation « ${name} » ne peut pas être qualifié. ` +
    `Pour renommer un attribut, écrivez « ${name} -> nouveauNom ».`,
  DUPLICATE_RENAME: ({ attribute }) => `L’attribut « ${attribute} » est renommé deux fois.`,
  ASSIGNMENT_AFTER_RESULT: ({ name }) =>
    `L’affectation « ${name} » doit précéder l’expression finale : ` +
    'seule la dernière instruction peut être une expression sans nom.',
};

/** Erreur levée par le lexer, l'analyseur et, plus tard, le vérificateur de schéma. */
export class RelaVizError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {Span} span partie du texte à souligner
   * @param {Record<string, string>} [params] valeurs insérées dans le message
   */
  constructor(code, span, params = {}) {
    super(MESSAGES_FR[code](params));
    this.name = 'RelaVizError';
    /** @type {ErrorCode} */
    this.code = code;
    /** @type {Span} */
    this.span = span;
    /** @type {Record<string, string>} */
    this.params = params;
  }
}

/**
 * Convertit un indice du texte en ligne et colonne, à partir de 1.
 * @param {string} text
 * @param {number} offset
 * @returns {{ line: number, column: number }}
 */
export function positionAt(text, offset) {
  const index = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

/**
 * Prépare une erreur pour l'interface.
 * @param {RelaVizError} error
 * @param {string} text texte analysé, pour calculer la ligne et la colonne
 * @returns {ErrorInfo}
 */
export function toErrorInfo(error, text) {
  return {
    code: error.code,
    message: error.message,
    span: error.span,
    ...positionAt(text, error.span.start),
  };
}
