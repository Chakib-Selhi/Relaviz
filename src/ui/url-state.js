/**
 * Partage par URL (EF-12) : la base choisie et l'expression sont encodées dans le fragment de
 * l'adresse (`#db=bibliotheque&q=...`), avec l'exercice choisi (`ex=`) le cas échéant. Le fragment
 * n'est jamais envoyé au serveur.
 */

/**
 * @param {string} hash fragment de l'adresse, avec ou sans `#`
 * @param {string[]} databaseIds identifiants valides
 * @returns {{ databaseId?: string, expression?: string, exerciseId?: string }}
 */
export function readState(hash, databaseIds) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const databaseId = params.get('db') ?? undefined;
  const expression = params.get('q') ?? undefined;
  const exerciseId = params.get('ex') ?? undefined;
  return {
    ...(databaseId && databaseIds.includes(databaseId) && { databaseId }),
    ...(expression !== undefined && { expression }),
    ...(exerciseId && { exerciseId }),
  };
}

/**
 * @param {string} databaseId
 * @param {string} expression
 * @param {string | null} [exerciseId]
 * @returns {string} fragment, avec `#`
 */
export function writeState(databaseId, expression, exerciseId = null) {
  const params = new URLSearchParams({ db: databaseId });
  if (exerciseId) params.set('ex', exerciseId);
  params.set('q', expression);
  return `#${params.toString()}`;
}
