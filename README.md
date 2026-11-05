# RelaViz

Application web pédagogique qui exécute une expression d'algèbre relationnelle, l'affiche sous forme d'arbre d'opérations, montre la table intermédiaire produite à chaque étape et donne la requête SQL équivalente, vérifiée avec SQLite dans le navigateur.

> **État : phase 0 (fondations).** Outillage, intégration continue, bases d'exemple et proposition de grammaire. L'analyseur arrive en phase 1.

## Documentation

- [PRD](docs/PRD.md) : objectifs, exigences et jalons
- [Grammaire](docs/grammar.md) : syntaxe des expressions en EBNF, priorités, erreurs
- [Architecture](docs/architecture.md) : pipeline du moteur, règles de dépendance, tests

## Lancer le projet

Prérequis : Node.js 22.12 ou plus récent.

```bash
npm install
npm run dev
```

## Scripts

| Commande            | Rôle                                                           |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | serveur de développement Vite                                  |
| `npm run build`     | build de production dans `dist/`                               |
| `npm test`          | tests Vitest                                                   |
| `npm run coverage`  | tests avec rapport de couverture (seuil de 85 % sur le moteur) |
| `npm run lint`      | ESLint                                                         |
| `npm run format`    | formatage Prettier                                             |
| `npm run typecheck` | vérification des types JSDoc du moteur                         |
| `npm run check`     | lint, formatage, types et tests, comme en CI                   |

## Bases d'exemple

| Base         | Relations                                        |
| ------------ | ------------------------------------------------ |
| Bibliothèque | `Auteur`, `Livre`, `Membre`, `Emprunt`           |
| Université   | `Etudiant`, `Cours`, `Inscription`, `Professeur` |
| Commerce     | `Client`, `Produit`, `Commande`, `LigneCommande` |

Les données sont inventées pour le projet.
