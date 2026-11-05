# PRD : RelaViz

Nov 4, 2026 · @Chakib

## Vue d'ensemble

RelaViz est une application web pédagogique qui prend une expression d'algèbre relationnelle, l'affiche sous forme d'arbre d'opérations, l'exécute étape par étape sur une petite base de données et montre la requête SQL équivalente. L'utilisateur clique sur n'importe quel nœud de l'arbre pour voir la table intermédiaire produite à cette étape.

- **Nom de travail :** RelaViz (modifiable)
- **Plateforme :** site web entièrement côté client, sans backend
- **Stack :** React avec Vite, en JavaScript ; SQLite dans le navigateur (sql.js) pour vérifier les résultats
- **Hébergement :** Vercel ou GitHub Pages, gratuit
- **Contrainte de conception :** aucune IA ni LLM ; l'analyseur, l'évaluateur et le traducteur SQL sont écrits à la main
- **Objectif personnel :** projet de portfolio démontrant la conception d'un analyseur syntaxique, la manipulation d'arbres, la compréhension des bases de données relationnelles et la visualisation de données

Le choix d'une application sans backend est volontaire : tout le calcul tient dans le navigateur, le déploiement est gratuit et la démo fonctionne instantanément pour un recruteur.

## Problème et objectifs

En cours de bases de données, l'algèbre relationnelle se pratique surtout sur papier : l'étudiant écrit une expression sans pouvoir vérifier son résultat, ni voir où une jointure ou une sélection produit une erreur. Le lien entre l'algèbre et le SQL reste souvent abstrait.

**Objectifs du produit**

1. Exécuter une expression d'algèbre relationnelle et afficher son résultat en moins d'une seconde.
2. Rendre visible chaque étape intermédiaire sous forme d'arbre cliquable.
3. Montrer la requête SQL équivalente et prouver qu'elle donne le même résultat.
4. Expliquer clairement les erreurs de syntaxe et de schéma (attribut inconnu, relations incompatibles).

**Métriques de succès**

| Métrique                      | Cible                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Concordance algèbre et SQL    | 100 % des expressions de la suite de tests donnent le même résultat que sql.js |
| Couverture de tests du moteur | 85 % ou plus sur l'analyseur, l'évaluateur et le traducteur                    |
| Temps de rendu                | Moins de 1 seconde pour une expression de 10 opérateurs sur la base d'exemple  |
| Démo publique                 | Site déployé avec des exemples cliquables, lien dans le README et le portfolio |

## Utilisateurs et parcours

| Profil                                | Besoin principal                                               |
| ------------------------------------- | -------------------------------------------------------------- |
| Étudiant en cours de bases de données | Vérifier ses exercices et comprendre ses erreurs               |
| Chargé de cours ou démonstrateur      | Montrer en classe l'exécution d'une expression étape par étape |
| Recruteur (public secondaire)         | Comprendre le projet en 2 minutes grâce à un exemple préchargé |

**Parcours principal**

1. **Base de données :** l'utilisateur choisit une base d'exemple (ex. Bibliothèque, Université) ou importe ses propres tables en CSV ou en script SQL `CREATE TABLE` + `INSERT`.
2. **Schéma :** un panneau affiche les relations disponibles, leurs attributs et leurs types.
3. **Saisie :** il écrit son expression dans un éditeur, avec des boutons pour insérer les symboles (σ, π, ⋈, ∪, −, ×, ρ, ÷) et une syntaxe ASCII équivalente.
4. **Analyse :** à chaque modification, l'expression est analysée ; une erreur est soulignée à l'endroit exact avec un message en français.
5. **Arbre :** l'arbre d'opérations s'affiche, les relations aux feuilles et le résultat final à la racine.
6. **Étapes :** un clic sur un nœud affiche sa table intermédiaire et le nombre de tuples ; un mode pas à pas parcourt l'arbre des feuilles vers la racine.
7. **SQL :** l'onglet SQL montre la requête traduite et le résultat de sql.js, avec un indicateur « Résultats identiques » ou la différence détaillée.
8. **Partage :** l'expression et la base choisie sont encodées dans l'URL pour partager un exercice.

## Opérateurs et syntaxe

