import { describe, expect, it } from 'vitest';
import { RelaVizError } from '../../src/engine/errors.js';
import { isKeywordWord, tokenize } from '../../src/engine/lexer.js';

/** Types des jetons, sans le EOF final. */
const types = (/** @type {string} */ text) =>
  tokenize(text)
    .map((t) => t.type)
    .slice(0, -1);

/** Erreur levée par tokenize, pour inspecter son code et sa position. */
function lexError(/** @type {string} */ text) {
  try {
    tokenize(text);
  } catch (error) {
    if (error instanceof RelaVizError) return error;
    throw error;
  }
  throw new Error(`Aucune erreur pour ${text}`);
}

describe('lexer : opérateurs', () => {
  it.each([
    ['select', 'σ', 'SELECT'],
    ['project', 'π', 'PROJECT'],
    ['rename', 'ρ', 'RENAME'],
    ['x', '×', 'PRODUCT'],
    ['join', '⋈', 'JOIN'],
    ['union', '∪', 'UNION'],
    ['minus', '−', 'MINUS'],
    ['intersect', '∩', 'INTERSECT'],
    ['divide', '÷', 'DIVIDE'],
    ['and', '∧', 'AND'],
    ['or', '∨', 'OR'],
    ['not', '¬', 'NOT'],
    [':=', '←', 'ASSIGN'],
    ['->', '→', 'ARROW'],
  ])('%s et %s donnent %s', (ascii, symbol, type) => {
    expect(types(ascii)).toEqual([type]);
    expect(types(symbol)).toEqual([type]);
  });

  it('reconnaît les deux symboles de jointure et le tiret ASCII (D4)', () => {
    expect(types('⨝')).toEqual(['JOIN']);
    expect(types('-')).toEqual(['MINUS']);
  });

  it('reconnaît is et null', () => {
    expect(types('is not null')).toEqual(['IS', 'NOT', 'NULL']);
  });

  it('reconnaît les comparaisons dans toutes leurs écritures', () => {
    expect(types('= <> != ≠ < <= ≤ > >= ≥')).toEqual([
      'EQ',
      'NE',
      'NE',
      'NE',
      'LT',
      'LE',
      'LE',
      'GT',
      'GE',
      'GE',
    ]);
  });

  it('reconnaît la ponctuation', () => {
    expect(types('()[],.;')).toEqual([
      'LPAREN',
      'RPAREN',
      'LBRACKET',
      'RBRACKET',
      'COMMA',
      'DOT',
      'SEMI',
    ]);
  });

  it('ignore la casse des mots-clés (D3)', () => {
    expect(types('SELECT Select sElEcT')).toEqual(['SELECT', 'SELECT', 'SELECT']);
    expect(types('X UNION Null')).toEqual(['PRODUCT', 'UNION', 'NULL']);
  });

  it('applique la règle du plus long préfixe', () => {
    expect(types('a<=b')).toEqual(['IDENT', 'LE', 'IDENT']);
    expect(types('a<>b')).toEqual(['IDENT', 'NE', 'IDENT']);
    expect(types('a->b')).toEqual(['IDENT', 'ARROW', 'IDENT']);
    expect(types('R:=S')).toEqual(['IDENT', 'ASSIGN', 'IDENT']);
    expect(types('R-S')).toEqual(['IDENT', 'MINUS', 'IDENT']);
    expect(types('R×S')).toEqual(['IDENT', 'PRODUCT', 'IDENT']);
  });
});

describe('lexer : identifiants', () => {
  it('garde la casse et la valeur des identifiants', () => {
    const [token] = tokenize('Livre');
    expect(token).toEqual({
      type: 'IDENT',
      text: 'Livre',
      value: 'Livre',
      span: { start: 0, end: 5 },
    });
  });

  it('accepte les lettres accentuées, les chiffres et le soulignement (D8)', () => {
    expect(tokenize('Année_2 _id œuvre')[0].value).toBe('Année_2');
    expect(types('Année_2 _id œuvre')).toEqual(['IDENT', 'IDENT', 'IDENT']);
  });

  it('exclut les lettres grecques : σtitre se lit σ puis titre', () => {
    expect(types('σtitre')).toEqual(['SELECT', 'IDENT']);
  });

  it('ne reconnaît un mot-clé que si le mot entier correspond', () => {
    expect(types('xml joined selection')).toEqual(['IDENT', 'IDENT', 'IDENT']);
  });

  it('distingue un mot-clé écrit en lettres d’un symbole', () => {
    const [word, symbol, ident] = tokenize('union ∪ Livre');
    expect(isKeywordWord(word)).toBe(true);
    expect(isKeywordWord(symbol)).toBe(false);
    expect(isKeywordWord(ident)).toBe(false);
  });
});

