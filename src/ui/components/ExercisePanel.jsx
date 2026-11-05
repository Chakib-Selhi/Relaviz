import { UI } from '../messages.fr.js';

/**
 * Exercices préchargés : choix de l'énoncé, vérification de la réponse, solution.
 * @param {{
 *   exercises: readonly import('../../data/exercises.js').Exercise[],
 *   exerciseId: string | null,
 *   verdict: { status: 'correct' | 'wrong' | 'notReady', expected: number, found: number } | null,
 *   onChoose: (id: string | null) => void,
 *   onCheck: () => void,
 *   onShowSolution: () => void,
 * }} props
 */
export default function ExercisePanel({
  exercises,
  exerciseId,
  verdict,
  onChoose,
  onCheck,
  onShowSolution,
}) {
  const exercise = exercises.find((e) => e.id === exerciseId) ?? null;
  return (
    <div className="exercise">
      <label className="label" htmlFor="exercise">
        {UI.exercise}
      </label>
      <select
        id="exercise"
        value={exerciseId ?? ''}
        onChange={(event) => onChoose(event.target.value || null)}
      >
        <option value="">{UI.freeMode}</option>
        {exercises.map((e, i) => (
          <option key={e.id} value={e.id}>
            {i + 1}. {e.title}
          </option>
        ))}
      </select>
      {exercise && (
        <div className="exercise-body">
          <p>{exercise.statement}</p>
          <div className="exercise-actions">
            <button type="button" onClick={onCheck}>
              {UI.check}
            </button>
            <button type="button" onClick={onShowSolution}>
              {UI.showSolution}
            </button>
          </div>
          <div aria-live="polite">
            {verdict?.status === 'correct' && (
              <p className="status status-ok">✓ {UI.correct(verdict.expected)}</p>
            )}
            {verdict?.status === 'wrong' && (
              <p className="status status-error">{UI.wrong(verdict.expected, verdict.found)}</p>
            )}
            {verdict?.status === 'notReady' && (
              <p className="status status-warning">{UI.notReady}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