Le MVP couvre l'algèbre relationnelle vue en cours de premier cycle, avec une **sémantique d'ensemble** : les doublons sont toujours éliminés, ce qui impose un `DISTINCT` dans le SQL traduit. Chaque opérateur s'écrit avec son symbole ou avec un mot-clé ASCII, pour que la saisie au clavier reste simple.

| Opérateur          | Symbole          | Syntaxe ASCII                                           | Portée |
| ------------------ | ---------------- | ------------------------------------------------------- | ------ |
| Sélection          | σ                | `select[annee > 2020](Livre)`                           | MVP    |
| Projection         | π                | `project[titre, auteur](Livre)`                         | MVP    |
| Renommage          | ρ                | `rename[L(t, a)](Livre)` ou `rename[titre -> t](Livre)` | MVP    |
| Produit cartésien  | ×                | `Livre x Auteur`                                        | MVP    |
| Jointure naturelle | ⋈                | `Livre join Auteur`                                     | MVP    |
| Thêta-jointure     | ⋈ avec condition | `Livre join[Livre.idA = Auteur.id] Auteur`              | MVP    |
| Union              | ∪                | `R union S`                                             | MVP    |
| Différence         | −                | `R minus S`                                             | MVP    |
| Intersection       | ∩                | `R intersect S`                                         | MVP    |
| Division           | ÷                | `R divide S`                                            | MVP    |
| Jointures externes | ⟕ ⟖ ⟗            | `R leftjoin S`                                          | V1.1   |
| Agrégation         | γ                | `group[genre; count(*) as n](Livre)`                    | V1.1   |

**Règles de la grammaire**

- Conditions : comparaisons `= <> < <= > >=`, opérateurs logiques `and or not` (ou ∧ ∨ ¬), parenthèses, littéraux texte entre apostrophes et nombres.
- Priorité des opérateurs binaires, du plus fort au plus faible : `x` et `join`, puis `intersect`, puis `union` et `minus` ; associativité à gauche ; les parenthèses priment toujours.
- Affectations nommées pour découper une expression longue : `Recents := select[annee > 2020](Livre)` sur une ligne, réutilisé aux lignes suivantes.
- Commentaires avec `--` jusqu'à la fin de la ligne.
- La grammaire complète est documentée en EBNF dans `docs/grammar.md` et sert de référence aux tests.

## Exigences fonctionnelles

| ID    | Exigence                                                                                                              | Priorité |
| ----- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| EF-01 | Charger au moins 3 bases d'exemple intégrées (Bibliothèque, Université, Commerce)                                     | MVP      |
| EF-02 | Afficher le schéma : relations, attributs, types, nombre de tuples                                                    | MVP      |
| EF-03 | Analyser une expression avec symboles ou syntaxe ASCII, y compris les affectations nommées                            | MVP      |
| EF-04 | Signaler les erreurs de syntaxe avec ligne, colonne et message en français                                            | MVP      |
| EF-05 | Vérifier le schéma avant l'exécution : attribut inconnu, ambiguïté, relations non compatibles pour ∪ − ∩              | MVP      |
| EF-06 | Afficher l'arbre d'opérations, avec le schéma de sortie de chaque nœud                                                | MVP      |
| EF-07 | Afficher la table intermédiaire d'un nœud au clic, avec le nombre de tuples                                           | MVP      |
| EF-08 | Mode pas à pas qui parcourt l'arbre en ordre postfixe avec boutons précédent et suivant                               | MVP      |
| EF-09 | Traduire l'expression en SQL lisible (sous-requêtes ou CTE `WITH`)                                                    | MVP      |
| EF-10 | Exécuter le SQL avec sql.js et comparer avec le résultat du moteur                                                    | MVP      |
| EF-11 | Barre de symboles cliquables et raccourcis clavier pour les insérer                                                   | MVP      |
| EF-12 | Encoder l'expression et la base choisie dans l'URL                                                                    | MVP      |
| EF-13 | Importer ses propres tables en CSV ou en script SQL                                                                   | V1.1     |
| EF-14 | Jointures externes et agrégation                                                                                      | V1.1     |
| EF-15 | Proposer des réécritures d'optimisation (pousser les sélections vers les feuilles) et afficher l'arbre avant et après | V1.2     |
| EF-16 | Version anglaise de l'interface                                                                                       | V1.2     |

## Exigences non fonctionnelles

