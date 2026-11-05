/**
 * Bases de données d'exemple intégrées (EF-01).
 * Chaque fichier JSON suit le type `Relation` du moteur ; les données sont inventées pour le projet.
 */

/** @import { Relation } from '../engine/types.js' */

import bibliotheque from './bibliotheque.json';
import commerce from './commerce.json';
import universite from './universite.json';

/**
 * @typedef {object} SampleDatabase
 * @property {string} id identifiant stable, utilisé dans l'URL de partage
 * @property {string} name nom affiché
 * @property {string} description courte description affichée dans le sélecteur
 * @property {Relation[]} relations relations de la base
 */

/** @type {readonly SampleDatabase[]} */
export const sampleDatabases = Object.freeze([
  /** @type {SampleDatabase} */ (bibliotheque),
  /** @type {SampleDatabase} */ (universite),
  /** @type {SampleDatabase} */ (commerce),
]);

/**
 * Retourne la base d'exemple correspondant à l'identifiant, ou `undefined`.
 * @param {string} id
 * @returns {SampleDatabase | undefined}
 */
export function getSampleDatabase(id) {
  return sampleDatabases.find((db) => db.id === id);
}
