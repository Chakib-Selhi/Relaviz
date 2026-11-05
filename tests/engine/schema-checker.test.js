import { describe, expect, it } from 'vitest';
import { getSampleDatabase } from '../../src/data/index.js';
import { RelaVizError, toErrorInfo } from '../../src/engine/errors.js';
import { parse } from '../../src/engine/parser.js';
import {
  checkProgram,
  closestName,
  displayNames,
  splitReference,
} from '../../src/engine/schema-checker.js';

const bibliotheque = getSampleDatabase('bibliotheque');
const universite = getSampleDatabase('universite');

/** Analyse et vérifie un texte ; retourne le résultat de la vérification ou l'erreur. */
function check(text, database = bibliotheque) {
  const parsed = parse(text);
  if (!parsed.ok) throw new Error(`Erreur de syntaxe pour ${text} : ${parsed.error.message}`);
  try {
    return { ok: true, ...checkProgram(parsed.program, database) };
  } catch (error) {
    if (error instanceof RelaVizError) return { ok: false, error: toErrorInfo(error, text) };
    throw error;
  }
}

/** Schéma du résultat, écrit `source.nom:type`. */
function schema(text, database = bibliotheque) {
  const checked = check(text, database);
  if (!checked.ok) throw new Error(`Erreur inattendue pour ${text} : ${checked.error.message}`);
  return checked.schemas.get(checked.root.id).map((a) => `${a.source}.${a.name}:${a.type}`);
}

/** Erreur de schéma pour un texte valide syntaxiquement. */
function schemaError(text, database = bibliotheque) {
  const checked = check(text, database);
  if (checked.ok) throw new Error(`Aucune erreur pour ${text}`);
  return checked.error;
}

describe('schéma de sortie (§3)', () => {
  it('donne les attributs d’une relation de la base avec leur source', () => {
    expect(schema('Auteur')).toEqual([
      'Auteur.idAuteur:number',
      'Auteur.nom:text',
      'Auteur.prenom:text',
      'Auteur.pays:text',
      'Auteur.anneeNaissance:number',
    ]);
  });

  it('garde le schéma pour σ et suit l’ordre de la liste pour π', () => {
    expect(schema('σ[annee > 2020](π[annee, titre](Livre))')).toEqual([
      'Livre.annee:number',
      'Livre.titre:text',
    ]);
  });

  it('change la source avec ρ[L] et les noms avec les deux autres formes', () => {
    expect(schema('ρ[L](π[titre](Livre))')).toEqual(['L.titre:text']);
    expect(schema('ρ[L(t, a)](π[titre, annee](Livre))')).toEqual(['L.t:text', 'L.a:number']);
    expect(schema('ρ[titre -> t, Livre.annee -> a](π[titre, annee](Livre))')).toEqual([
      'Livre.t:text',
      'Livre.a:number',
    ]);
  });

  it('concatène les schémas pour × et ⋈[c], en gardant les deux idAuteur (S1)', () => {
    const product = schema('π[idLivre, idAuteur](Livre) × π[idAuteur, nom](Auteur)');
    expect(product).toEqual([
      'Livre.idLivre:number',
      'Livre.idAuteur:number',
      'Auteur.idAuteur:number',
      'Auteur.nom:text',
    ]);
    expect(
      schema(
        'π[idLivre, idAuteur](Livre) ⋈[Livre.idAuteur = Auteur.idAuteur] π[idAuteur, nom](Auteur)',
      ),
    ).toEqual(product);
  });

  it('fusionne les attributs communs pour ⋈', () => {
    expect(schema('π[idLivre, idAuteur](Livre) ⋈ π[idAuteur, nom](Auteur)')).toEqual([
      'Livre.idLivre:number',
      'Livre.idAuteur:number',
      'Auteur.nom:text',
    ]);
  });

  it('prend le schéma de gauche pour ∪ − ∩, même si les noms diffèrent (S2)', () => {
    expect(schema('π[nom](Auteur) ∪ π[ville](Membre)')).toEqual(['Auteur.nom:text']);
    expect(schema('π[idLivre](Livre) − π[idMembre](Membre)')).toEqual(['Livre.idLivre:number']);
  });

  it('garde les attributs absents du diviseur pour ÷', () => {
    expect(schema('π[matricule, sigle](Inscription) ÷ π[sigle](Cours)', universite)).toEqual([
      'Inscription.matricule:number',
    ]);
  });

  it('donne aux résultats nommés leur propre source, sauf pour les noms en double', () => {
    expect(schema('Recents := σ[annee > 2020](Livre)\nπ[Recents.titre](Recents)')).toEqual([
      'Recents.titre:text',
    ]);
    const joined = 'A := π[idLivre, idAuteur](Livre) ⋈[Livre.idAuteur = Auteur.idAuteur] Auteur\n';
    expect(schema(`${joined}π[A.idLivre, Auteur.idAuteur](A)`)).toEqual([
      'A.idLivre:number',
      'Auteur.idAuteur:number',
    ]);
    expect(schemaError(`${joined}π[idAuteur](A)`).code).toBe('AMBIGUOUS_ATTRIBUTE');
  });
});