- **Performance :** analyse et évaluation en moins de 100 ms sur les bases d'exemple (moins de 1 000 tuples par relation) ; sql.js chargé de façon différée pour ne pas ralentir le premier affichage.
- **Fonctionnement hors ligne :** aucune requête réseau après le chargement de la page ; aucune donnée envoyée à un serveur.
- **Exactitude :** le moteur est la source de vérité pédagogique, sql.js sert d'oracle de test ; toute divergence est un bogue.
- **Lisibilité du code :** le moteur (analyseur, vérificateur, évaluateur, traducteur) est séparé de l'interface et ne dépend pas de React.
- **Accessibilité :** navigation au clavier dans l'arbre, contrastes suffisants, tables lisibles par un lecteur d'écran.
- **Responsive :** l'arbre et les tables restent utilisables sur un écran de 375 px de large (défilement horizontal dans leur propre conteneur).
- **Langue :** interface en français au MVP, textes centralisés pour une traduction future.
- **Qualité :** tests unitaires avec Vitest, CI GitHub Actions, ESLint et Prettier.

## Architecture

Le diagramme du pipeline (moteur et interface) est maintenu dans [architecture.md](architecture.md).

L'arbre produit par l'analyseur est la seule représentation partagée : l'évaluateur et le traducteur SQL le parcourent chacun de leur côté, puis sql.js sert d'oracle pour confirmer que les deux chemins donnent le même résultat.

| Couche      | Technologie                 | Rôle                                              |
| ----------- | --------------------------- | ------------------------------------------------- |
| Moteur      | JavaScript pur, JSDoc       | Analyse, vérification, évaluation, traduction     |
| Interface   | React + Vite                | Éditeur, arbre SVG interactif, tables, onglet SQL |
| Oracle      | sql.js (SQLite WebAssembly) | Exécution du SQL traduit et comparaison           |
| Tests       | Vitest, GitHub Actions      | Tests du moteur et tests croisés avec sql.js      |
| Hébergement | Vercel ou GitHub Pages      | Site statique, gratuit                            |

## Modèle de données

Le moteur manipule trois structures : une relation (schéma + ensemble de tuples), un nœud d'arbre syntaxique, et une trace d'exécution qui associe chaque nœud à sa relation résultat. Les types sont documentés en JSDoc pour garder le projet en JavaScript.

```javascript
/** @typedef {{ name: string, type: 'number' | 'text' | 'date', source?: string }} Attribute */

/** @typedef {{ name: string, attributes: Attribute[], tuples: Array<Array<string|number|null>> }} Relation */

/**
 * Nœud de l'arbre. kind détermine les champs présents.
 * @typedef {(
 *   { kind: 'relation', name: string } |
 *   { kind: 'select', condition: Condition, child: Node } |
 *   { kind: 'project', attributes: string[], child: Node } |
 *   { kind: 'rename', mapping: Record<string,string>, newName?: string, child: Node } |
 *   { kind: 'product' | 'naturalJoin' | 'union' | 'minus' | 'intersect' | 'divide', left: Node, right: Node } |
 *   { kind: 'thetaJoin', condition: Condition, left: Node, right: Node }
 * ) & { id: string, span: { start: number, end: number } }} Node
 */

/** @typedef {{ kind: 'compare', op: string, left: Operand, right: Operand } | { kind: 'and' | 'or', left: Condition, right: Condition } | { kind: 'not', operand: Condition }} Condition */

/** @typedef {{ nodeId: string, result: Relation, durationMs: number }} TraceStep */
```

`span` relie chaque nœud à sa position dans le texte saisi : survoler un nœud de l'arbre surligne la partie correspondante de l'expression, et inversement. Les tuples sont dédoublonnés après chaque opération par une clé de hachage sérialisée.

## Traduction SQL, vérification et bases d'exemple

### Traduction

Le traducteur parcourt l'arbre et produit une requête SQL à base de CTE `WITH`, une CTE par nœud non feuille. Ce format est plus lisible que des sous-requêtes imbriquées et se lit dans le même ordre que le mode pas à pas.

