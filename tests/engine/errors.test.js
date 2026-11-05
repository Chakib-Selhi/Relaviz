import { describe, expect, it } from 'vitest';
import { MESSAGES_FR, RelaVizError, positionAt, toErrorInfo } from '../../src/engine/errors.js';

describe('positionAt', () => {
  it('compte lignes et colonnes à partir de 1', () => {
    expect(positionAt('abc', 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt('abc', 2)).toEqual({ line: 1, column: 3 });
  });

  it('passe à la ligne suivante après un retour à la ligne', () => {
    const text = 'R := S\nR union T';
    expect(positionAt(text, 6)).toEqual({ line: 1, column: 7 });
    expect(positionAt(text, 7)).toEqual({ line: 2, column: 1 });
    expect(positionAt(text, 9)).toEqual({ line: 2, column: 3 });
  });

  it('accepte la position de fin du texte et borne les indices hors limites', () => {
    expect(positionAt('ab', 2)).toEqual({ line: 1, column: 3 });
    expect(positionAt('ab', 99)).toEqual({ line: 1, column: 3 });
    expect(positionAt('ab', -5)).toEqual({ line: 1, column: 1 });
  });
});

describe('RelaVizError', () => {
  it('construit le message à partir du catalogue français', () => {
    const error = new RelaVizError('UNEXPECTED_CHARACTER', { start: 2, end: 3 }, { char: '@' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RelaVizError');
    expect(error.code).toBe('UNEXPECTED_CHARACTER');
    expect(error.message).toBe('Caractère inattendu « @ ».');
    expect(error.span).toEqual({ start: 2, end: 3 });
  });

  it('se convertit en ErrorInfo avec ligne et colonne', () => {
    const text = 'R\n  @';
    const error = new RelaVizError('UNEXPECTED_CHARACTER', { start: 4, end: 5 }, { char: '@' });
    expect(toErrorInfo(error, text)).toEqual({
      code: 'UNEXPECTED_CHARACTER',
      message: 'Caractère inattendu « @ ».',
      span: { start: 4, end: 5 },
      line: 2,
      column: 3,
    });
  });
});

describe('catalogue des messages', () => {
  it('produit un message non vide pour chaque code', () => {
    const params = {
      char: '@',
      content: 'Roman',
      text: '12a',
      operator: '⟕',
      expected: '« ] »',
      context: 'pour fermer la condition',
      found: '(',
      after: 'union',
      before: 'Livre',
      word: 'union',
      suggestion: 'annee is null',
      name: 'L',
      attribute: 'titre',
      hint: 'Vouliez-vous dire « Livre » ?',
      available: 'titre, annee',
      qualifier: 'Livr',
      candidates: '« Livre.id » ou « Auteur.id »',
      leftType: 'nombre',
      rightType: 'texte',
      left: '1',
      right: '2',
      position: '1',
      value: '2025-13-01',
    };
    for (const [code, build] of Object.entries(MESSAGES_FR)) {
      const message = build(params);
      expect(message.length, code).toBeGreaterThan(10);
      expect(message, code).toMatch(/[.?]$/);
    }
  });

  it('met une majuscule et ajoute le contexte aux jetons attendus', () => {
    expect(
      MESSAGES_FR.EXPECTED_TOKEN({ expected: 'nom d’attribut', context: '', found: ']' }),
    ).toBe('Nom d’attribut attendu, trouvé « ] ».');
    expect(
      MESSAGES_FR.EXPECTED_TOKEN({
        expected: '« ] »',
        context: 'pour fermer la condition de σ',
        found: '(',
      }),
    ).toBe('« ] » attendu pour fermer la condition de σ, trouvé « ( ».');
  });

  it('adapte le message d’expression attendue à ce qui est connu', () => {
    expect(MESSAGES_FR.EXPECTED_EXPRESSION({ after: 'union', found: '' })).toBe(
      'Expression attendue après « union ».',
    );
    expect(MESSAGES_FR.EXPECTED_EXPRESSION({ after: '', found: ')' })).toBe(
      'Expression attendue, trouvé « ) ».',
    );
  });
});
