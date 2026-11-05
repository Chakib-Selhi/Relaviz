import { describe, expect, it } from 'vitest';
import { formatNode, formatOperand } from '../../src/engine/format.js';
import { parse } from '../../src/engine/parser.js';

/** Analyse un texte valide et retourne le programme. */
function program(text) {
  const result = parse(text);
  if (!result.ok) throw new Error(`Erreur inattendue pour ${text} : ${result.error.message}`);
  return result.program;
}

/** Arbre du résultat en notation préfixée (docs/grammar.md, §8). */
const tree = (text) => formatNode(program(text).result);

/** Condition écrite en notation fonctionnelle, pour vérifier sa structure exacte. */
function structure(condition) {
  switch (condition.kind) {
    case 'compare':
      return condition.op === 'is' || condition.op === 'is not'
        ? `${formatOperand(condition.left)} ${condition.op} null`
        : `${formatOperand(condition.left)} ${condition.op} ${formatOperand(condition.right)}`;
    case 'not':
      return `not(${structure(condition.operand)})`;
    default:
      return `${condition.kind}(${structure(condition.left)}, ${structure(condition.right)})`;
  }
}

/** Structure de la condition de σ[...](R). */
const condition = (text) => structure(program(`σ[${text}](R)`).result.condition);

/** Erreur retournée par parse pour un texte invalide. */
function error(text) {
  const result = parse(text);
  if (result.ok) throw new Error(`Aucune erreur pour ${text}`);
  return result.error;
}

/** Nœuds de l'arbre en ordre postfixe. */
function postfix(node) {
  switch (node.kind) {
    case 'relation':
      return [node];
    case 'select':
    case 'project':
    case 'rename':
      return [...postfix(node.child), node];
    default:
      return [...postfix(node.left), ...postfix(node.right), node];
  }
}

describe('cas de référence de la grammaire (§8)', () => {
  it.each([
    ['Livre', 'Livre'],
    ['select[annee > 2020](Livre)', 'σ[annee > 2020](Livre)'],
    ['σ[annee > 2020] Livre', 'σ[annee > 2020](Livre)'],
    ['project[titre, Livre.annee](Livre)', 'π[titre, Livre.annee](Livre)'],
    ['rename[L](Livre)', 'ρ[L](Livre)'],
    ['rename[titre -> t, annee → an](Livre)', 'ρ[titre→t, annee→an](Livre)'],
    ['rename[L(i, t, a, an, g)](Livre)', 'ρ[L(i, t, a, an, g)](Livre)'],
    ['Livre join Auteur', '⋈(Livre, Auteur)'],
    [
      'Livre join[Livre.idAuteur = Auteur.idAuteur] Auteur',
      '⋈[Livre.idAuteur = Auteur.idAuteur](Livre, Auteur)',
    ],
    ['R union S intersect T', '∪(R, ∩(S, T))'],
    ['R minus S union T', '∪(−(R, S), T)'],
    ['R - S - T', '−(−(R, S), T)'],
    ['R join S x T', '×(⋈(R, S), T)'],
    ['R divide S join T', '⋈(÷(R, S), T)'],
    ['σ[a = 1] R join S', '⋈(σ[a = 1](R), S)'],
    ['π[a] σ[b > 2] R', 'π[a](σ[b > 2](R))'],
    ['SELECT[a = 1](R) UNION R', '∪(σ[a = 1](R), R)'],
  ])('%s', (input, expected) => {
    expect(tree(input)).toBe(expected);
  });

  it('18 : not > and > or dans les conditions', () => {
    expect(condition('not a = 1 and b = 2 or c = 3')).toBe('or(and(not(a = 1), b = 2), c = 3)');
  });

  it('19 : symboles Unicode et nombre négatif', () => {
    expect(condition('a ≠ 1 ∧ b ≤ -2.5')).toBe('and(a <> 1, b <= -2.5)');
  });

  it('20 : apostrophe doublée dans un littéral', () => {
    const select = program("σ[titre = 'Le Souffle de l''Atlas'](Livre)").result;
    expect(select.condition.right).toMatchObject({
      kind: 'literal',
      value: "Le Souffle de l'Atlas",
    });
  });

  it('21 et 22 : is null et is not null', () => {
    expect(condition('annee is null')).toBe('annee is null');
    expect(condition('annee is not null')).toBe('annee is not null');
    expect(program('σ[annee is null](Livre)').result.condition).toMatchObject({
      kind: 'compare',
      op: 'is',
      left: { kind: 'attribute', name: 'annee' },
      right: { kind: 'literal', value: null },
    });
  });

  it('23 : affectation puis expression finale sur la ligne suivante', () => {
    const parsed = program('R := σ[a = 1](S)\nR ∪ T');
    expect(parsed.assignments).toHaveLength(1);
    expect(parsed.assignments[0].name).toBe('R');
    expect(formatNode(parsed.assignments[0].expression)).toBe('σ[a = 1](S)');
    expect(formatNode(parsed.result)).toBe('∪(R, T)');
  });

  it('24 : un commentaire seul donne un programme vide', () => {
    expect(program('-- seulement un commentaire')).toEqual({ assignments: [], result: null });
    expect(program('')).toEqual({ assignments: [], result: null });
  });

  it('25 : sans expression finale, le résultat est absent', () => {
    const parsed = program('Tous := R union S');
    expect(parsed.result).toBeNull();
    expect(parsed.assignments.map((a) => a.name)).toEqual(['Tous']);
  });
});

