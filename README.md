# RelaViz

Application web pédagogique qui exécute une expression d'algèbre relationnelle, l'affiche sous forme d'arbre d'opérations, montre la table intermédiaire produite à chaque étape et donne la requête SQL équivalente, vérifiée avec SQLite dans le navigateur.

> **État : phase 3 terminée (SQL vérifié).** Le moteur analyse, vérifie et évalue une expression, la traduit en SQL et confirme avec SQLite (sql.js) que les deux résultats sont identiques. Prochaine étape : l'interface (phase 4).

## Documentation

- [PRD](docs/PRD.md) : objectifs, exigences et jalons
- [Grammaire](docs/grammar.md) : syntaxe des expressions en EBNF, priorités, erreurs
- [Sémantique](docs/semantics.md) : schéma de chaque opérateur, NULL, types, erreurs de schéma
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
