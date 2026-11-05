/**
 * Exercices préchargés : 5 par base d'exemple, avec leur énoncé et une solution.
 * Chaque solution est vérifiée par les tests : résultat non vide et identique avec SQLite.
 */

/**
 * @typedef {object} Exercise
 * @property {string} id identifiant stable, utilisé dans l'URL de partage
 * @property {string} title titre court
 * @property {string} statement énoncé
 * @property {string} solution expression solution
 */

/** @type {Readonly<Record<string, readonly Exercise[]>>} */
export const exercises = Object.freeze({
  bibliotheque: [
    {
      id: 'livres-recents',
      title: 'Livres récents',
      statement: 'Donnez le titre des livres publiés après 2020.',
      solution: 'π[titre](σ[annee > 2020](Livre))',
    },
    {
      id: 'auteurs-sans-livre',
      title: 'Auteurs sans livre',
      statement:
        'Donnez le nom et le prénom des auteurs qui n’ont écrit aucun livre de la bibliothèque.',
      solution:
        'SansLivre := π[idAuteur](Auteur) − π[idAuteur](Livre)\nπ[nom, prenom](SansLivre ⋈ Auteur)',
    },
    {
      id: 'emprunts-en-cours',
      title: 'Emprunts en cours',
      statement:
        'Donnez le nom et le prénom des membres qui ont un emprunt non rendu (date de retour inconnue).',
      solution: 'π[nom, prenom](σ[dateRetour is null](Emprunt) ⋈ Membre)',
    },
    {
      id: 'tous-les-livres-morel',
      title: 'Lecteurs fidèles',
      statement:
        'Donnez le nom et le prénom des membres qui ont emprunté tous les livres d’Aline Morel.',
      solution:
        "LivresMorel := π[idLivre](σ[nom = 'Morel' and prenom = 'Aline'](Auteur) ⋈ Livre)\n" +
        'Fideles := π[idMembre, idLivre](Emprunt) ÷ LivresMorel\n' +
        'π[nom, prenom](Fideles ⋈ Membre)',
    },
    {
      id: 'annee-inconnue',
      title: 'Le piège du NULL',
      statement:
        'Donnez le titre des livres dont l’année de publication est inconnue. ' +
        'Pourquoi σ[annee = null] ne fonctionne-t-il pas ?',
      solution: 'π[titre](σ[annee is null](Livre))',
    },
  ],
  universite: [
    {
      id: 'admissions-recentes',
      title: 'Admissions récentes',
      statement:
        'Donnez le matricule et le nom des étudiants en génie logiciel admis en 2023 ou après.',
      solution:
        "π[matricule, nom](σ[programme = 'Génie logiciel' and anneeAdmission >= 2023](Etudiant))",
    },
    {
      id: 'professeurs-sans-cours',
      title: 'Professeurs sans cours',
      statement:
        'Donnez le nom et le prénom des professeurs qui ne sont responsables d’aucun cours.',
      solution:
        'SansCours := π[idProf](Professeur) − π[idProf](Cours)\nπ[nom, prenom](SansCours ⋈ Professeur)',
    },
    {
      id: 'tous-les-cours-glo',
      title: 'Tous les cours du programme',
      statement:
        'Donnez le matricule des étudiants inscrits à tous les cours du programme de génie logiciel.',
      solution:
        "π[matricule, sigle](Inscription) ÷ π[sigle](σ[programme = 'Génie logiciel'](Cours))",
    },
    {
      id: 'piege-jointure-naturelle',
      title: 'Le piège de la jointure naturelle',
      statement:
        'Calculez Etudiant ⋈ Professeur. Sur quels attributs la jointure se fait-elle, ' +
        'et pourquoi le résultat est-il si petit ?',
      solution: 'Etudiant ⋈ Professeur',
    },
    {
      id: 'bonnes-notes',
      title: 'Bonnes notes',
      statement:
        'Pour chaque note de 85 ou plus, donnez le nom de l’étudiant et le titre du cours. ' +
        'Attention : Etudiant et Cours ont tous deux un attribut programme.',
      solution:
        'π[nom, titre](σ[note >= 85](Inscription) ⋈ π[matricule, nom](Etudiant) ⋈ π[sigle, titre](Cours))',
    },
  ],
  commerce: [
    {
      id: 'informatique-abordable',
      title: 'Informatique abordable',
      statement:
        'Donnez le nom et le prix des produits de la catégorie Informatique à moins de 50 $.',
      solution: "π[nom, prix](σ[categorie = 'Informatique' and prix < 50](Produit))",
    },
    {
      id: 'clients-sans-commande',
      title: 'Clients sans commande',
      statement: 'Donnez le nom des clients qui n’ont jamais commandé.',
      solution:
        'SansCommande := π[idClient](Client) − π[idClient](Commande)\nπ[nom](SansCommande ⋈ Client)',
    },
    {
      id: 'commandes-non-livrees',
      title: 'Commandes non livrées',
      statement: 'Donnez le numéro des commandes pas encore livrées, avec le nom du client.',
      solution: 'π[idCommande, nom](σ[dateLivraison is null](Commande) ⋈ Client)',
    },
    {
      id: 'toute-la-papeterie',
      title: 'Toute la papeterie',
      statement: 'Donnez le nom des clients qui ont commandé tous les produits de papeterie.',
      solution:
        "Papeterie := π[idProduit](σ[categorie = 'Papeterie'](Produit))\n" +
        'Acheteurs := π[idClient, idProduit](Commande ⋈ LigneCommande) ÷ Papeterie\n' +
        'π[nom](Acheteurs ⋈ Client)',
    },
    {
      id: 'montreal-ou-sans-courriel',
      title: 'Logique à trois valeurs',
      statement: 'Donnez le nom des clients situés à Montréal ou dont le courriel est inconnu.',
      solution: "π[nom](σ[ville = 'Montréal' or courriel is null](Client))",
    },
  ],
});

/**
 * @param {string} databaseId
 * @returns {readonly Exercise[]}
 */
export function getExercises(databaseId) {
  return exercises[databaseId] ?? [];
}
