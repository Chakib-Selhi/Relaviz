/**
 * Partage par URL (EF-12) : la base choisie et l'expression sont encodées dans le fragment de
 * l'adresse (`#db=bibliotheque&q=...`). Le fragment n'est jamais envoyé au serveur.
 */

/**
 * @param {string} hash fragment de l'adresse, avec ou sans `#`
 * @param {string[]} databaseIds identifiants valides
 * @returns {{ databaseId?: string, expression?: string }}
 */
export function readState(hash, databaseIds) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const databaseId = params.get('db') ?? undefined;
  const expression = params.get('q') ?? undefined;
  return {
    ...(databaseId && databaseIds.includes(databaseId) && { databaseId }),
    ...(expression !== undefined && { expression }),
  };
}

/**
 * @param {string} databaseId
 * @param {string} expression
 * @returns {string} fragment, avec `#`
 */
export function writeState(databaseId, expression) {
  return `#${new URLSearchParams({ db: databaseId, q: expression }).toString()}`;
}
