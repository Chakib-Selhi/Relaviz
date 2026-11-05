import { UI } from '../messages.fr.js';
import { SYMBOLS } from '../symbols.js';

/**
 * Barre de symboles (EF-11). Pour σ, π et ρ, le curseur est placé entre les crochets.
 * @param {{ onInsert: (text: string, caretOffset: number) => void }} props
 */
export default function SymbolBar({ onInsert }) {
  return (
    <div className="symbol-bar" role="toolbar" aria-label={UI.symbolsLabel}>
      {SYMBOLS.map(({ symbol, keyword, key, insert }) => (
        <button
          key={symbol}
          type="button"
          className="symbol"
          title={`${keyword} · ${UI.shortcut(key)}`}
          aria-label={`${symbol} ${keyword}`}
          onClick={() => onInsert(insert, insert.endsWith('()') ? 2 : insert.length)}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}