| Opérateur   | Traduction SQL                                                                       |
| ----------- | ------------------------------------------------------------------------------------ |
| σ           | `SELECT DISTINCT * FROM r WHERE condition`                                           |
| π           | `SELECT DISTINCT a, b FROM r`                                                        |
| ρ           | `SELECT DISTINCT a AS x, b AS y FROM r`                                              |
| ×           | `SELECT DISTINCT * FROM r CROSS JOIN s` (attributs requalifiés en cas de nom commun) |
| ⋈ naturelle | `SELECT DISTINCT ... FROM r NATURAL JOIN s`                                          |
| ⋈ thêta     | `SELECT DISTINCT * FROM r JOIN s ON condition`                                       |
| ∪           | `SELECT * FROM r UNION SELECT * FROM s`                                              |
| −           | `SELECT * FROM r EXCEPT SELECT * FROM s`                                             |
| ∩           | `SELECT * FROM r INTERSECT SELECT * FROM s`                                          |
| ÷           | Double `NOT EXISTS` (« il n'existe pas de tuple de s non associé à r »)              |

### Vérification

1. Les relations de la base choisie sont chargées dans une base SQLite en mémoire (sql.js).
2. La requête traduite est exécutée ; le résultat est comparé à celui du moteur comme ensembles de tuples, sans tenir compte de l'ordre.
3. L'interface affiche « Résultats identiques » ou la liste des tuples présents d'un seul côté.
4. La même comparaison est utilisée dans les tests automatisés : chaque expression de la suite de tests est exécutée par les deux chemins.

### Bases d'exemple

- **Bibliothèque :** Livre, Auteur, Membre, Emprunt.
- **Université :** Etudiant, Cours, Inscription, Professeur (exemple classique pour la division : « étudiants inscrits à tous les cours d'un programme »).
- **Commerce :** Client, Produit, Commande, LigneCommande.
- Chaque base contient entre 5 et 30 tuples par relation, des valeurs `NULL` choisies avec soin et 5 exercices préchargés avec leur énoncé.
- Les données sont inventées pour le projet ; aucune donnée issue d'un travail de cours n'est réutilisée.

## Hors périmètre, risques et jalons

### Hors périmètre du MVP

- Backend, comptes utilisateurs, sauvegarde en ligne
- IA ou LLM, sous quelque forme que ce soit
- Traduction inverse du SQL vers l'algèbre relationnelle
- Sémantique de multiensemble (doublons conservés)
- Calcul relationnel de tuples ou de domaines
- Grandes bases de données (plus de 10 000 tuples)

### Risques

| Risque                                                    | Impact                                   | Mesure                                                                                    |
| --------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Grammaire ambiguë (priorités, symboles Unicode)           | Arbres faux ou erreurs incompréhensibles | Grammaire EBNF écrite en premier, tests de priorité dédiés                                |
| Traitement des `NULL` différent entre le moteur et SQLite | Fausses divergences                      | Appliquer la logique à trois valeurs du SQL dans les conditions, cas testés explicitement |
| Conflits de noms d'attributs (produit, jointure)          | Schéma de sortie incohérent              | Règle de qualification `Relation.attribut` documentée et vérifiée avant l'exécution       |
| Arbre illisible pour une longue expression                | Mauvaise expérience                      | Zoom, déplacement, repli des sous-arbres, affectations nommées                            |
| Taille de sql.js (environ 1 Mo avec le WebAssembly)       | Chargement lent                          | Chargement différé à l'ouverture de l'onglet SQL                                          |

### Jalons

1. **Phase 0, fondations :** projet Vite + React, ESLint, Prettier, Vitest, CI ; grammaire EBNF dans `docs/grammar.md` ; bases d'exemple en JSON.
2. **Phase 1, analyseur :** tokenizer et analyseur à descente récursive, erreurs positionnées, tests de syntaxe et de priorité.
3. **Phase 2, vérificateur et évaluateur :** calcul du schéma de sortie de chaque nœud, erreurs de schéma, évaluation des 10 opérateurs avec trace, tests par opérateur.
4. **Phase 3, SQL :** traducteur en CTE, intégration de sql.js, comparaison automatique et tests croisés sur toute la suite d'expressions.
5. **Phase 4, interface :** éditeur avec barre de symboles, panneau de schéma, arbre interactif, tables intermédiaires, mode pas à pas, onglet SQL, partage par URL.
6. **Phase 5, mise en ligne :** déploiement sur Vercel ou GitHub Pages, README avec GIF de démo et diagramme, exercices préchargés.
7. **V1.1 et suivantes :** import CSV et SQL, jointures externes, agrégation, optimisation d'arbre, version anglaise.
