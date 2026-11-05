import { describe, expect, it } from 'vitest';
import { getSampleDatabase, sampleDatabases } from '../../src/data/index.js';

const VALID_TYPES = new Set(['number', 'text', 'date']);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Relations attendues par base, d'après le PRD (section « Bases d'exemple »). */
const EXPECTED_RELATIONS = {
  bibliotheque: ['Auteur', 'Livre', 'Membre', 'Emprunt'],
  universite: ['Etudiant', 'Cours', 'Inscription', 'Professeur'],
  commerce: ['Client', 'Produit', 'Commande', 'LigneCommande'],
};

/**
 * Clés étrangères implicites : chaque valeur non NULL de `from` doit exister dans `to`.
 * Le modèle du PRD ne déclare pas de clés ; ce test garantit seulement des données cohérentes.
 */
const FOREIGN_KEYS = [
  ['bibliotheque', 'Livre.idAuteur', 'Auteur.idAuteur'],
  ['bibliotheque', 'Emprunt.idMembre', 'Membre.idMembre'],
  ['bibliotheque', 'Emprunt.idLivre', 'Livre.idLivre'],
  ['universite', 'Cours.idProf', 'Professeur.idProf'],
  ['universite', 'Inscription.matricule', 'Etudiant.matricule'],
  ['universite', 'Inscription.sigle', 'Cours.sigle'],
  ['commerce', 'Commande.idClient', 'Client.idClient'],
  ['commerce', 'LigneCommande.idCommande', 'Commande.idCommande'],
  ['commerce', 'LigneCommande.idProduit', 'Produit.idProduit'],
];

/**
 * @param {string} type
 * @param {unknown} value
 */
function matchesType(type, value) {
  if (value === null) return true;
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'text':
      return typeof value === 'string';
    case 'date':
      return (
        typeof value === 'string' &&
        ISO_DATE.test(value) &&
        new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
      );
    default:
      return false;
  }
}

/**
 * @param {string} dbId
 * @param {string} qualifiedName forme `Relation.attribut`
 */
function columnValues(dbId, qualifiedName) {
  const [relationName, attributeName] = qualifiedName.split('.');
  const relation = getSampleDatabase(dbId)?.relations.find((r) => r.name === relationName);
  if (!relation) throw new Error(`Relation inconnue : ${qualifiedName}`);
  const index = relation.attributes.findIndex((a) => a.name === attributeName);
  if (index < 0) throw new Error(`Attribut inconnu : ${qualifiedName}`);
  return relation.tuples.map((tuple) => tuple[index]);
}

describe('bases d’exemple', () => {
  it('fournit les trois bases du PRD avec des identifiants uniques', () => {
    expect(sampleDatabases.map((db) => db.id)).toEqual(['bibliotheque', 'universite', 'commerce']);
  });

  it('retrouve une base par identifiant', () => {
    expect(getSampleDatabase('universite')?.name).toBe('Université');
    expect(getSampleDatabase('inconnue')).toBeUndefined();
  });

  describe.each(sampleDatabases.map((db) => [db.id, db]))('%s', (id, db) => {
    it('contient les relations attendues', () => {
      expect(db.relations.map((r) => r.name)).toEqual(EXPECTED_RELATIONS[id]);
    });

    it('a un nom et une description', () => {
      expect(db.name.length).toBeGreaterThan(0);
      expect(db.description.length).toBeGreaterThan(0);
    });

    it('contient au moins une valeur NULL', () => {
      const hasNull = db.relations.some((r) => r.tuples.some((t) => t.includes(null)));
      expect(hasNull).toBe(true);
    });

    describe.each(db.relations.map((r) => [r.name, r]))('relation %s', (_name, relation) => {
      it('a un nom et des attributs utilisables comme identifiants', () => {
        expect(relation.name).toMatch(IDENTIFIER);
        for (const attribute of relation.attributes) {
          expect(attribute.name).toMatch(IDENTIFIER);
          expect(VALID_TYPES.has(attribute.type)).toBe(true);
        }
      });

      it('n’a pas deux attributs de même nom', () => {
        const names = relation.attributes.map((a) => a.name);
        expect(new Set(names).size).toBe(names.length);
      });

      it('contient entre 5 et 30 tuples', () => {
        expect(relation.tuples.length).toBeGreaterThanOrEqual(5);
        expect(relation.tuples.length).toBeLessThanOrEqual(30);
      });

      it('a des tuples de la bonne arité et du bon type', () => {
        for (const tuple of relation.tuples) {
          expect(tuple).toHaveLength(relation.attributes.length);
          relation.attributes.forEach((attribute, i) => {
            expect(
              matchesType(attribute.type, tuple[i]),
              `${relation.name}.${attribute.name} = ${JSON.stringify(tuple[i])}`,
            ).toBe(true);
          });
        }
      });

      it('ne contient pas de doublons (sémantique d’ensemble)', () => {
        const keys = relation.tuples.map((t) => JSON.stringify(t));
        expect(new Set(keys).size).toBe(keys.length);
      });
    });
  });

  it.each(FOREIGN_KEYS)('%s : %s référence %s', (dbId, from, to) => {
    const targets = new Set(columnValues(dbId, to));
    const dangling = columnValues(dbId, from).filter((v) => v !== null && !targets.has(v));
    expect(dangling).toEqual([]);
  });
});
