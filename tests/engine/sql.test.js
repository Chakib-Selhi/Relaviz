import { beforeAll, describe, expect, it } from 'vitest';
import { getSampleDatabase } from '../../src/data/index.js';
import { analyze } from '../../src/engine/index.js';
import {
  compareResults,
  createSqlDatabase,
  loadSqlJs,
  runQuery,
  verifyWithSql,
} from '../../src/engine/sql-oracle.js';
import { queryForStep, quoteIdentifier } from '../../src/engine/sql-translator.js';

const databases = {
  bibliotheque: getSampleDatabase('bibliotheque'),
  universite: getSampleDatabase('universite'),
  commerce: getSampleDatabase('commerce'),
  // Petite base pour les cas limites : NULL dans une division, noms accentués ou réservés en SQL.
  limites: {
    relations: [
      {
        name: 'R',
        attributes: [
          { name: 'a', type: 'number' },
          { name: 'b', type: 'text' },
        ],
        tuples: [
          [1, 'x'],
          [1, null],
          [2, 'x'],
          [null, 'x'],
          [null, null],
        ],
      },
      { name: 'S', attributes: [{ name: 'b', type: 'text' }], tuples: [['x'], [null]] },
      {
        name: 'Notes',
        attributes: [
          { name: 'Année', type: 'number' },
          { name: 'order', type: 'text' },
        ],
        tuples: [
          [2024, "l'un"],
          [2025, 'deux'],
          [null, null],
        ],
      },
    ],
  },
};

/** @type {Awaited<ReturnType<typeof loadSqlJs>>} */
let SQL;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

/**
 * Suite d'expressions exécutées par le moteur ET par SQLite. Elle couvre chaque opérateur, les
 * NULL, les affectations, les noms en double et les cas limites de chaque base.
 */
const SUITE = {
  bibliotheque: [
    'Livre',
    'σ[annee > 2020](Livre)',
    'π[titre](σ[annee > 2020](Livre))',
    'σ[not annee > 2020](Livre)',
    "σ[annee > 2020 or genre = 'Conte'](Livre)",
    "σ[not (annee > 2020 and genre = 'Roman')](Livre)",
    'σ[annee is null](Livre)',
    'σ[annee is not null and idAuteur is not null](Livre)',
    "σ[titre = 'Le Souffle de l''Atlas'](Livre)",
    "σ[dateEmprunt >= '2025-09-01' and dateRetour is null](Emprunt)",
    'σ[dateRetour > dateEmprunt](Emprunt)',
    'σ[annee >= -5 and annee <> 2012](Livre)',
    'π[idMembre](Emprunt)',
    'π[genre, idAuteur](Livre)',
    'ρ[L](Livre)',
    'ρ[L(i, t, a, an, g)](Livre)',
    'π[t](ρ[titre -> t, annee -> an](Livre))',
    'Membre × Auteur',
    'σ[Membre.nom = Auteur.nom](Membre × Auteur)',
    'Livre ⋈ Auteur',
    'Auteur ⋈ Membre',
    'Emprunt ⋈ Livre ⋈ Auteur',
    'π[titre](Livre) ⋈ π[nom](Auteur)',
    'Livre ⋈[Livre.idAuteur = Auteur.idAuteur] Auteur',
    'Livre ⋈[Livre.idAuteur = Auteur.idAuteur and annee > anneeNaissance] Auteur',
    'π[nom](Auteur) ∪ π[nom](Membre)',
    'π[nom](Auteur) ∪ π[ville](Membre)',
    'π[idLivre](Livre) − π[idLivre](Emprunt)',
    'π[nom, prenom](Auteur) ∩ π[nom, prenom](Membre)',
    'π[idMembre, idLivre](Emprunt) ÷ π[idLivre](σ[idAuteur = 3](Livre))',
    'π[idMembre, idLivre](Emprunt) ÷ π[idLivre](σ[idAuteur = 99](Livre))',
    'Emprunt ÷ π[idLivre](σ[idAuteur = 3](Livre))',
    'Recents := σ[annee > 2020](Livre)\nπ[titre, nom](Recents ⋈ Auteur)',
    'A := Livre ⋈[Livre.idAuteur = Auteur.idAuteur] Auteur\nπ[A.titre, Auteur.idAuteur, Livre.idAuteur](A)',
    'A := π[nom](Auteur)',
    'A := Livre\nB := σ[annee > 2000](A)\nB ∩ A',
    'π[titre](Livre) × ρ[L2](π[titre](Livre))',
    "π[Livre.titre, L2.titre](σ[Livre.annee < L2.annee and L2.genre = 'Poésie'](Livre × ρ[L2](Livre)))",
  ],
  universite: [
    "π[matricule, sigle](Inscription) ÷ π[sigle](σ[programme = 'Génie logiciel'](Cours))",
    'Etudiant ⋈ Professeur',
    'Etudiant ⋈ Cours',
    'π[matricule, sigle](Inscription)',
    'σ[note >= 80 or note is null](Inscription)',
    "σ[programme <> 'Informatique'](Etudiant)",
    'π[nom, prenom](Etudiant) − π[nom, prenom](Professeur)',
    'Cours ⋈[Cours.idProf = Professeur.idProf] Professeur',
    'π[sigle](Cours) − π[sigle](Inscription)',
  ],
  commerce: [
    "π[idClient, idProduit](Commande ⋈ LigneCommande) ÷ π[idProduit](σ[categorie = 'Papeterie'](Produit))",
    'σ[prix > 10 or prix <= 10](Produit)',
    'σ[prix > 34.5](Produit)',
    'Client ⋈ Produit',
    'π[idClient](Client) − π[idClient](Commande)',
    'σ[dateLivraison is null](Commande) ⋈ Client',
    "σ[ville = 'Montréal' or courriel is null](Client)",
  ],
  limites: [
    'R ÷ S',
    'R ∪ π[a, b](R)',
    'R − π[a, b](σ[a = 1](R))',
    'R ∩ R',
    'R ⋈ S',
    "σ[a = 1 or b = 'x'](R)",
    'σ[not (a = 1)](R)',
    'Notes',
    "σ[Année > 2024 or order = 'l''un'](Notes)",
    'π[order](Notes) ∪ π[b](R)',
  ],
};