describe('erreurs de noms', () => {
  it('propose une relation proche, y compris à la casse près', () => {
    expect(schemaError('Livres').message).toBe(
      'Relation inconnue « Livres ». Vouliez-vous dire « Livre » ?',
    );
    expect(schemaError('livre').message).toContain('Vouliez-vous dire « Livre » ?');
    expect(schemaError('Zzz').message).toBe('Relation inconnue « Zzz ».');
  });

  it('propose un attribut proche et liste les attributs disponibles', () => {
    const error = schemaError('σ[anne > 2020](Livre)');
    expect(error).toMatchObject({ code: 'UNKNOWN_ATTRIBUTE', span: { start: 2, end: 6 } });
    expect(error.message).toBe(
      'Attribut inconnu « anne ». Attributs disponibles : idLivre, titre, idAuteur, annee, genre. ' +
        'Vouliez-vous dire « annee » ?',
    );
  });

  it('signale une référence ambiguë et propose les formes qualifiées', () => {
    expect(schemaError('σ[idAuteur = 1](Livre × Auteur)').message).toBe(
      'Attribut ambigu « idAuteur » : précisez « Livre.idAuteur » ou « Auteur.idAuteur ».',
    );
  });

  it('signale un qualificatif inconnu', () => {
    expect(schemaError("σ[Livr.titre = 'a'](Livre)")).toMatchObject({
      code: 'UNKNOWN_QUALIFIER',
      message:
        '« Livr » ne désigne aucune relation ici, donc « titre » est introuvable. Relations disponibles : Livre.',
    });
    expect(schemaError('π[Livre.nom](Livre × Auteur)').code).toBe('UNKNOWN_ATTRIBUTE');
  });

  it('souligne l’opérateur et ses paramètres pour une projection fautive', () => {
    expect(schemaError('π[titr](Livre)').span).toEqual({ start: 0, end: 8 });
  });
});

describe('unicité des attributs (S1)', () => {
  it.each([
    ['Livre × Livre', 'Renommez une des deux opérandes avec ρ, par exemple ρ[L2](Livre).'],
    ['π[titre, titre](Livre)', 'Citez chaque attribut une seule fois.'],
    ['ρ[titre -> annee](Livre)', 'Choisissez des noms distincts.'],
    ['ρ[L(a, a)](π[titre, annee](Livre))', 'Choisissez des noms distincts.'],
  ])('%s', (text, hint) => {
    const error = schemaError(text);
    expect(error.code).toBe('DUPLICATE_ATTRIBUTE');
    expect(error.message.endsWith(hint)).toBe(true);
  });

  it('accepte un produit après renommage', () => {
    expect(schema('π[titre](Livre) × ρ[L2](π[titre](Livre))')).toEqual([
      'Livre.titre:text',
      'L2.titre:text',
    ]);
  });

  it('refuse de renommer deux fois le même attribut sous deux écritures', () => {
    expect(schemaError('ρ[titre -> a, Livre.titre -> b](Livre)').code).toBe('DUPLICATE_RENAME');
  });

  it('vérifie l’arité d’un renommage positionnel', () => {
    expect(schemaError('ρ[L(a, b)](Livre)').message).toBe(
      'Le renommage donne 2 nom(s), mais la relation a 5 attribut(s).',
    );
  });
});

describe('types dans les conditions (S3)', () => {
  it.each([
    "σ[annee > 2020 and titre = 'X'](Livre)",
    'σ[annee = idAuteur](Livre)',
    "σ[dateRetour >= '2025-06-01'](Emprunt)",
    "σ['2025-06-01' <= dateEmprunt](Emprunt)",
    'σ[dateRetour > dateEmprunt](Emprunt)',
    "σ['a' = 'a'](Livre)",
    'σ[dateRetour is null or not genre is not null](Emprunt × π[genre](Livre))',
  ])('accepte %s', (text) => {
    expect(check(text).ok).toBe(true);
  });

  it.each([
    [
      "σ[annee = 'abc'](Livre)",
      "Comparaison impossible entre « annee » (nombre) et « 'abc' » (texte).",
    ],
    ['σ[titre > 3](Livre)', 'Comparaison impossible entre « titre » (texte) et « 3 » (nombre).'],
    [
      'σ[dateEmprunt = 2025](Emprunt)',
      'Comparaison impossible entre « dateEmprunt » (date) et « 2025 » (nombre).',
    ],
    [
      'σ[Membre.nom = dateInscription](Membre)',
      'Comparaison impossible entre « Membre.nom » (texte) et « dateInscription » (date).',
    ],
  ])('refuse %s', (text, message) => {
    expect(schemaError(text)).toMatchObject({ code: 'TYPE_MISMATCH', message });
  });

  it('vérifie qu’une chaîne comparée à une date est une date valide', () => {
    expect(schemaError("σ[dateEmprunt > '2025-13-01'](Emprunt)")).toMatchObject({
      code: 'INVALID_DATE',
      column: 17,
    });
    expect(schemaError("σ['hier' < dateEmprunt](Emprunt)").code).toBe('INVALID_DATE');
  });

  it('vérifie les noms dans la condition d’une thêta-jointure', () => {
    expect(schemaError('Livre ⋈[idAuteur = idAuteur] Auteur').code).toBe('AMBIGUOUS_ATTRIBUTE');
  });
});

