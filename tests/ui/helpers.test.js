import { describe, expect, it } from 'vitest';
import { parse } from '../../src/engine/index.js';
import { symbolForShortcut } from '../../src/ui/symbols.js';
import {
  COLUMN_GAP,
  LEVEL_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutTree,
  nodeAtOffset,
  shorten,
} from '../../src/ui/tree-layout.js';
import { readState, writeState } from '../../src/ui/url-state.js';

const root = (text) => parse(text).program.result;

describe('placement de l’arbre', () => {
  it('place les feuilles en colonnes et centre chaque parent sur ses enfants', () => {
    const layout = layoutTree(root('σ[a = 1](R) ∪ S'));
    const byLabel = Object.fromEntries(layout.nodes.map((n) => [n.node.id, n]));
    const column = NODE_WIDTH + COLUMN_GAP;
    const level = NODE_HEIGHT + LEVEL_GAP;
    // n1 = R, n2 = σ, n3 = S, n4 = ∪
    expect(byLabel.n1).toMatchObject({ x: NODE_WIDTH / 2, y: 2 * level, parentId: 'n2' });
    expect(byLabel.n2).toMatchObject({ x: NODE_WIDTH / 2, y: level, childIds: ['n1'] });
    expect(byLabel.n3).toMatchObject({ x: column + NODE_WIDTH / 2, y: level });
    expect(byLabel.n4).toMatchObject({ x: (NODE_WIDTH / 2 + column + NODE_WIDTH / 2) / 2, y: 0 });
    expect(layout.width).toBe(2 * column - COLUMN_GAP);
    expect(layout.height).toBe(3 * level - LEVEL_GAP);
  });

  it('ne superpose jamais deux nœuds', () => {
    const { nodes } = layoutTree(root('(A ⋈ B) ∪ ((C × D) − π[a](E ÷ F))'));
    const positions = nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(positions).size).toBe(nodes.length);
  });

  it('trouve le plus petit nœud qui contient le curseur', () => {
    const tree = root('σ[a = 1](R) ∪ S');
    expect(nodeAtOffset([tree], 9).kind).toBe('relation');
    expect(nodeAtOffset([tree], 3).kind).toBe('select');
    expect(nodeAtOffset([tree], 12).kind).toBe('union');
    expect(nodeAtOffset([tree], 99)).toBeNull();
  });

  it('raccourcit les étiquettes trop longues', () => {
    expect(shorten('σ[a = 1]')).toBe('σ[a = 1]');
    expect(shorten("σ[annee > 2020 and genre = 'Roman']")).toBe('σ[annee > 2020 and …');
  });
});

describe('partage par URL', () => {
  const ids = ['bibliotheque', 'universite'];

  it('relit ce qu’il écrit, caractères spéciaux compris', () => {
    const expression = "π[titre](σ[genre = 'Roman' ∧ annee ≥ 2020](Livre)) -- #&?";
    expect(readState(writeState('universite', expression), ids)).toEqual({
      databaseId: 'universite',
      expression,
    });
  });

  it('encode l’exercice choisi', () => {
    expect(readState(writeState('universite', 'R', 'bonnes-notes'), ids)).toEqual({
      databaseId: 'universite',
      exerciseId: 'bonnes-notes',
      expression: 'R',
    });
  });

  it('ignore une base inconnue ou un fragment vide', () => {
    expect(readState('#db=inconnue&q=R', ids)).toEqual({ expression: 'R' });
    expect(readState('', ids)).toEqual({});
  });
});

describe('raccourcis clavier', () => {
  const event = (code, extra = {}) => ({
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    code,
    ...extra,
  });

  it('associe Alt + lettre à un symbole, avec le code physique de la touche', () => {
    expect(symbolForShortcut(event('KeyS')).symbol).toBe('σ');
    expect(symbolForShortcut(event('KeyJ')).symbol).toBe('⋈');
    expect(symbolForShortcut(event('KeyZ'))).toBeUndefined();
    expect(symbolForShortcut(event('KeyS', { altKey: false }))).toBeUndefined();
    expect(symbolForShortcut(event('KeyS', { metaKey: true }))).toBeUndefined();
  });
});
