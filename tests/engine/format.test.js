import { describe, expect, it } from 'vitest';
import {
  formatCondition,
  formatLiteral,
  formatNode,
  formatOperand,
  nodeLabel,
} from '../../src/engine/format.js';

// Constructeurs minimaux : le formateur ne lit ni `id` ni `span`.
const span = { start: 0, end: 0 };
const rel = (name) => ({ id: name, kind: 'relation', name, span });
const attr = (name, qualifier) => ({
  kind: 'attribute',
  name,
  ...(qualifier && { qualifier }),
  span,
});
const lit = (value) => ({ kind: 'literal', value, span });
const cmp = (left, op, right) => ({ kind: 'compare', op, left, right });
const and = (left, right) => ({ kind: 'and', left, right });
const or = (left, right) => ({ kind: 'or', left, right });
const not = (operand) => ({ kind: 'not', operand });

const a1 = cmp(attr('a'), '=', lit(1));
const b2 = cmp(attr('b'), '=', lit(2));
const c3 = cmp(attr('c'), '=', lit(3));

describe('formatLiteral et formatOperand', () => {
  it('écrit les littéraux comme dans la syntaxe d’entrée', () => {
    expect(formatLiteral(2020)).toBe('2020');
    expect(formatLiteral(-2.5)).toBe('-2.5');
    expect(formatLiteral(null)).toBe('null');
    expect(formatLiteral("l'Atlas")).toBe("'l''Atlas'");
  });

  it('écrit les attributs qualifiés ou non', () => {
    expect(formatOperand(attr('titre'))).toBe('titre');
    expect(formatOperand(attr('titre', 'Livre'))).toBe('Livre.titre');
    expect(formatOperand(lit('Roman'))).toBe("'Roman'");
  });
});

describe('formatCondition', () => {
  it('écrit les comparaisons et les tests de nullité', () => {
    expect(formatCondition(cmp(attr('annee'), '>', lit(2020)))).toBe('annee > 2020');
    expect(formatCondition(cmp(attr('annee'), 'is', lit(null)))).toBe('annee is null');
    expect(formatCondition(cmp(attr('annee'), 'is not', lit(null)))).toBe('annee is not null');
  });

  it('n’ajoute pas de parenthèses inutiles', () => {
    expect(formatCondition(or(and(not(a1), b2), c3))).toBe('not a = 1 and b = 2 or c = 3');
    expect(formatCondition(or(a1, and(b2, c3)))).toBe('a = 1 or b = 2 and c = 3');
  });

  it('ajoute les parenthèses qui changent la lecture', () => {
    expect(formatCondition(and(or(a1, b2), c3))).toBe('(a = 1 or b = 2) and c = 3');
    expect(formatCondition(not(or(a1, b2)))).toBe('not (a = 1 or b = 2)');
    expect(formatCondition(and(a1, and(b2, c3)))).toBe('a = 1 and (b = 2 and c = 3)');
    expect(formatCondition(and(and(a1, b2), c3))).toBe('a = 1 and b = 2 and c = 3');
  });
});

describe('nodeLabel et formatNode', () => {
  const select = { id: 's', kind: 'select', condition: a1, child: rel('R'), span };

  it('étiquette chaque type de nœud', () => {
    expect(nodeLabel(rel('Livre'))).toBe('Livre');
    expect(nodeLabel(select)).toBe('σ[a = 1]');
    expect(
      nodeLabel({
        id: 'p',
        kind: 'project',
        attributes: ['titre', 'Livre.annee'],
        child: rel('R'),
        span,
      }),
    ).toBe('π[titre, Livre.annee]');
    expect(
      nodeLabel({
        id: 't',
        kind: 'thetaJoin',
        condition: a1,
        left: rel('R'),
        right: rel('S'),
        span,
      }),
    ).toBe('⋈[a = 1]');
  });

  it.each([
    ['product', '×'],
    ['naturalJoin', '⋈'],
    ['union', '∪'],
    ['minus', '−'],
    ['intersect', '∩'],
    ['divide', '÷'],
  ])('étiquette %s avec %s', (kind, symbol) => {
    expect(nodeLabel({ id: 'b', kind, left: rel('R'), right: rel('S'), span })).toBe(symbol);
  });

  it('étiquette les trois formes de renommage', () => {
    const rename = (fields) => ({
      id: 'r',
      kind: 'rename',
      mapping: {},
      child: rel('R'),
      span,
      ...fields,
    });
    expect(nodeLabel(rename({ newName: 'L' }))).toBe('ρ[L]');
    expect(nodeLabel(rename({ newName: 'L', positional: ['a', 'b'] }))).toBe('ρ[L(a, b)]');
    expect(nodeLabel(rename({ mapping: { titre: 't', annee: 'an' } }))).toBe(
      'ρ[titre→t, annee→an]',
    );
  });

  it('écrit un arbre entier en notation préfixée', () => {
    const tree = { id: 'u', kind: 'union', left: select, right: rel('S'), span };
    expect(formatNode(tree)).toBe('∪(σ[a = 1](R), S)');
  });
});
