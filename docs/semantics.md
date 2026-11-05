# Sémantique de RelaViz

> **Statut : validée le 5 novembre 2026** (décisions S1 à S6). Ce document est la référence du vérificateur de schéma (`src/engine/schema-checker.js`), de l'évaluateur (`src/engine/evaluator.js`) et, en phase 3, du traducteur SQL.

La [grammaire](grammar.md) dit quelles expressions sont bien formées. Ce document dit ce qu'elles signifient : le schéma produit par chaque opérateur, les erreurs de schéma et la façon de calculer chaque table.

## 1. Principes

- **Sémantique d'ensemble.** Une relation ne contient jamais deux fois le même tuple. Les doublons sont éliminés après chaque opération, base comprise.
- **Vérifier avant d'exécuter.** Le vérificateur calcule le schéma de sortie de chaque nœud et s'arrête à la première erreur. L'évaluateur ne s'exécute que sur un programme vérifié : il n'a donc aucune erreur de nom ou de type à gérer.
- **Le moteur est la référence.** SQLite (sql.js) sert d'oracle en phase 3 ; les règles ci-dessous sont choisies pour que la traduction SQL donne le même résultat.

## 2. Schémas et noms d'attributs (S1)

Un attribut a un **nom**, un **type** (`number`, `text` ou `date`) et une **source** : la relation dont il provient (champ `source` du type `Attribute` du PRD).

| Origine de l'attribut           | Source           |
| ------------------------------- | ---------------- |
| relation de la base `Livre`     | `Livre`          |
| résultat nommé `Recents := ...` | `Recents`        |
| `ρ[L]`, `ρ[L(...)]`             | `L`              |
| tous les autres opérateurs      | source conservée |

Pour un résultat nommé, un nom présent plusieurs fois dans le schéma garde sa source d'origine : après `A := Livre ⋈[Livre.idAuteur = Auteur.idAuteur] Auteur`, on écrit `A.titre`, mais `Livre.idAuteur` et `Auteur.idAuteur`.

**Résolution d'une référence.**

- `Livre.titre` désigne l'attribut de nom `titre` et de source `Livre`. Si aucune source ne s'appelle `Livre`, l'erreur l'indique et liste les sources disponibles.
- `titre` désigne l'unique attribut de ce nom. S'il y en a plusieurs (après un produit, par exemple), la référence est **ambiguë** et l'erreur propose les formes qualifiées `Livre.titre`, `Auteur.titre`.
- Un nom inconnu produit une erreur qui liste les attributs disponibles et propose le nom le plus proche (« Vouliez-vous dire ... ? »).

**Unicité.** Un schéma ne peut pas contenir deux attributs de même nom **et** de même source, car aucune référence ne pourrait les distinguer. C'est le cas de `Livre × Livre` ou de `π[titre, titre](Livre)` : l'erreur propose de renommer une opérande avec `ρ`.

## 3. Schéma de sortie de chaque opérateur

| Opérateur                 | Conditions                                                                                  | Schéma de sortie                                           |
| ------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| relation `R`              | `R` est une relation de la base ou un résultat déjà défini (S6)                             | attributs de `R`                                           |
| `σ[c](E)`                 | la condition `c` est bien typée sur le schéma de `E` (§4)                                   | schéma de `E`                                              |
| `π[a, b](E)`              | chaque attribut existe dans `E`, sans ambiguïté                                             | les attributs cités, dans l'ordre de la liste              |
| `ρ[L](E)`                 |                                                                                             | schéma de `E`, source `L`                                  |
| `ρ[L(x, y)](E)`           | autant de noms que d'attributs dans `E`                                                     | attributs renommés dans l'ordre, source `L`                |
| `ρ[a -> x](E)`            | chaque attribut renommé existe dans `E`                                                     | schéma de `E` avec les noms remplacés, sources conservées  |
| `E × F`                   |                                                                                             | attributs de `E` puis ceux de `F`                          |
| `E ⋈[c] F`                | `c` est bien typée sur le schéma de `E × F`                                                 | comme `E × F`                                              |
| `E ⋈ F`                   | les attributs communs (même nom) ont le même type                                           | attributs de `E`, puis ceux de `F` qui ne sont pas communs |
| `E ∪ F`, `E − F`, `E ∩ F` | même nombre d'attributs et mêmes types, position par position (S2)                          | schéma de `E` (noms et sources de l'opérande gauche)       |
| `E ÷ F`                   | chaque attribut de `F` existe dans `E` avec le même type ; `E` a au moins un autre attribut | attributs de `E` absents de `F`, dans leur ordre           |

**Jointure naturelle sans attribut commun (S5).** Elle est permise et équivaut à un produit cartésien. Le vérificateur produit un **avertissement** non bloquant, car c'est souvent une erreur d'énoncé.

**Types compatibles (S2).** Deux attributs sont compatibles s'ils ont exactement le même type. Pour `∪ − ∩`, les noms peuvent différer, comme en SQL : `π[nom](Auteur) ∪ π[nom](Membre)` est valide.

