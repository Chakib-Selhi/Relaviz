import { describe, expect, it } from 'vitest';
import { getSampleDatabase } from '../../src/data/index.js';
import { and, compare, distinct, not, or } from '../../src/engine/evaluator.js';
import { analyze } from '../../src/engine/index.js';

const databases = {
  bibliotheque: getSampleDatabase('bibliotheque'),
  universite: getSampleDatabase('universite'),
  commerce: getSampleDatabase('commerce'),
};

/** Évalue un texte et retourne la relation résultat. */
function run(text, database = 'bibliotheque') {
  const analysis = analyze(text, databases[database]);
  if (!analysis.ok) throw new Error(`Erreur inattendue pour ${text} : ${analysis.error.message}`);
  return analysis.result;
}

/** Tuples triés, pour comparer des ensembles sans tenir compte de l'ordre. */
const rows = (text, database) =>
  run(text, database)
    .tuples.map((t) => JSON.stringify(t))
    .sort();
const sorted = (tuples) => tuples.map((t) => JSON.stringify(t)).sort();
const count = (text, database) => run(text, database).tuples.length;

// Les résultats attendus ont été obtenus indépendamment avec SQLite sur les mêmes données.
describe('opérateurs sur les bases d’exemple', () => {
  it('σ et π', () => {
    expect(rows('π[titre](σ[annee > 2020](Livre))')).toEqual(
      sorted([
        ['Hiver boréal'],
        ['Fragments de lumière'],
        ['Bases de données pour tous'],
        ["Le Souffle de l'Atlas"],
      ]),
    );
  });

  it('π élimine les doublons (sémantique d’ensemble)', () => {
    expect(count('π[idMembre](Emprunt)')).toBe(6);
    expect(count('π[matricule, sigle](Inscription)', 'universite')).toBe(20);
  });

  it('ρ garde les tuples', () => {
    expect(rows('ρ[L(t)](π[titre](Livre))')).toEqual(rows('π[titre](Livre)'));
  });

  it('× forme toutes les paires', () => {
    expect(count('Membre × Auteur')).toBe(7 * 8);
    expect(count('σ[Membre.nom = Auteur.nom](Membre × Auteur)')).toBe(1);
  });

  it('⋈ naturelle sur les attributs communs', () => {
    expect(count('Livre ⋈ Auteur')).toBe(12);
    expect(run('Auteur ⋈ Membre').tuples).toEqual([
      [3, 'Morel', 'Aline', 'France', 1975, 6, 'Québec', '2019-11-30'],
    ]);
    expect(run('Etudiant ⋈ Professeur', 'universite').tuples).toEqual([
      [1003, 'Fortin', 'Marc', 'Informatique', 2022, 1, 'Informatique', 'B-210'],
    ]);
  });

  it('⋈ thêta', () => {
    const theta = run('Livre ⋈[Livre.idAuteur = Auteur.idAuteur] Auteur');
    expect(theta.tuples).toHaveLength(12);
    expect(theta.attributes).toHaveLength(10);
  });

  it('∪, − et ∩', () => {
    expect(count('π[nom](Auteur) ∪ π[nom](Membre)')).toBe(14);
    expect(run('π[idLivre](Livre) − π[idLivre](Emprunt)').tuples).toEqual([[13]]);
    expect(run('π[nom, prenom](Auteur) ∩ π[nom, prenom](Membre)').tuples).toEqual([
      ['Morel', 'Aline'],
    ]);
  });

  it('÷ sur les trois bases', () => {
    expect(
      rows(
        "π[matricule, sigle](Inscription) ÷ π[sigle](σ[programme = 'Génie logiciel'](Cours))",
        'universite',
      ),
    ).toEqual(sorted([[1001], [1004]]));
    expect(rows('π[idMembre, idLivre](Emprunt) ÷ π[idLivre](σ[idAuteur = 3](Livre))')).toEqual(
      sorted([[2], [5]]),
    );
    expect(
      rows(
        "π[idClient, idProduit](Commande ⋈ LigneCommande) ÷ π[idProduit](σ[categorie = 'Papeterie'](Produit))",
        'commerce',
      ),
    ).toEqual(sorted([[1], [5]]));
  });

  it('⋈ sans attribut commun équivaut à × et produit un avertissement (S5)', () => {
    const analysis = analyze('π[titre](Livre) ⋈ π[nom](Auteur)', databases.bibliotheque);
    expect(analysis.result.tuples).toHaveLength(13 * 8);
    expect(analysis.warnings).toEqual([
      expect.objectContaining({ code: 'NATURAL_JOIN_AS_PRODUCT', line: 1, column: 1 }),
    ]);
  });

  it('÷ par une relation vide garde tous les groupes', () => {
    expect(count('π[idMembre, idLivre](Emprunt) ÷ π[idLivre](σ[idAuteur = 99](Livre))')).toBe(6);
  });
});