describe('compatibilité des opérandes', () => {
  it('compare le nombre d’attributs pour ∪ − ∩ (S2)', () => {
    expect(schemaError('π[titre](Livre) ∪ π[idLivre, titre](Livre)').message).toBe(
      'Les opérandes de ∪ doivent avoir le même nombre d’attributs : 1 à gauche, 2 à droite.',
    );
  });

  it('compare les types position par position', () => {
    expect(schemaError('π[titre](Livre) ∩ π[idLivre](Livre)').message).toBe(
      'Les opérandes de ∩ sont incompatibles en position 1 : « titre : texte » et « idLivre : nombre » n’ont pas le même type.',
    );
  });

  it('exige le même type pour un attribut commun de ⋈ ou ÷', () => {
    const renamed = 'ρ[idAuteur -> titre](π[idAuteur](Livre))';
    expect(schemaError(`${renamed} ⋈ π[titre](Livre)`).message).toBe(
      '⋈ : l’attribut commun « titre » est de type nombre à gauche et texte à droite.',
    );
    expect(schemaError(`π[idLivre, titre](Livre) ÷ ${renamed}`).code).toBe(
      'COMMON_ATTRIBUTE_TYPE_MISMATCH',
    );
  });

  it('exige un attribut commun sans ambiguïté pour ⋈', () => {
    expect(schemaError('(Livre × π[idAuteur](Auteur)) ⋈ Auteur').code).toBe('AMBIGUOUS_ATTRIBUTE');
  });

  it('vérifie le schéma d’une division', () => {
    expect(schemaError('Livre ÷ π[nom](Auteur)').code).toBe('DIVISION_MISSING_ATTRIBUTE');
    expect(schemaError('π[idLivre](Livre) ÷ π[idLivre](Emprunt)').code).toBe(
      'DIVISION_NO_REMAINING_ATTRIBUTE',
    );
  });

  it('avertit qu’une jointure naturelle sans attribut commun est un produit (S5)', () => {
    const checked = check('π[titre](Livre) ⋈ π[nom](Auteur)');
    expect(checked.ok).toBe(true);
    expect(checked.warnings.map((w) => [w.code, w.span])).toEqual([
      ['NATURAL_JOIN_AS_PRODUCT', { start: 0, end: 32 }],
    ]);
  });
});

describe('affectations (S6)', () => {
  it.each([
    ['Livre := Auteur', 'ASSIGNMENT_SHADOWS_RELATION', { start: 0, end: 5 }],
    ['A := Livre\nA := Auteur', 'DUPLICATE_ASSIGNMENT', { start: 11, end: 12 }],
    ['A := B\nB := Livre', 'USED_BEFORE_DEFINITION', { start: 5, end: 6 }],
    ['A := A ∪ Livre', 'USED_BEFORE_DEFINITION', { start: 5, end: 6 }],
  ])('%s', (text, code, span) => {
    expect(schemaError(text)).toMatchObject({ code, span });
  });

  it('propose aussi les noms d’affectation déjà définis', () => {
    expect(schemaError('Recents := Livre\nRecent').message).toContain('« Recents »');
  });
});

describe('outils', () => {
  it('découpe les références qualifiées', () => {
    expect(splitReference('Livre.titre')).toEqual({ qualifier: 'Livre', name: 'titre' });
    expect(splitReference('titre')).toEqual({ name: 'titre' });
  });

  it('trouve le nom le plus proche, ou rien si tout est trop loin', () => {
    expect(closestName('Etudaint', ['Etudiant', 'Cours'])).toBe('Etudiant');
    expect(closestName('COURS', ['Etudiant', 'Cours'])).toBe('Cours');
    expect(closestName('xyz', ['Etudiant', 'Cours'])).toBeUndefined();
  });

  it('qualifie les noms affichés seulement s’ils sont en double', () => {
    expect(
      displayNames([
        { name: 'id', type: 'number', source: 'A' },
        { name: 'id', type: 'number', source: 'B' },
        { name: 'nom', type: 'text', source: 'B' },
      ]),
    ).toEqual(['A.id', 'B.id', 'nom']);
  });
});