describe('cas d’erreur de référence (§8)', () => {
  it.each([
    ['E1', 'σ[annee > 2020(Livre)', 'EXPECTED_TOKEN', 1, 15],
    ['E2', 'Livre union', 'EXPECTED_EXPRESSION', 1, 12],
    ['E3', 'Livre Auteur', 'MISSING_OPERATOR', 1, 7],
    ['E4', "σ[titre = 'abc](R)", 'UNTERMINATED_STRING', 1, 11],
    ['E5', 'σ[1 < a < 5](R)', 'CHAINED_COMPARISON', 1, 9],
    ['E6', 'σ[a = null](R)', 'NULL_COMPARISON', 1, 7],
    ['E7', 'union := R', 'RESERVED_WORD', 1, 1],
    ['E8', 'R ⟕ S', 'FUTURE_OPERATOR', 1, 3],
    ['E9', 'σ[genre = "Roman"](R)', 'DOUBLE_QUOTED_STRING', 1, 11],
    ['E10', 'π[](R)', 'EXPECTED_TOKEN', 1, 3],
  ])('%s : %s', (_id, input, code, line, column) => {
    expect(error(input)).toMatchObject({ code, line, column });
  });

  it('formule les messages du document de grammaire', () => {
    expect(error('σ[annee > 2020(Livre)').message).toBe(
      '« ] » attendu pour fermer la condition de σ, trouvé « ( ».',
    );
    expect(error('Livre union').message).toBe('Expression attendue après « union ».');
    expect(error('Livre Auteur').message).toBe('Opérateur attendu entre « Livre » et « Auteur ».');
    expect(error('σ[a = null](R)').message).toBe(
      'Utilisez « a is null » : une comparaison avec null n’est jamais vraie.',
    );
    expect(error('union := R').message).toBe(
      '« union » est un mot réservé et ne peut pas servir de nom.',
    );
    expect(error('π[](R)').message).toBe('Nom d’attribut attendu, trouvé « ] ».');
  });

  it('donne la ligne et la colonne sur plusieurs lignes', () => {
    expect(error('R := S\nT union\n  U V')).toMatchObject({
      code: 'MISSING_OPERATOR',
      line: 3,
      column: 5,
      span: { start: 19, end: 20 },
    });
  });
});

