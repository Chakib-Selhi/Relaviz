import { useRef } from 'react';
import { UI } from '../messages.fr.js';
import { symbolForShortcut } from '../symbols.js';
import SymbolBar from './SymbolBar.jsx';

/**
 * Découpe le texte en segments, avec les parties à surligner (erreur, nœud survolé).
 * @param {string} text
 * @param {Array<{ start: number, end: number, className: string }>} marks
 */
function segments(text, marks) {
  const sorted = marks.filter((m) => m.start <= text.length).toSorted((a, b) => a.start - b.start);
  const parts = [];
  let pos = 0;
  for (const mark of sorted) {
    const start = Math.max(mark.start, pos);
    const end = Math.max(Math.min(mark.end, text.length), start);
    if (start > pos) parts.push({ text: text.slice(pos, start) });
    // Une erreur en fin de texte n'a pas de largeur : un espace la rend visible.
    parts.push({ text: end > start ? text.slice(start, end) : ' ', className: mark.className });
    pos = end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}

/**
 * Éditeur : une zone de texte transparente posée sur une copie du texte où les erreurs et le
 * nœud survolé sont surlignés. Les deux couches partagent police et marges.
 * @param {{
 *   value: string,
 *   onChange: (value: string) => void,
 *   onCaret: (offset: number) => void,
 *   errorSpan: { start: number, end: number } | null,
 *   highlightSpan: { start: number, end: number } | null,
 *   describedBy: string,
 * }} props
 */
export default function Editor({
  value,
  onChange,
  onCaret,
  errorSpan,
  highlightSpan,
  describedBy,
}) {
  const textarea = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const backdrop = useRef(/** @type {HTMLPreElement | null} */ (null));

  /** Insère un texte à la position du curseur et y replace le curseur. */
  function insert(/** @type {string} */ text, /** @type {number} */ caretOffset) {
    const element = textarea.current;
    if (!element) return;
    const { selectionStart, selectionEnd } = element;
    const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    onChange(next);
    const caret = selectionStart + caretOffset;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(caret, caret);
      onCaret(caret);
    });
  }

  const marks = [];
  if (highlightSpan) marks.push({ ...highlightSpan, className: 'mark-node' });
  if (errorSpan) marks.push({ ...errorSpan, className: 'mark-error' });

  return (
    <div className="editor">
      <label htmlFor="expression" className="label">
        {UI.editorLabel}
      </label>
      <SymbolBar onInsert={insert} />
      <div className="editor-layers">
        <pre ref={backdrop} className="editor-backdrop" aria-hidden="true">
          {segments(value, marks).map((part, i) =>
            part.className ? (
              <mark key={i} className={part.className}>
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
          {'\n'}
        </pre>
        <textarea
          id="expression"
          ref={textarea}
          className="editor-input"
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          rows={5}
          aria-describedby={describedBy}
          aria-invalid={errorSpan ? true : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            onCaret(event.target.selectionStart);
          }}
          onSelect={(event) => onCaret(event.currentTarget.selectionStart)}
          onScroll={(event) => {
            if (backdrop.current) {
              backdrop.current.scrollTop = event.currentTarget.scrollTop;
              backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
          onKeyDown={(event) => {
            const shortcut = symbolForShortcut(event);
            if (!shortcut) return;
            event.preventDefault();
            insert(shortcut.insert, shortcut.insert.endsWith('()') ? 2 : shortcut.insert.length);
          }}
        />
      </div>
      <p className="muted small">{UI.editorHelp}</p>
    </div>
  );
}