## 4. Conditions et types (S3)

| Comparaison                                  | Règle                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `number` avec `number`                       | comparaison numérique                                                         |
| `text` avec `text`                           | ordre des caractères (ordre binaire, comme la collation par défaut de SQLite) |
| `date` avec `date`                           | ordre chronologique                                                           |
| `date` avec un littéral chaîne               | permis si le littéral est une date valide au format `'AAAA-MM-JJ'`            |
| tout autre mélange (`number` avec `text`...) | erreur de type                                                                |
| `a is null`, `a is not null`                 | permis pour tout type                                                         |

Les dates sont stockées au format ISO, dont l'ordre alphabétique est l'ordre chronologique.

## 5. Valeurs NULL (S4)

- **Conditions : logique à trois valeurs**, comme en SQL. Une comparaison dont un opérande vaut `NULL` vaut _inconnu_. `and`, `or` et `not` suivent les tables de Kleene (`faux and inconnu = faux`, `vrai or inconnu = vrai`, `not inconnu = inconnu`). `σ` ne garde que les tuples dont la condition est **vraie**.
- **Jointures.** Une jointure naturelle n'associe jamais deux tuples sur une valeur `NULL` ; une thêta-jointure suit la règle des conditions.
- **Égalité de tuples.** Pour éliminer les doublons et pour `∪ − ∩ ÷`, deux `NULL` à la même position sont **égaux**, comme pour `DISTINCT`, `UNION`, `EXCEPT` et `INTERSECT` en SQL.

## 6. Affectations (S6)

- Un nom d'affectation ne peut pas reprendre le nom d'une relation de la base.
- Un nom ne peut être défini qu'une fois.
- Un nom doit être défini **avant** d'être utilisé ; l'utiliser plus haut (ou dans sa propre définition) est une erreur.
- **Résultat affiché** : l'expression finale si elle existe, sinon la dernière affectation (D7).

## 7. Évaluation

L'évaluateur parcourt l'arbre en ordre postfixe et produit, pour chaque nœud, un `TraceStep` : la relation calculée et la durée de l'opération elle-même (sans ses enfants). Les affectations sont évaluées dans l'ordre, puis l'expression finale.

| Opérateur   | Algorithme                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `σ`         | filtre avec la condition compilée une seule fois (indices d'attributs résolus d'avance)                                                                                                                                       |
| `π`         | copie des colonnes citées, puis élimination des doublons                                                                                                                                                                      |
| `ρ`         | tuples inchangés, nouveau schéma                                                                                                                                                                                              |
| `×`, `⋈[c]` | toutes les paires de tuples (filtrées par `c` pour la thêta-jointure)                                                                                                                                                         |
| `⋈`         | jointure par hachage sur les attributs communs ; les tuples dont la clé contient `NULL` sont ignorés                                                                                                                          |
| `∪ − ∩`     | ensembles de clés de tuples                                                                                                                                                                                                   |
| `÷`         | regroupement du dividende sur les attributs restants ; un groupe est gardé s'il contient toutes les valeurs du diviseur (si le diviseur est vide, tous les groupes sont gardés, comme la double négation `NOT EXISTS` en SQL) |

La clé d'un tuple est sa sérialisation JSON : elle distingue `1` de `'1'` et rend deux `NULL` égaux.

## 8. Erreurs de schéma

| Situation                                               | Code                              |
| ------------------------------------------------------- | --------------------------------- |
| relation inconnue                                       | `UNKNOWN_RELATION`                |
| résultat utilisé avant sa définition                    | `USED_BEFORE_DEFINITION`          |
| affectation qui reprend un nom de la base               | `ASSIGNMENT_SHADOWS_RELATION`     |
| affectation redéfinie                                   | `DUPLICATE_ASSIGNMENT`            |
| attribut inconnu                                        | `UNKNOWN_ATTRIBUTE`               |
| qualificatif inconnu (`X.titre`)                        | `UNKNOWN_QUALIFIER`               |
| attribut ambigu                                         | `AMBIGUOUS_ATTRIBUTE`             |
| attribut présent deux fois dans un schéma               | `DUPLICATE_ATTRIBUTE`             |
| renommage positionnel du mauvais nombre de noms         | `RENAME_ARITY`                    |
| comparaison de types incompatibles                      | `TYPE_MISMATCH`                   |
| date mal écrite                                         | `INVALID_DATE`                    |
| `∪ − ∩` : nombre d'attributs différent                  | `INCOMPATIBLE_ARITY`              |
| `∪ − ∩` : types différents                              | `INCOMPATIBLE_TYPES`              |
| `⋈` ou `÷` : attribut commun de types différents        | `COMMON_ATTRIBUTE_TYPE_MISMATCH`  |
| `÷` : attribut du diviseur absent du dividende          | `DIVISION_MISSING_ATTRIBUTE`      |
| `÷` : aucun attribut restant                            | `DIVISION_NO_REMAINING_ATTRIBUTE` |
| avertissement : jointure naturelle sans attribut commun | `NATURAL_JOIN_AS_PRODUCT`         |