const cases = Object.entries(SUITE).flatMap(([database, texts]) =>
  texts.map((text) => [database, text]),
);

describe('concordance du moteur et de SQLite (EF-10)', () => {
  it.each(cases)('%s : %s', (database, text) => {
    const analysis = analyze(text, databases[database]);
    expect(analysis.ok, analysis.ok ? '' : analysis.error.message).toBe(true);
    const verification = verifyWithSql(SQL, databases[database], analysis.sql.sql, analysis.result);
    expect(verification, analysis.sql.sql).toMatchObject({
      identical: true,
      onlyEngine: [],
      onlySql: [],
    });
  });

  it.each(cases)('%s : chaque étape de %s', (database, text) => {
    const analysis = analyze(text, databases[database]);
    const db = createSqlDatabase(SQL, databases[database]);
    try {
      for (const step of analysis.sql.steps) {
        const engine = analysis.results.get(step.nodeId);
        const sqlTuples = runQuery(db, queryForStep(analysis.sql, step.name));
        expect(
          compareResults(engine.tuples, sqlTuples).identical,
          `${step.name} : ${step.sql}`,
        ).toBe(true);
      }
    } finally {
      db.close();
    }
  });
});

describe('traduction', () => {
  it('met les identifiants entre guillemets seulement si nécessaire', () => {
    expect(quoteIdentifier('Livre')).toBe('Livre');
    expect(quoteIdentifier('Année')).toBe('"Année"');
    expect(quoteIdentifier('order')).toBe('"order"');
    expect(quoteIdentifier('Livre.idAuteur')).toBe('"Livre.idAuteur"');
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
  });

  it('produit une CTE par nœud non feuille, dans l’ordre du mode pas à pas', () => {
    const analysis = analyze('π[titre](σ[annee > 2020](Livre))', databases.bibliotheque);
    expect(analysis.sql.sql).toBe(
      [
        'WITH',
        'n2(idLivre, titre, idAuteur, annee, genre) AS (',
        '  -- σ[annee > 2020]',
        '  SELECT DISTINCT * FROM Livre',
        '  WHERE annee > 2020',
        '),',
        'n3(titre) AS (',
        '  -- π[titre]',
        '  SELECT DISTINCT titre FROM n2',
        ')',
        'SELECT * FROM n3;',
      ].join('\n'),
    );
    expect(analysis.sql.steps.map((s) => s.nodeId)).toEqual(['n2', 'n3']);
  });

  it('nomme les colonnes en double avec leur source', () => {
    const analysis = analyze(
      'π[idLivre, idAuteur](Livre) × π[idAuteur](Auteur)',
      databases.bibliotheque,
    );
    expect(analysis.sql.ctes.at(-1)).toMatch(
      /^n5\(idLivre, "Livre\.idAuteur", "Auteur\.idAuteur"\)/,
    );
  });

  it('traduit la division par une double négation avec IS', () => {
    const { sql } = analyze('R ÷ S', databases.limites).sql;
    expect(sql).toContain('WHERE NOT EXISTS (');
    expect(sql).toContain('r2.a IS r1.a AND r2.b IS s.b');
  });

  it('écrit les conditions avec les parenthèses nécessaires', () => {
    const { sql } = analyze(
      "σ[not (annee > 2020 or genre = 'Conte') and titre is not null](Livre)",
      databases.bibliotheque,
    ).sql;
    expect(sql).toContain("WHERE NOT (annee > 2020 OR genre = 'Conte') AND titre IS NOT NULL");
  });

  it('nomme les affectations et lit directement une relation seule', () => {
    expect(analyze('A := Livre', databases.bibliotheque).sql.sql).toBe(
      'WITH\nA(idLivre, titre, idAuteur, annee, genre) AS (\n  SELECT * FROM Livre\n)\nSELECT * FROM A;',
    );
    expect(analyze('Livre', databases.bibliotheque).sql).toEqual({
      sql: 'SELECT * FROM Livre;',
      steps: [],
      ctes: [],
    });
    expect(analyze('-- vide', databases.bibliotheque).sql).toBeNull();
  });
});

describe('oracle', () => {
  it('liste les tuples présents d’un seul côté', () => {
    expect(compareResults([[1], [2], [null]], [[2], [3], [null]])).toEqual({
      identical: false,
      onlyEngine: [[1]],
      onlySql: [[3]],
    });
  });

  it('retourne une liste vide pour une instruction sans résultat', () => {
    const db = createSqlDatabase(SQL, databases.limites);
    expect(runQuery(db, 'CREATE TABLE T (x)')).toEqual([]);
    db.close();
  });

  it('charge sql.js une seule fois', async () => {
    expect(await loadSqlJs()).toBe(SQL);
  });
});