describe('lexer : littéraux', () => {
  it('lit les nombres entiers et décimaux', () => {
    const [integer, decimal] = tokenize('2020 34.5');
    expect(integer).toMatchObject({ type: 'NUMBER', value: 2020, text: '2020' });
    expect(decimal).toMatchObject({ type: 'NUMBER', value: 34.5 });
  });

  it('ne prend pas le point d’un nombre sans décimale', () => {
    expect(types('5.')).toEqual(['NUMBER', 'DOT']);
    expect(types('.5')).toEqual(['DOT', 'NUMBER']);
  });

  it('lit les chaînes et l’apostrophe doublée', () => {
    const [token] = tokenize("'Le Souffle de l''Atlas'");
    expect(token).toMatchObject({ type: 'STRING', value: "Le Souffle de l'Atlas" });
    expect(token.span).toEqual({ start: 0, end: 24 });
  });

  it('accepte une chaîne vide et ne lit pas de commentaire dans une chaîne', () => {
    expect(tokenize("''")[0].value).toBe('');
    expect(tokenize("'a--b'")[0].value).toBe('a--b');
  });
});

describe('lexer : blancs et commentaires', () => {
  it('ignore les blancs et les retours à la ligne (D9)', () => {
    expect(types('  R\n\tunion\r\n S  ')).toEqual(['IDENT', 'UNION', 'IDENT']);
  });

  it('ignore les commentaires jusqu’à la fin de la ligne', () => {
    expect(types('-- titre\nR -- fin\nunion S')).toEqual(['IDENT', 'UNION', 'IDENT']);
    expect(types('-- seulement un commentaire')).toEqual([]);
  });

  it('termine toujours par EOF positionné en fin de texte', () => {
    const tokens = tokenize('R ');
    expect(tokens.at(-1)).toEqual({
      type: 'EOF',
      text: '',
      value: null,
      span: { start: 2, end: 2 },
    });
    expect(tokenize('')).toHaveLength(1);
  });

  it('positionne chaque jeton', () => {
    const spans = tokenize('σ[a >= 1](R)').map((t) => [t.text, t.span.start, t.span.end]);
    expect(spans).toEqual([
      ['σ', 0, 1],
      ['[', 1, 2],
      ['a', 2, 3],
      ['>=', 4, 6],
      ['1', 7, 8],
      [']', 8, 9],
      ['(', 9, 10],
      ['R', 10, 11],
      [')', 11, 12],
      ['', 12, 12],
    ]);
  });
});

describe('lexer : erreurs', () => {
  it('signale un caractère inattendu', () => {
    const error = lexError('R @ S');
    expect(error.code).toBe('UNEXPECTED_CHARACTER');
    expect(error.message).toBe('Caractère inattendu « @ ».');
    expect(error.span).toEqual({ start: 2, end: 3 });
  });

  it('signale un caractère hors du plan de base en entier', () => {
    const error = lexError('R 😀');
    expect(error.params.char).toBe('😀');
    expect(error.span).toEqual({ start: 2, end: 4 });
  });

  it('signale une chaîne non terminée (cas E4)', () => {
    const error = lexError("σ[titre = 'abc](R)");
    expect(error.code).toBe('UNTERMINATED_STRING');
    expect(error.span.start).toBe(10);
  });

  it('arrête une chaîne non terminée à la fin de la ligne', () => {
    expect(lexError("'abc\n'").span).toEqual({ start: 0, end: 4 });
  });

  it('explique qu’une chaîne s’écrit entre apostrophes (cas E9)', () => {
    const error = lexError('σ[genre = "Roman"](R)');
    expect(error.code).toBe('DOUBLE_QUOTED_STRING');
    expect(error.message).toBe(
      `Les chaînes s’écrivent entre apostrophes : 'Roman' et non "Roman".`,
    );
    expect(error.span).toEqual({ start: 10, end: 17 });
    expect(lexError('"Roman').span).toEqual({ start: 0, end: 6 });
  });

  it('signale un nombre mal formé', () => {
    const error = lexError('annee > 2020abc');
    expect(error.code).toBe('MALFORMED_NUMBER');
    expect(error.message).toBe('Nombre mal formé « 2020abc ».');
  });

  it.each(['⟕', '⟖', '⟗', 'γ', 'leftjoin', 'GROUP', 'count'])(
    'annonce que « %s » est prévu pour la V1.1 (cas E8)',
    (operator) => {
      const error = lexError(`R ${operator} S`);
      expect(error.code).toBe('FUTURE_OPERATOR');
      expect(error.params.operator).toBe(operator);
      expect(error.span.start).toBe(2);
    },
  );

  it('aide à corriger « : » et « ! » isolés', () => {
    expect(lexError('R : S').code).toBe('LONE_COLON');
    expect(lexError('a ! b').code).toBe('LONE_EXCLAMATION');
  });
});