describe('priorités et associativité (§4)', () => {
  it.each([
    ['R ∪ S ∩ T', '∪(R, ∩(S, T))'],
    ['R − S ∪ T', '∪(−(R, S), T)'],
    ['R − S − T', '−(−(R, S), T)'],
    ['R ⋈ S × T', '×(⋈(R, S), T)'],
    ['R ∪ S ⋈ T', '∪(R, ⋈(S, T))'],
    ['R ÷ S ⋈ T', '⋈(÷(R, S), T)'],
    ['R ∩ S ∩ T', '∩(∩(R, S), T)'],
    ['σ[c = 1] R ⋈ S', '⋈(σ[c = 1](R), S)'],
    ['σ[c = 1](R ⋈ S)', 'σ[c = 1](⋈(R, S))'],
    ['π[a] σ[c = 1] R', 'π[a](σ[c = 1](R))'],
    ['(R ∪ S) ⋈ T', '⋈(∪(R, S), T)'],
    ['R ∪ (S ∪ T)', '∪(R, ∪(S, T))'],
    ['((R))', 'R'],
  ])('%s se lit %s', (input, expected) => {
    expect(tree(input)).toBe(expected);
  });

  it.each([
    ['not a = 1 and b = 2', 'and(not(a = 1), b = 2)'],
    ['a = 1 or b = 2 and c = 3', 'or(a = 1, and(b = 2, c = 3))'],
    ['not (a = 1 or b = 2)', 'not(or(a = 1, b = 2))'],
    ['(a = 1 or b = 2) and c = 3', 'and(or(a = 1, b = 2), c = 3)'],
    ['a = 1 and b = 2 and c = 3', 'and(and(a = 1, b = 2), c = 3)'],
    ['¬ ¬ a = 1', 'not(not(a = 1))'],
    ['a = 1 ∨ b = 2', 'or(a = 1, b = 2)'],
  ])('condition %s se lit %s', (input, expected) => {
    expect(condition(input)).toBe(expected);
  });
});

describe('arbre produit', () => {
  it('normalise toutes les écritures des comparateurs', () => {
    for (const op of ['<>', '!=', '≠']) expect(condition(`a ${op} 1`)).toBe('a <> 1');
    for (const op of ['<=', '≤']) expect(condition(`a ${op} 1`)).toBe('a <= 1');
    for (const op of ['>=', '≥']) expect(condition(`a ${op} 1`)).toBe('a >= 1');
    expect(condition('a < 1 or a > 2 or a = 3')).toBe('or(or(a < 1, a > 2), a = 3)');
  });

  it('lit les opérandes : attributs qualifiés, nombres, chaînes', () => {
    const { condition: compare } = program('σ[Livre.idAuteur = Auteur.idAuteur](Livre)').result;
    expect(compare.left).toEqual({
      kind: 'attribute',
      name: 'idAuteur',
      qualifier: 'Livre',
      span: { start: 2, end: 16 },
    });
    expect(condition("genre = 'Roman' and prix > 34.5")).toBe("and(genre = 'Roman', prix > 34.5)");
    expect(condition('a = - 3')).toBe('a = -3');
  });

  it('accepte les mots-clés en majuscules et les symboles de jointure', () => {
    expect(tree('R JOIN S')).toBe('⋈(R, S)');
    expect(tree('R ⨝ S')).toBe('⋈(R, S)');
    expect(tree('R ⋈[R.a = S.b] S')).toBe('⋈[R.a = S.b](R, S)');
    expect(tree('R X S')).toBe('×(R, S)');
  });

  it('numérote les nœuds en ordre postfixe (mode pas à pas)', () => {
    const nodes = postfix(program('R union S intersect σ[a = 1](T)').result);
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
    expect(nodes.map((n) => n.kind)).toEqual([
      'relation',
      'relation',
      'relation',
      'select',
      'intersect',
      'union',
    ]);
  });

  it('continue la numérotation d’une affectation à l’autre', () => {
    const parsed = program('A := R x S; B := A union T; B');
    expect(parsed.assignments[0].expression.id).toBe('n3');
    expect(parsed.assignments[1].expression.id).toBe('n6');
    expect(parsed.result.id).toBe('n7');
  });

  it('positionne chaque nœud, parenthèses fermantes comprises', () => {
    const text = 'σ[a = 1](R ∪ S)';
    const select = program(text).result;
    expect(select.span).toEqual({ start: 0, end: text.length });
    expect(select.child.span).toEqual({ start: 9, end: 14 });
    expect(select.child.left.span).toEqual({ start: 9, end: 10 });

    const join = program('(R ∪ S) ⋈ T').result;
    expect(join.span).toEqual({ start: 0, end: 11 });
    expect(join.left.span).toEqual({ start: 1, end: 6 });
  });

  it('positionne les affectations', () => {
    const [assignment] = program('Recents := σ[annee > 2020](Livre)\nRecents').assignments;
    expect(assignment.span).toEqual({ start: 0, end: 33 });
  });
});

