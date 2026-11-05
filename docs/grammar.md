# Grammaire de RelaViz

> **Statut : proposition à valider (phase 0).** Les choix marqués **D1 à D9** dans la section 7 attendent une validation avant l'écriture de l'analyseur. Une fois validés, ce document devient la référence des tests de l'analyseur (phase 1).

Ce document définit le langage d'entrée de RelaViz : une expression d'algèbre relationnelle, éventuellement précédée d'affectations nommées. Il décrit successivement le lexique (les jetons), la syntaxe (en EBNF), les priorités, la correspondance avec l'arbre syntaxique du PRD et les messages d'erreur.

## Sommaire

1. [Notation](#1-notation)
2. [Lexique](#2-lexique)
3. [Syntaxe](#3-syntaxe)
4. [Priorités et associativité](#4-priorités-et-associativité)
5. [Correspondance avec l'arbre syntaxique](#5-correspondance-avec-larbre-syntaxique)
6. [Erreurs](#6-erreurs)
7. [Décisions à valider](#7-décisions-à-valider)
8. [Cas de test de référence](#8-cas-de-test-de-référence)
9. [Pourquoi une descente récursive](#9-pourquoi-une-descente-récursive)

## 1. Notation

La grammaire utilise l'EBNF de la norme ISO/IEC 14977 :

| Notation    | Sens                                       |
| ----------- | ------------------------------------------ |
| `a = ... ;` | définition de la règle `a`                 |
| `a , b`     | `a` suivi de `b`                           |
| `a \| b`    | `a` ou `b`                                 |
| `[ a ]`     | `a` facultatif (0 ou 1 fois)               |
| `{ a }`     | `a` répété 0 fois ou plus                  |
| `( a )`     | regroupement                               |
| `"x"`       | terminal littéral                          |
| `(* ... *)` | commentaire                                |
| `MAJUSCULE` | jeton produit par l'analyseur lexical (§2) |

## 2. Lexique

L'analyseur lexical (`src/engine/lexer.js`) transforme le texte en une suite de jetons. Chaque jeton conserve sa position (`start`, `end`) dans le texte, ce qui permet de souligner une erreur et de relier un nœud de l'arbre à la partie de l'expression qui l'a produit.

### 2.1 Blancs et commentaires

- Espaces, tabulations et retours à la ligne séparent les jetons et sont ignorés. **Les retours à la ligne n'ont pas de sens syntaxique** : une expression peut s'étendre sur plusieurs lignes (voir D9).
- Un commentaire commence par `--` et se termine à la fin de la ligne.

```ebnf
COMMENT = "--" , { caractère - fin_de_ligne } ;
```

### 2.2 Identifiants

Les identifiants désignent des relations, des attributs et des résultats nommés.

```ebnf
IDENT     = debut_id , { suite_id } ;   (* sauf mots réservés, §2.3 *)
debut_id  = lettre_latine | "_" ;
suite_id  = lettre_latine | chiffre | "_" ;
chiffre   = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
```

- `lettre_latine` : toute lettre de l'écriture latine, accentuée ou non (`a-z`, `A-Z`, `é`, `è`, `ç`, `œ`...). En JavaScript : `\p{Script=Latin}`.
- Les lettres grecques sont exclues, car `σ`, `π` et `ρ` sont des opérateurs : `σtitre` se lit donc `σ` suivi de `titre` (voir D8).
- Les identifiants sont **sensibles à la casse** : `Livre` et `livre` sont deux noms différents (voir D3).

### 2.3 Mots réservés et symboles

Chaque opérateur s'écrit avec un mot-clé ASCII ou avec son symbole Unicode. Les deux formes produisent le même jeton. Les mots-clés sont **insensibles à la casse** : `select`, `SELECT` et `Select` sont équivalents (voir D3).

| Jeton       | Mot-clé ASCII | Symbole Unicode            | Rôle                        |
| ----------- | ------------- | -------------------------- | --------------------------- |
| `SELECT`    | `select`      | `σ` (U+03C3)               | sélection                   |
| `PROJECT`   | `project`     | `π` (U+03C0)               | projection                  |
| `RENAME`    | `rename`      | `ρ` (U+03C1)               | renommage                   |
| `PRODUCT`   | `x`           | `×` (U+00D7)               | produit cartésien           |
| `JOIN`      | `join`        | `⋈` (U+22C8), `⨝` (U+2A1D) | jointure naturelle ou thêta |
| `UNION`     | `union`       | `∪` (U+222A)               | union                       |
| `MINUS`     | `minus`, `-`  | `−` (U+2212)               | différence, signe négatif   |
| `INTERSECT` | `intersect`   | `∩` (U+2229)               | intersection                |
| `DIVIDE`    | `divide`      | `÷` (U+00F7)               | division                    |
| `AND`       | `and`         | `∧` (U+2227)               | conjonction                 |
| `OR`        | `or`          | `∨` (U+2228)               | disjonction                 |
| `NOT`       | `not`         | `¬` (U+00AC)               | négation                    |
| `IS`        | `is`          |                            | test de nullité (voir D5)   |
| `NULL`      | `null`        |                            | test de nullité (voir D5)   |
| `ASSIGN`    | `:=`          | `←` (U+2190)               | affectation nommée          |
| `ARROW`     | `->`          | `→` (U+2192)               | renommage d'un attribut     |

Opérateurs de comparaison et ponctuation :

| Jeton                  | Écritures acceptées |
| ---------------------- | ------------------- |
| `EQ`                   | `=`                 |
| `NE`                   | `<>`, `!=`, `≠`     |
| `LT`, `LE`             | `<` ; `<=`, `≤`     |
| `GT`, `GE`             | `>` ; `>=`, `≥`     |
| `LPAREN`, `RPAREN`     | `(` `)`             |
| `LBRACKET`, `RBRACKET` | `[` `]`             |
| `COMMA`, `DOT`, `SEMI` | `,` `.` `;`         |

**Mots réservés pour la V1.1** : `leftjoin`, `rightjoin`, `fulljoin`, `group`, `as`, `count`, `sum`, `avg`, `min`, `max`, ainsi que les symboles `⟕ ⟖ ⟗ γ`. Ils sont reconnus dès le MVP pour produire un message clair (« opérateur prévu dans une version ultérieure ») et pour éviter qu'un exercice écrit aujourd'hui casse plus tard.

**Règle du plus long préfixe.** À chaque position, l'analyseur lexical prend le jeton le plus long possible : `<=` avant `<`, `<>` avant `<`, `:=` avant `:`, `->` et `--` avant `-`. Un mot-clé n'est reconnu que si l'identifiant entier correspond : `xml` et `joined` sont des identifiants, seul `x` seul est le produit.

### 2.4 Littéraux

```ebnf
NUMBER = chiffre , { chiffre } , [ "." , chiffre , { chiffre } ] ;
STRING = "'" , { caractère - ( "'" | fin_de_ligne ) | "''" } , "'" ;
```

- Les nombres sont décimaux, sans exposant ni signe. Le signe négatif est traité par la syntaxe (`MINUS NUMBER`, §3.4). `.5` et `5.` sont refusés.
- Les chaînes sont entre apostrophes ; une apostrophe à l'intérieur se double, comme en SQL : `'Le Souffle de l''Atlas'`.
- Les dates s'écrivent comme des chaînes au format ISO : `'2025-01-31'`. Ce format se compare correctement dans l'ordre lexicographique, comme dans SQLite.
- Une chaîne entre guillemets (`"Roman"`) produit une erreur explicative plutôt qu'un simple « caractère inattendu ».

## 3. Syntaxe

L'analyseur syntaxique (`src/engine/parser.js`) consomme les jetons et construit l'arbre. Chaque règle ci-dessous correspond à une fonction de l'analyseur.

### 3.1 Programme et affectations

```ebnf
program    = { assignment , [ SEMI ] } , [ expression , [ SEMI ] ] ;
assignment = IDENT , ASSIGN , expression ;
```

- Un programme est une suite d'affectations, suivie au plus d'une expression finale.
- **Résultat affiché** : l'expression finale si elle existe, sinon la dernière affectation (voir D7).
- Un programme vide (uniquement des blancs ou des commentaires) est valide : l'interface affiche un état vide plutôt qu'une erreur pendant la saisie.
- Le `;` est facultatif. La fin d'une instruction est reconnue sans lui : une expression ne peut pas contenir la séquence `IDENT ASSIGN`, donc quand l'analyseur voit `Nom :=`, une nouvelle affectation commence.

Exemple sur la base Bibliothèque :

```text
-- Livres publiés après 2020, avec le nom de leur auteur
Recents := σ[annee > 2020](Livre)
π[titre, nom](Recents ⋈ Auteur)
```

### 3.2 Expressions relationnelles

```ebnf
expression     = union_expr ;

union_expr     = intersect_expr , { ( UNION | MINUS ) , intersect_expr } ;
intersect_expr = join_expr , { INTERSECT , join_expr } ;
join_expr      = unary_expr , { join_operator , unary_expr } ;
join_operator  = PRODUCT
               | DIVIDE
               | JOIN , [ LBRACKET , condition , RBRACKET ] ;

unary_expr     = SELECT , LBRACKET , condition , RBRACKET , unary_expr
               | PROJECT , LBRACKET , attribute_list , RBRACKET , unary_expr
               | RENAME , LBRACKET , rename_spec , RBRACKET , unary_expr
               | primary ;

primary        = IDENT
               | LPAREN , expression , RPAREN ;
```

- Les paramètres d'un opérateur (condition, liste d'attributs, renommage) sont **toujours entre crochets**, pour les mots-clés comme pour les symboles : `select[...]`, `σ[...]`, `join[...]`, `⋈[...]`.
- `JOIN` suivi de `[` est une thêta-jointure ; `JOIN` seul est une jointure naturelle.
- L'opérande d'un opérateur unaire est une `unary_expr` : les parenthèses sont permises mais pas obligatoires (voir D2). `σ[a > 1](R)`, `σ[a > 1] R` et `π[a] σ[a > 1] R` sont valides.

### 3.3 Projection et renommage

```ebnf
attribute_list = attribute_ref , { COMMA , attribute_ref } ;
attribute_ref  = IDENT , [ DOT , IDENT ] ;

rename_spec    = relation_rename | attribute_renames ;
relation_rename   = IDENT , [ LPAREN , IDENT , { COMMA , IDENT } , RPAREN ] ;
attribute_renames = rename_pair , { COMMA , rename_pair } ;
rename_pair       = attribute_ref , ARROW , IDENT ;
```

Trois formes de renommage :

| Forme                                 | Exemple                             | Effet                                                       |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| Relation seule                        | `ρ[L](Livre)`                       | la relation s'appelle `L` ; attributs inchangés             |
| Relation et attributs (positionnelle) | `ρ[L(i, t, a, an, g)](Livre)`       | renomme la relation et **tous** les attributs, dans l'ordre |
| Attributs choisis                     | `ρ[titre -> t, annee -> an](Livre)` | renomme seulement les attributs cités                       |

`relation_rename` et `rename_pair` commencent tous deux par `IDENT`. L'analyseur lit d'abord une `attribute_ref`, puis décide : si le jeton suivant est `ARROW`, c'est un renommage d'attributs ; sinon, c'est un renommage de relation (et la référence ne doit pas être qualifiée). C'est une factorisation à gauche, qui évite tout retour arrière.

### 3.4 Conditions

```ebnf
condition = or_cond ;
or_cond   = and_cond , { OR , and_cond } ;
and_cond  = not_cond , { AND , not_cond } ;
not_cond  = NOT , not_cond
          | atom_cond ;
atom_cond = LPAREN , condition , RPAREN
          | operand , comparator , operand
          | operand , IS , [ NOT ] , NULL ;

comparator = EQ | NE | LT | LE | GT | GE ;
operand    = attribute_ref
           | [ MINUS ] , NUMBER
           | STRING ;
```

- Un opérande ne commence jamais par `(` (pas d'arithmétique au MVP), donc `(` dans une condition ouvre toujours une sous-condition.
- Les comparaisons ne s'enchaînent pas : `1 < annee < 2000` est une erreur de syntaxe ; il faut écrire `annee > 1 and annee < 2000`.
- `null` n'est pas un opérande : `annee = null` est refusé avec un message qui propose `annee is null` (voir D5).
- La vérification des types (comparer un attribut `number` à une chaîne, par exemple) relève du vérificateur de schéma (phase 2), pas de la grammaire.

## 4. Priorités et associativité

### 4.1 Opérateurs relationnels

Du plus fort au plus faible :

| Niveau | Opérateurs             | Associativité | Règle EBNF       |
| ------ | ---------------------- | ------------- | ---------------- |
| 1      | `σ` `π` `ρ` (préfixes) | à droite      | `unary_expr`     |
| 2      | `×` `⋈` `⋈[c]` `÷`     | à gauche      | `join_expr`      |
| 3      | `∩`                    | à gauche      | `intersect_expr` |
| 4      | `∪` `−`                | à gauche      | `union_expr`     |

Les niveaux 2 à 4 reprennent le PRD ; la place de `÷` au niveau 2 est une proposition (voir D1). Les parenthèses priment toujours.

| Expression    | Lecture         |
| ------------- | --------------- |
| `R ∪ S ∩ T`   | `R ∪ (S ∩ T)`   |
| `R − S ∪ T`   | `(R − S) ∪ T`   |
| `R − S − T`   | `(R − S) − T`   |
| `R ⋈ S × T`   | `(R ⋈ S) × T`   |
| `R ∪ S ⋈ T`   | `R ∪ (S ⋈ T)`   |
| `R ÷ S ⋈ T`   | `(R ÷ S) ⋈ T`   |
| `σ[c] R ⋈ S`  | `(σ[c] R) ⋈ S`  |
| `σ[c](R ⋈ S)` | `σ[c](R ⋈ S)`   |
| `π[a] σ[c] R` | `π[a](σ[c](R))` |

**Comment l'associativité à gauche est obtenue.** Une règle récursive à gauche comme `union_expr = union_expr , UNION , intersect_expr` ferait boucler indéfiniment une descente récursive. La grammaire utilise donc la répétition `{ }`, que l'analyseur implémente par une boucle : il lit un opérande, puis tant qu'il voit un opérateur du niveau, il lit l'opérande suivant et construit un nœud dont l'enfant gauche est l'arbre accumulé. `R − S − T` donne ainsi `(R − S) − T`.

### 4.2 Conditions

Du plus fort au plus faible : comparaison et `is null`, puis `not`, puis `and`, puis `or`. `and` et `or` sont associatifs à gauche.

| Condition                  | Lecture                            |
| -------------------------- | ---------------------------------- |
| `not a = 1 and b = 2`      | `(not (a = 1)) and (b = 2)`        |
| `a = 1 or b = 2 and c = 3` | `(a = 1) or ((b = 2) and (c = 3))` |
| `not (a = 1 or b = 2)`     | `not ((a = 1) or (b = 2))`         |

## 5. Correspondance avec l'arbre syntaxique

L'arbre suit les types du PRD, définis en JSDoc dans `src/engine/types.js`.

| Production                    | Nœud produit                                                       |
| ----------------------------- | ------------------------------------------------------------------ |
| `primary = IDENT`             | `{ kind: 'relation', name }`                                       |
| `SELECT [c] e`                | `{ kind: 'select', condition, child }`                             |
| `PROJECT [l] e`               | `{ kind: 'project', attributes, child }`                           |
| `RENAME [s] e`                | `{ kind: 'rename', mapping, newName?, child }` (voir D6)           |
| `e PRODUCT e`                 | `{ kind: 'product', left, right }`                                 |
| `e JOIN e`                    | `{ kind: 'naturalJoin', left, right }`                             |
| `e JOIN [c] e`                | `{ kind: 'thetaJoin', condition, left, right }`                    |
| `e UNION e`, `e MINUS e`      | `{ kind: 'union' }`, `{ kind: 'minus' }`                           |
| `e INTERSECT e`, `e DIVIDE e` | `{ kind: 'intersect' }`, `{ kind: 'divide' }`                      |
| `( e )`                       | aucun nœud : les parenthèses ne servent qu'au regroupement         |
| `operand comparator operand`  | `{ kind: 'compare', op, left, right }`                             |
| `operand IS [NOT] NULL`       | `{ kind: 'compare', op: 'is' \| 'is not', left, right: null }`     |
| `and`, `or`, `not`            | `{ kind: 'and' \| 'or', left, right }`, `{ kind: 'not', operand }` |
| `attribute_ref` (condition)   | `{ kind: 'attribute', name, qualifier? }`                          |
| `NUMBER`, `STRING`            | `{ kind: 'literal', value }`                                       |

Règles complémentaires :

- **Normalisation.** Toutes les écritures d'un même opérateur produisent la même valeur : `op` vaut toujours `=`, `<>`, `<`, `<=`, `>`, `>=`, `is` ou `is not`. L'évaluateur et le traducteur SQL n'ont donc qu'une forme à traiter.
- **Projection.** Le PRD type `attributes` comme `string[]` : une référence qualifiée y est conservée telle quelle (`'Livre.titre'`) et résolue par le vérificateur de schéma.
- **Positions.** `span` contient les indices de début (inclus) et de fin (exclus) dans le texte saisi. Ligne et colonne sont calculées à partir de l'indice pour les messages d'erreur.
- **Identifiants de nœuds.** Les `id` sont attribués à la création (`n1`, `n2`...). Comme une descente récursive crée les enfants avant le parent, cet ordre est l'ordre postfixe, celui du mode pas à pas (EF-08).
- **Affectations.** Le PRD ne type pas le programme. Proposition (voir D7) :

```javascript
/** @typedef {{ name: string, expression: Node, span: { start: number, end: number } }} Assignment */
/** @typedef {{ assignments: Assignment[], result: Node | null }} Program */
```

Une référence à un résultat nommé (`Recents`) est un nœud `{ kind: 'relation', name: 'Recents' }`, résolu par le vérificateur de schéma.

## 6. Erreurs

L'analyse s'arrête à la **première erreur** (pas de reprise sur erreur au MVP). Comme l'expression est réanalysée à chaque modification, l'utilisateur corrige les erreurs une par une. Chaque erreur porte un message en français, une ligne et une colonne (à partir de 1) et un `span` pour le soulignement (EF-04).

| Situation                     | Message (exemple)                                                            |
| ----------------------------- | ---------------------------------------------------------------------------- |
| caractère inconnu             | `Caractère inattendu « @ ».`                                                 |
| chaîne non fermée             | `Chaîne non terminée : il manque l'apostrophe fermante.`                     |
| guillemets                    | `Les chaînes s'écrivent entre apostrophes : 'Roman' et non "Roman".`         |
| opérateur V1.1                | `L'opérateur « ⟕ » sera disponible dans une version ultérieure.`             |
| crochet manquant              | `« ] » attendu pour fermer la condition de σ, trouvé « ( ».`                 |
| opérande manquant             | `Expression attendue après « ∪ ».`                                           |
| deux opérandes juxtaposés     | `Opérateur attendu entre « Livre » et « Auteur ».`                           |
| mot réservé utilisé comme nom | `« union » est un mot réservé et ne peut pas servir de nom.`                 |
| comparaison enchaînée         | `Une comparaison ne s'enchaîne pas : utilisez and.`                          |
| `= null`                      | `Utilisez « annee is null » : une comparaison avec null n'est jamais vraie.` |
| fin inattendue                | `Fin de l'expression inattendue : « ) » attendu.`                            |

Les erreurs de **schéma** (relation ou attribut inconnu, ambiguïté, relations incompatibles pour `∪ − ∩`, schéma invalide pour `÷`, nom d'affectation déjà utilisé, arité d'un renommage positionnel) ne relèvent pas de la grammaire : elles sont détectées par le vérificateur (phase 2, EF-05).

## 7. Décisions à valider

Chaque point complète ou précise le PRD. La proposition est indiquée en gras.

| ID  | Question                                            | Proposition                                                                                                      | Raison                                                                                                               |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| D1  | Priorité de `÷` (absente du PRD)                    | **Même niveau que `×` et `⋈`**, associativité à gauche                                                           | `÷` est un opérateur « multiplicatif », comme dans la plupart des manuels.                                           |
| D2  | Parenthèses autour de l'opérande de `σ π ρ`         | **Facultatives** : `σ[c] R` et `σ[c](R)` sont valides                                                            | Notation des manuels (`π σ R`) ; l'arbre affiché rend visible la portée réelle de l'opérateur.                       |
| D3  | Casse                                               | **Mots-clés insensibles à la casse, identifiants sensibles**                                                     | `SELECT` comme en SQL ; les noms restent exacts. Conséquence : `x` et `X` sont réservés.                             |
| D4  | Tiret ASCII `-` pour la différence                  | **Accepté**, en plus de `minus` et `−`                                                                           | Le signe `−` (U+2212) n'est pas au clavier ; `-` sert aussi de signe négatif dans les conditions, sans ambiguïté.    |
| D5  | Valeurs `NULL` dans les conditions                  | **`is null` et `is not null` acceptés ; `= null` refusé** avec un message explicatif                             | Les bases d'exemple contiennent des `NULL` ; refuser `= null` évite le piège classique d'une condition jamais vraie. |
| D6  | Renommage positionnel `ρ[L(t, a)]` et type `rename` | **Ajouter un champ facultatif `positional?: string[]`** ; le vérificateur en déduit `mapping` à partir du schéma | L'analyseur ne connaît pas les attributs de l'enfant : il ne peut pas remplir `mapping` seul.                        |
| D7  | Affectations                                        | **Types `Assignment` et `Program` (§5)** ; expression finale facultative ; `←` accepté en plus de `:=`           | Le PRD ne type pas le programme ; `←` est la notation d'affectation des manuels.                                     |
| D8  | Lettres des identifiants                            | **Lettres latines, accentuées comprises** ; lettres grecques exclues                                             | Autorise `Année` ; évite que `σtitre` soit lu comme un identifiant.                                                  |
| D9  | Retours à la ligne                                  | **Sans valeur syntaxique**, `;` facultatif                                                                       | Une longue expression peut s'écrire sur plusieurs lignes ; la fin d'une instruction se déduit de `Nom :=`.           |

## 8. Cas de test de référence

Ces cas deviendront les premiers tests de l'analyseur (`tests/engine/parser.test.js`). La colonne « Arbre » utilise une notation préfixée compacte.

| #   | Entrée                                                | Arbre attendu                                        |
| --- | ----------------------------------------------------- | ---------------------------------------------------- |
| 1   | `Livre`                                               | `Livre`                                              |
| 2   | `select[annee > 2020](Livre)`                         | `σ[annee > 2020](Livre)`                             |
| 3   | `σ[annee > 2020] Livre`                               | identique au cas 2                                   |
| 4   | `project[titre, Livre.annee](Livre)`                  | `π[titre, Livre.annee](Livre)`                       |
| 5   | `rename[L](Livre)`                                    | `ρ[L](Livre)`                                        |
| 6   | `rename[titre -> t, annee → an](Livre)`               | `ρ[titre→t, annee→an](Livre)`                        |
| 7   | `rename[L(i, t, a, an, g)](Livre)`                    | `ρ[L(i, t, a, an, g)](Livre)`                        |
| 8   | `Livre join Auteur`                                   | `⋈(Livre, Auteur)`                                   |
| 9   | `Livre join[Livre.idAuteur = Auteur.idAuteur] Auteur` | `⋈[Livre.idAuteur = Auteur.idAuteur](Livre, Auteur)` |
| 10  | `R union S intersect T`                               | `∪(R, ∩(S, T))`                                      |
| 11  | `R minus S union T`                                   | `∪(−(R, S), T)`                                      |
| 12  | `R - S - T`                                           | `−(−(R, S), T)`                                      |
| 13  | `R join S x T`                                        | `×(⋈(R, S), T)`                                      |
| 14  | `R divide S join T`                                   | `⋈(÷(R, S), T)`                                      |
| 15  | `σ[a = 1] R join S`                                   | `⋈(σ[a = 1](R), S)`                                  |
| 16  | `π[a] σ[b > 2] R`                                     | `π[a](σ[b > 2](R))`                                  |
| 17  | `SELECT[a = 1](R) UNION R`                            | `∪(σ[a = 1](R), R)`                                  |
| 18  | `σ[not a = 1 and b = 2 or c = 3](R)`                  | condition `or(and(not(a = 1), b = 2), c = 3)`        |
| 19  | `σ[a ≠ 1 ∧ b ≤ -2.5](R)`                              | condition `and(a <> 1, b <= -2.5)`                   |
| 20  | `σ[titre = 'Le Souffle de l''Atlas'](Livre)`          | littéral `Le Souffle de l'Atlas`                     |
| 21  | `σ[annee is null](Livre)`                             | condition `annee is null`                            |
| 22  | `σ[annee is not null](Livre)`                         | condition `annee is not null`                        |
| 23  | `R := σ[a = 1](S)` puis `R ∪ T` sur la ligne suivante | affectation `R`, résultat `∪(R, T)`                  |
| 24  | `-- seulement un commentaire`                         | programme vide                                       |
| 25  | `X := R union S` (sans expression finale)             | résultat : l'affectation `X`                         |

Cas d'erreur, avec la position attendue (ligne:colonne) :

| #   | Entrée                  | Erreur attendue                         |
| --- | ----------------------- | --------------------------------------- |
| E1  | `σ[annee > 2020(Livre)` | 1:15, `]` attendu                       |
| E2  | `Livre union`           | 1:12, expression attendue après `union` |
| E3  | `Livre Auteur`          | 1:7, opérateur attendu                  |
| E4  | `σ[titre = 'abc](R)`    | 1:11, chaîne non terminée               |
| E5  | `σ[1 < a < 5](R)`       | 1:9, comparaison enchaînée              |
| E6  | `σ[a = null](R)`        | 1:7, utiliser `is null`                 |
| E7  | `union := R`            | 1:1, mot réservé                        |
| E8  | `R ⟕ S`                 | 1:3, opérateur prévu pour la V1.1       |
| E9  | `σ[genre = "Roman"](R)` | 1:11, chaînes entre apostrophes         |
| E10 | `π[](R)`                | 1:3, attribut attendu                   |

## 9. Pourquoi une descente récursive

- **Correspondance directe.** Chaque règle EBNF devient une fonction (`parseUnionExpr`, `parseJoinExpr`...). Lire l'analyseur revient à lire la grammaire, ce qui facilite la revue et les tests.
- **Grammaire LL(1) presque partout.** Un seul jeton d'avance suffit pour choisir la règle à appliquer, sauf à deux endroits : la détection d'une affectation (`IDENT` suivi de `ASSIGN`, deux jetons d'avance) et le renommage (résolu par factorisation à gauche, §3.3). Aucun retour arrière n'est nécessaire, donc l'analyse est linéaire en la taille de l'expression.
- **Priorités par niveaux.** Une fonction par niveau de priorité (4 niveaux pour les relations, 4 pour les conditions) rend les priorités visibles dans le code. Une analyse de Pratt serait plus compacte, mais moins directement traçable vers cette grammaire.
- **Messages d'erreur précis.** À chaque point de décision, l'analyseur sait exactement ce qu'il attendait (`]`, une expression, un opérateur), ce qui permet des messages en français bien plus utiles que ceux d'un générateur d'analyseur.
