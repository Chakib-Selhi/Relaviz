import { useEffect, useMemo, useState } from 'react';
import { getExercises } from '../data/exercises.js';
import { getSampleDatabase, sampleDatabases } from '../data/index.js';
import { analyze, nodeLabel } from '../engine/index.js';
import Editor from './components/Editor.jsx';
import ExercisePanel from './components/ExercisePanel.jsx';
import ResultTable from './components/ResultTable.jsx';
import SchemaPanel from './components/SchemaPanel.jsx';
import SqlPanel from './components/SqlPanel.jsx';
import TreeView from './components/TreeView.jsx';
import { DEFAULT_EXPRESSIONS, UI } from './messages.fr.js';
import { nodeAtOffset } from './tree-layout.js';
import { readState, writeState } from './url-state.js';

const DATABASE_IDS = sampleDatabases.map((db) => db.id);

/** État initial : fragment de l'URL s'il est valide, sinon la première base et son exemple. */
function initialState() {
  const fromUrl = readState(window.location.hash, DATABASE_IDS);
  const databaseId = fromUrl.databaseId ?? DATABASE_IDS[0];
  const exercise = getExercises(databaseId).find((e) => e.id === fromUrl.exerciseId);
  return {
    databaseId,
    exerciseId: exercise ? exercise.id : null,
    expression: fromUrl.expression ?? DEFAULT_EXPRESSIONS[databaseId] ?? '',
  };
}

/**
 * Racine de l'interface. L'analyse complète est recalculée à chaque frappe : le moteur traite
 * une expression de 10 opérateurs en quelques millisecondes sur les bases d'exemple.
 * @param {{ loadSql?: Parameters<typeof SqlPanel>[0]['loadSql'] }} props
 */