describe('programmes et affectations', () => {
  it('accepte ← et le point-virgule facultatif (D7, D9)', () => {
    const parsed = program('A ← R union S;\nB := A x T\n-- résultat\nπ[a](B);');
    expect(parsed.assignments.map((a) => a.name)).toEqual(['A', 'B']);
    expect(formatNode(parsed.result)).toBe('π[a](B)');
  });

  it('accepte une expression sur plusieurs lignes', () => {
    expect(tree('π[titre, nom](\n  σ[annee > 2020](Livre)\n  ⋈ Auteur\n)')).toBe(
      'π[titre, nom](⋈(σ[annee > 2020](Livre), Auteur))',
    );
  });

  it('refuse une affectation après l’expression finale', () => {
    expect(error('R union S\nT := R')).toMatchObject({
      code: 'ASSIGNMENT_AFTER_RESULT',
      line: 2,
      column: 1,
    });
  });

  it('refuse un jeton inattendu après l’expression finale', () => {
    expect(error('R )')).toMatchObject({ code: 'UNEXPECTED_TOKEN', message: '« ) » inattendu.' });
    expect(error('R ; ;')).toMatchObject({ code: 'UNEXPECTED_TOKEN', column: 5 });
  });

  it('analyse les exemples de division des bases d’exemple', () => {
    expect(
      tree(
        "project[matricule, sigle](Inscription) divide project[sigle](select[programme = 'Génie logiciel'](Cours))",
      ),
    ).toBe("÷(π[matricule, sigle](Inscription), π[sigle](σ[programme = 'Génie logiciel'](Cours)))");
    expect(
      tree(
        "π[idClient, idProduit](Commande ⋈ LigneCommande) ÷ π[idProduit](σ[categorie = 'Papeterie'](Produit))",
      ),
    ).toBe(
      "÷(π[idClient, idProduit](⋈(Commande, LigneCommande)), π[idProduit](σ[categorie = 'Papeterie'](Produit)))",
    );
  });
});

