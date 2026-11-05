/** Symboles de la barre d'outils et raccourcis clavier (EF-11). */

/** Symboles insérables, avec leur mot-clé ASCII et leur raccourci (Alt + touche). */
export const SYMBOLS = [
  { symbol: 'σ', keyword: 'select', key: 'S', insert: 'σ[]()' },
  { symbol: 'π', keyword: 'project', key: 'P', insert: 'π[]()' },
  { symbol: 'ρ', keyword: 'rename', key: 'R', insert: 'ρ[]()' },
  { symbol: '×', keyword: 'x', key: 'X', insert: ' × ' },
  { symbol: '⋈', keyword: 'join', key: 'J', insert: ' ⋈ ' },
  { symbol: '∪', keyword: 'union', key: 'U', insert: ' ∪ ' },
  { symbol: '−', keyword: 'minus', key: 'M', insert: ' − ' },
  { symbol: '∩', keyword: 'intersect', key: 'I', insert: ' ∩ ' },
  { symbol: '÷', keyword: 'divide', key: 'D', insert: ' ÷ ' },
];

/**
 * Symbole correspondant à un raccourci clavier, ou `undefined`.
 * `event.code` est utilisé car Alt modifie le caractère tapé sur macOS (Alt+S donne ß).
 * @param {{ altKey: boolean, ctrlKey: boolean, metaKey: boolean, code: string }} event
 */
export function symbolForShortcut(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey) return undefined;
  return SYMBOLS.find(({ key }) => event.code === `Key${key}`);
}