export default function App({ loadSql }) {
  const [{ databaseId, exerciseId, expression }, setState] = useState(initialState);
  const [checkedExpression, setCheckedExpression] = useState(/** @type {string | null} */ (null));
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));
  const [hoveredId, setHoveredId] = useState(/** @type {string | null} */ (null));
  const [caret, setCaret] = useState(/** @type {number | null} */ (null));
  const [tab, setTab] = useState(/** @type {'table' | 'sql'} */ ('table'));
  const [copied, setCopied] = useState(false);

  const database = /** @type {import('../data/index.js').SampleDatabase} */ (
    getSampleDatabase(databaseId)
  );
  const analysis = useMemo(() => analyze(expression, database), [expression, database]);

  // Partage : l'URL suit la base et l'expression, sans ajouter d'entrée à l'historique.
  useEffect(() => {
    window.history.replaceState(null, '', writeState(databaseId, expression, exerciseId));
  }, [databaseId, expression, exerciseId]);

  // Exercices : la réponse est comparée au résultat de la solution, comme ensembles de tuples.
  const exerciseList = getExercises(databaseId);
  const exercise = exerciseList.find((e) => e.id === exerciseId) ?? null;
  const solution = useMemo(
    () => (exercise ? analyze(exercise.solution, database) : null),
    [exercise, database],
  );
  const verdict = useMemo(() => {
    if (!solution?.ok || !solution.result || checkedExpression !== expression) return null;
    const expected = solution.result.tuples;
    if (!analysis.ok || !analysis.result)
      return { status: 'notReady', expected: expected.length, found: 0 };
    const found = analysis.result.tuples;
    const keys = new Set(expected.map((t) => JSON.stringify(t)));
    const same =
      found.length === expected.length && found.every((t) => keys.has(JSON.stringify(t)));
    return { status: same ? 'correct' : 'wrong', expected: expected.length, found: found.length };
  }, [solution, analysis, checkedExpression, expression]);

  const program = analysis.ok ? analysis.program : (analysis.program ?? null);
  const roots = useMemo(() => {
    if (!program) return [];
    const trees = program.assignments.map((a) => ({
      title: UI.assignmentTree(a.name),
      root: a.expression,
    }));
    if (program.result) trees.push({ title: UI.resultTree, root: program.result });
    return trees;
  }, [program]);

  const order = analysis.ok ? analysis.trace.map((step) => step.nodeId) : [];
  const defaultId = analysis.ok ? (analysis.root?.id ?? null) : null;
  const currentId = selectedId && order.includes(selectedId) ? selectedId : defaultId;
  const position = currentId ? order.indexOf(currentId) : -1;
  const selectedRelation = analysis.ok && currentId ? analysis.results.get(currentId) : undefined;

  const counts = useMemo(
    () => new Map(analysis.ok ? analysis.trace.map((s) => [s.nodeId, s.result.tuples.length]) : []),
    [analysis],
  );
  const schemas = analysis.ok ? analysis.schemas : new Map();
  const namedResults = new Set(program ? program.assignments.map((a) => a.name) : []);

  // Survol d'un nœud : sa partie de l'expression est surlignée. Curseur dans l'expression :
  // le plus petit nœud qui le contient est mis en évidence dans l'arbre.
  const allNodes = roots.map((t) => t.root);
  const hoveredNode = hoveredId ? findNode(allNodes, hoveredId) : null;
  const caretNode = caret !== null && !hoveredId ? nodeAtOffset(allNodes, caret) : null;
  const highlighted = hoveredNode ?? caretNode;

  const error = analysis.ok ? null : analysis.error;
  const warnings = analysis.ok ? analysis.warnings : [];

  function changeDatabase(/** @type {string} */ id) {
    setState((previous) => ({
      databaseId: id,
      exerciseId: null,
      expression:
        previous.expression === DEFAULT_EXPRESSIONS[previous.databaseId]
          ? (DEFAULT_EXPRESSIONS[id] ?? '')
          : previous.expression,
    }));
    setSelectedId(null);
  }

  function chooseExercise(/** @type {string | null} */ id) {
    const chosen = exerciseList.find((e) => e.id === id);
    setState((previous) => ({
      ...previous,
      exerciseId: chosen ? chosen.id : null,
      expression: chosen ? `-- ${chosen.title}\n-- ${chosen.statement}\n` : previous.expression,
    }));
    setSelectedId(null);
  }

  function showSolution() {
    if (!exercise) return;
    setState((previous) => ({
      ...previous,
      expression: `-- ${exercise.title}\n${exercise.solution}`,
    }));
    setSelectedId(null);
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(UI.shareFallback, window.location.href);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>{UI.appTitle}</h1>
          <p className="muted">{UI.appSubtitle}</p>
        </div>
        <div className="header-actions">
          <label className="label" htmlFor="database">
            {UI.database}
          </label>
          <select id="database" value={databaseId} onChange={(e) => changeDatabase(e.target.value)}>
            {sampleDatabases.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={share} aria-live="polite">
            {copied ? UI.shareDone : UI.share}
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="layout-schema">
          <SchemaPanel database={database} />
        </aside>

        <section className="layout-main">
          <div className="panel">
            <ExercisePanel
              exercises={exerciseList}
              exerciseId={exerciseId}
              verdict={verdict}
              onChoose={chooseExercise}
              onCheck={() => setCheckedExpression(expression)}
              onShowSolution={showSolution}
            />
            <Editor
              value={expression}
              onChange={(value) => setState((s) => ({ ...s, expression: value }))}
              onCaret={setCaret}
              errorSpan={error?.span ?? null}
              highlightSpan={highlighted?.span ?? null}
              describedBy="diagnostics"
            />
            <div id="diagnostics" aria-live="polite">
              {error && (
                <p className="status status-error" role="alert">
                  <strong>
                    {analysis.ok || analysis.stage === 'syntax' ? UI.syntaxError : UI.schemaError}
                  </strong>{' '}
                  ({UI.errorAt(error.line, error.column)}) : {error.message}
                </p>
              )}
              {warnings.map((warning) => (
                <p key={`${warning.code}-${warning.span.start}`} className="status status-warning">
                  <strong>{UI.warning}</strong> ({UI.errorAt(warning.line, warning.column)}) :{' '}
                  {warning.message}
                </p>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{UI.treeTitle}</h2>
            {roots.length === 0 ? (
              <p className="muted">{UI.treeEmpty}</p>
            ) : (
              roots.map(({ title, root }) => (
                <TreeView
                  key={root.id}
                  title={title}
                  root={root}
                  counts={counts}
                  schemas={schemas}
                  namedResults={namedResults}
                  selectedId={currentId}
                  highlightedId={highlighted?.id ?? null}
                  onSelect={setSelectedId}
                  onHover={setHoveredId}
                />
              ))
            )}
          </div>
        </section>

        <section className="layout-result panel">
          <div className="tabs" role="tablist" aria-label={UI.stepTitle}>
            {[
              ['table', UI.tabTable],
              ['sql', UI.tabSql],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                className={tab === id ? 'tab active' : 'tab'}
                onClick={() => setTab(/** @type {'table' | 'sql'} */ (id))}
              >
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'table' ? (
              <>
                <div className="step-controls">
                  <button
                    type="button"
                    disabled={position <= 0}
                    onClick={() => setSelectedId(order[position - 1])}
                    aria-label={UI.previous}
                  >
                    ←
                  </button>
                  <span aria-live="polite">
                    {position >= 0 ? UI.stepOf(position + 1, order.length) : ''}
                  </span>
                  <button
                    type="button"
                    disabled={position < 0 || position >= order.length - 1}
                    onClick={() => setSelectedId(order[position + 1])}
                    aria-label={UI.next}
                  >
                    →
                  </button>
                </div>
                {selectedRelation && currentId ? (
                  <ResultTable
                    relation={selectedRelation}
                    caption={nodeLabelOf(allNodes, currentId)}
                  />
                ) : (
                  <p className="muted">{UI.noStep}</p>
                )}
              </>
            ) : (
              <SqlPanel
                sql={analysis.ok ? (analysis.sql?.sql ?? null) : null}
                result={analysis.ok ? analysis.result : null}
                database={database}
                loadSql={loadSql}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * @param {import('../engine/types.js').Node[]} roots
 * @param {string} id
 * @returns {import('../engine/types.js').Node | null}
 */
function findNode(roots, id) {
  for (const root of roots) {
    if (root.id === id) return root;
    const children =
      root.kind === 'relation' ? [] : 'child' in root ? [root.child] : [root.left, root.right];
    const found = findNode(children, id);
    if (found) return found;
  }
  return null;
}

/**
 * @param {import('../engine/types.js').Node[]} roots
 * @param {string} id
 */
function nodeLabelOf(roots, id) {
  const node = findNode(roots, id);
  return node ? nodeLabel(node) : '';
}