describe('NULL et logique à trois valeurs (S4)', () => {
  it('σ ne garde que les conditions vraies', () => {
    expect(count('σ[not annee > 2020](Livre)')).toBe(7);
    expect(count('σ[prix > 10 or prix <= 10](Produit)', 'commerce')).toBe(9);
  });

  it('applique les tables de Kleene', () => {
    expect(count("σ[annee > 2020 or genre = 'Conte'](Livre)")).toBe(5);
    expect(count("σ[not (annee > 2020 and genre = 'Roman')](Livre)")).toBe(11);
  });

  it('teste la nullité', () => {
    expect(rows('π[idLivre](σ[annee is null](Livre))')).toEqual(sorted([[11], [13]]));
    expect(count('σ[dateRetour is null](Emprunt)')).toBe(5);
    expect(count('σ[dateRetour is not null](Emprunt)')).toBe(13);
  });

  it('compare les dates comme des chaînes ISO', () => {
    expect(count("σ[dateEmprunt >= '2025-09-01'](Emprunt)")).toBe(4);
  });

  it('n’associe jamais deux NULL dans une jointure naturelle', () => {
    const database = {
      relations: [
        { name: 'R', attributes: [{ name: 'a', type: 'number' }], tuples: [[1], [null]] },
        { name: 'S', attributes: [{ name: 'a', type: 'number' }], tuples: [[1], [null]] },
      ],
    };
    const analysis = analyze('R ⋈ S', database);
    expect(analysis.result.tuples).toEqual([[1]]);
    expect(analyze('R ∩ S', database).result.tuples).toEqual([[1], [null]]);
    expect(analyze('R − S', database).result.tuples).toEqual([]);
  });

  it.each([
    [true, true, true, true],
    [true, false, false, true],
    [true, null, null, true],
    [false, null, false, null],
    [null, null, null, null],
  ])('%s and/or %s', (a, b, conjunction, disjunction) => {
    expect(and(a, b)).toBe(conjunction);
    expect(and(b, a)).toBe(conjunction);
    expect(or(a, b)).toBe(disjunction);
    expect(or(b, a)).toBe(disjunction);
  });

  it('not et compare', () => {
    expect([not(true), not(false), not(null)]).toEqual([false, true, null]);
    expect(compare(null, '=', null)).toBeNull();
    expect(['=', '<>', '<', '<=', '>', '>='].map((op) => compare(2, op, 3))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(compare('Zoé', '<', 'Émile')).toBe(true);
  });

  it('distinct rend deux NULL égaux et distingue 1 de « 1 »', () => {
    expect(distinct([[null], [null], [1], ['1']])).toEqual([[null], [1], ['1']]);
  });
});

describe('programme et trace', () => {
  it('évalue les affectations puis l’expression finale', () => {
    const text = 'Recents := σ[annee > 2020](Livre)\nπ[titre, nom](Recents ⋈ Auteur)';
    expect(rows(text)).toEqual(
      sorted([
        ['Hiver boréal', 'Tremblay'],
        ['Fragments de lumière', 'Morel'],
        ['Bases de données pour tous', 'Lefebvre'],
        ["Le Souffle de l'Atlas", 'Benali'],
      ]),
    );
  });

  it('affiche la dernière affectation sans expression finale', () => {
    const analysis = analyze('A := π[nom](Auteur)', databases.bibliotheque);
    expect(analysis.root).toBe(analysis.program.assignments[0].expression);
    expect(analysis.result.tuples).toHaveLength(8);
  });

  it('retourne un résultat vide pour un programme vide', () => {
    const analysis = analyze('-- rien', databases.bibliotheque);
    expect(analysis).toMatchObject({ ok: true, root: null, result: null, trace: [] });
  });

  it('produit une étape par nœud, en ordre postfixe', () => {
    const analysis = analyze(
      'π[titre](σ[annee > 2020](Livre)) ∪ π[nom](Auteur)',
      databases.bibliotheque,
    );
    expect(analysis.trace.map((step) => step.nodeId)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
    expect(analysis.trace.map((step) => step.result.name)).toEqual([
      'Livre',
      'σ[annee > 2020]',
      'π[titre]',
      'Auteur',
      'π[nom]',
      '∪',
    ]);
    expect(analysis.trace.map((step) => step.result.tuples.length)).toEqual([13, 4, 4, 8, 8, 12]);
    for (const step of analysis.trace) expect(step.durationMs).toBeGreaterThanOrEqual(0);
    expect(analysis.results.get('n6')).toBe(analysis.result);
  });

  it('signale les erreurs de syntaxe avec leur étape', () => {
    expect(analyze('Livre union', databases.bibliotheque)).toMatchObject({
      ok: false,
      stage: 'syntax',
      error: { code: 'EXPECTED_EXPRESSION' },
    });
  });

  it('évalue une expression de 10 opérateurs en moins de 100 ms', () => {
    const text =
      "π[titre, nom](σ[annee > 2000 and genre <> 'Poésie'](Livre) ⋈ Auteur) ∪ " +
      'π[titre, nom](σ[annee < 1990](Livre) ⋈ Auteur) − ' +
      "π[titre, nom](σ[pays = 'France'](Livre ⋈ Auteur))";
    const start = performance.now();
    const analysis = analyze(text, databases.bibliotheque);
    expect(performance.now() - start).toBeLessThan(100);
    expect(analysis.ok).toBe(true);
  });
});
