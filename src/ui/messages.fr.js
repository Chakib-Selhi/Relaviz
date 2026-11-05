/**
 * Textes de l'interface, centralisés pour une traduction future (EF-16).
 * Les messages d'erreur du moteur sont dans src/engine/errors.js.
 */
export const UI = {
  appTitle: 'RelaViz',
  appSubtitle: 'Visualiseur d’algèbre relationnelle',
  database: 'Base de données',
  share: 'Copier le lien',
  shareDone: 'Lien copié',
  shareFallback: 'Copiez l’adresse de la page pour partager cet exercice.',
  schemaTitle: 'Schéma',
  tuples: (n) => `${n} tuple${n > 1 ? 's' : ''}`,
  types: { number: 'nombre', text: 'texte', date: 'date' },
  editorLabel: 'Expression d’algèbre relationnelle',
  editorHelp:
    'Symboles ou mots-clés : σ select, π project, ρ rename, × x, ⋈ join, ∪ union, − minus, ∩ intersect, ÷ divide. ' +
    'Affectation : Nom := expression. Commentaire : -- texte.',
  symbolsLabel: 'Insérer un symbole',
  shortcut: (key) => `Raccourci : Alt+${key}`,
  errorAt: (line, column) => `Ligne ${line}, colonne ${column}`,
  syntaxError: 'Erreur de syntaxe',
  schemaError: 'Erreur de schéma',
  warning: 'Avertissement',
  treeTitle: 'Arbre d’opérations',
  treeEmpty: 'Saisissez une expression pour afficher son arbre.',
  treeLabel: 'Arbre d’opérations. Flèches : parcourir les nœuds.',
  assignmentTree: (name) => `${name} :=`,
  resultTree: 'Résultat',
  stepTitle: 'Table de l’étape',
  stepOf: (index, total) => `Étape ${index} sur ${total}`,
  previous: 'Étape précédente',
  next: 'Étape suivante',
  noStep: 'Sélectionnez un nœud de l’arbre pour afficher sa table.',
  emptyRelation: 'Aucun tuple.',
  tabTable: 'Table',
  tabSql: 'SQL',
  sqlTitle: 'Requête SQL équivalente',
  sqlLoading: 'Chargement de SQLite…',
  sqlIdentical: (n) => `Résultats identiques : SQLite retrouve les ${n} tuple(s) du moteur.`,
  sqlDifferent: 'Les résultats diffèrent.',
  sqlOnlyEngine: 'Seulement dans le moteur',
  sqlOnlySql: 'Seulement dans SQLite',
  sqlFailed: (message) => `Impossible d’exécuter la requête avec SQLite : ${message}`,
  sqlUnavailable: 'Corrigez l’expression pour obtenir la requête SQL.',
  exercise: 'Exercice',
  freeMode: 'Expression libre',
  check: 'Vérifier ma réponse',
  showSolution: 'Afficher la solution',
  correct: (n) => `Bonne réponse : votre expression donne les ${n} tuple(s) attendus.`,
  wrong: (expected, found) =>
    `Pas encore : le résultat attendu contient ${expected} tuple(s), le vôtre ${found}, ` +
    'et ils ne sont pas tous identiques.',
  notReady: 'Corrigez d’abord l’expression : elle doit s’exécuter sans erreur.',
};

/** Exemple affiché à l'ouverture de chaque base d'exemple. */
export const DEFAULT_EXPRESSIONS = {
  bibliotheque:
    '-- Livres publiés après 2020, avec le nom de leur auteur\n' +
    'Recents := σ[annee > 2020](Livre)\n' +
    'π[titre, nom](Recents ⋈ Auteur)',
  universite:
    '-- Étudiants inscrits à tous les cours de génie logiciel\n' +
    "π[matricule, sigle](Inscription) ÷ π[sigle](σ[programme = 'Génie logiciel'](Cours))",
  commerce:
    '-- Clients qui ont commandé tous les produits de papeterie\n' +
    'π[idClient, idProduit](Commande ⋈ LigneCommande)\n' +
    "  ÷ π[idProduit](σ[categorie = 'Papeterie'](Produit))",
};