describe('renommage', () => {
  it('produit mapping, newName et positional selon la forme (D6)', () => {
    expect(program('ρ[L](Livre)').result).toMatchObject({ mapping: {}, newName: 'L' });
    expect(program('ρ[L](Livre)').result.positional).toBeUndefined();
    expect(program('ρ[L(a, b)](Livre)').result).toMatchObject({
      mapping: {},
      newName: 'L',
      positional: ['a', 'b'],
    });
    const pairs = program('ρ[Livre.titre -> t, annee → an](Livre)').result;
    expect({ ...pairs.mapping }).toEqual({ 'Livre.titre': 't', annee: 'an' });
    expect(pairs.newName).toBeUndefined();
  });

  it('refuse un nouveau nom de relation qualifié', () => {
    expect(error('ρ[Livre.t](R)')).toMatchObject({
      code: 'QUALIFIED_RELATION_NAME',
      span: { start: 2, end: 9 },
    });
  });

  it('refuse de renommer deux fois le même attribut', () => {
    expect(error('ρ[a -> b, a -> c](R)')).toMatchObject({
      code: 'DUPLICATE_RENAME',
      message: 'L’attribut « a » est renommé deux fois.',
      column: 11,
    });
  });

  it('signale une flèche ou une parenthèse manquante', () => {
    expect(error('ρ[a -> b, c](R)').message).toBe(
      '« -> » attendu pour renommer « c », trouvé « ] ».',
    );
    expect(error('ρ[L(a, b](R)').message).toBe(
      '« ) » attendu pour fermer la liste des nouveaux noms, trouvé « ] ».',
    );
    expect(error('ρ[a -> ](R)').message).toBe('Nouveau nom d’attribut attendu, trouvé « ] ».');
  });
});

describe('autres erreurs de syntaxe', () => {
  it.each([
    ['σ R', '« [ » attendu après « σ », trouvé « R ».'],
    ['select[a = 1 R', '« ] » attendu pour fermer la condition de select, trouvé « R ».'],
    ['π[a R', '« ] » attendu pour fermer la liste d’attributs de π, trouvé « R ».'],
    ['ρ[L R', '« ] » attendu pour fermer le renommage de ρ, trouvé « R ».'],
    ['R ⋈[a = 1 S', '« ] » attendu pour fermer la condition de ⋈, trouvé « S ».'],
    [
      '(R union S',
      'Fin de l’expression inattendue : « ) » attendu pour fermer la parenthèse ouverte.',
    ],
    ['(R union S]', '« ) » attendu pour fermer la parenthèse ouverte, trouvé « ] ».'],
    ['(Livre Auteur)', 'Opérateur attendu entre « Livre » et « Auteur ».'],
    [')', 'Expression attendue, trouvé « ) ».'],
    ['5 := R', 'Expression attendue, trouvé « 5 ».'],
    ['R union 5', 'Expression attendue après « union », trouvé « 5 ».'],
    ['π[a,](R)', 'Nom d’attribut attendu, trouvé « ] ».'],
    ['π[Livre.](R)', 'Nom d’attribut attendu après « Livre. », trouvé « ] ».'],
    ['π[x](R)', '« x » est un mot réservé et ne peut pas servir de nom.'],
    ['σ[x = 1](R)', '« x » est un mot réservé et ne peut pas servir de nom.'],
    [
      'σ[annee](R)',
      'Opérateur de comparaison (=, <>, <, <=, >, >=) ou « is null » attendu après « annee », trouvé « ] ».',
    ],
    ['σ[a is 5](R)', '« null » attendu après « is », trouvé « 5 ».'],
    ['σ[a IS NOT 5](R)', '« null » attendu après « IS not », trouvé « 5 ».'],
    ['σ[a = -](R)', 'Nombre attendu après « - », trouvé « ] ».'],
    ['σ[a = ](R)', 'Valeur ou nom d’attribut attendu, trouvé « ] ».'],
    ['σ[(a = 1](R)', '« ) » attendu pour fermer la condition, trouvé « ] ».'],
    [
      'σ[a <> null](R)',
      'Utilisez « a is not null » : une comparaison avec null n’est jamais vraie.',
    ],
    [
      'σ[null = a](R)',
      'Utilisez « attribut is null » : une comparaison avec null n’est jamais vraie.',
    ],
    ['σ[a = 1', 'Fin de l’expression inattendue : « ] » attendu pour fermer la condition de σ.'],
  ])('%s', (input, message) => {
    expect(error(input).message).toBe(message);
  });

  it('souligne le jeton fautif', () => {
    expect(error('σ[annee > 2020(Livre)').span).toEqual({ start: 14, end: 15 });
    expect(error('Livre union').span).toEqual({ start: 11, end: 11 });
  });
});
