import { beforeAll, describe, expect, it } from 'vitest';
import { exercises, getExercises } from '../../src/data/exercises.js';
import { getSampleDatabase, sampleDatabases } from '../../src/data/index.js';
import { analyze } from '../../src/engine/index.js';
import { loadSqlJs, verifyWithSql } from '../../src/engine/sql-oracle.js';

let SQL;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

describe('exercices préchargés', () => {
  it('propose 5 exercices par base, avec des identifiants uniques', () => {
    for (const { id } of sampleDatabases) {
      const list = getExercises(id);
      expect(list).toHaveLength(5);
      expect(new Set(list.map((e) => e.id)).size).toBe(5);
    }
    expect(getExercises('inconnue')).toEqual([]);
  });

  const cases = Object.entries(exercises).flatMap(([databaseId, list]) =>
    list.map((exercise) => [databaseId, exercise.id, exercise]),
  );

  it.each(cases)(
    '%s / %s : solution valide, non vide et confirmée par SQLite',
    (databaseId, _id, exercise) => {
      const database = getSampleDatabase(databaseId);
      const analysis = analyze(exercise.solution, database);
      expect(analysis.ok, analysis.ok ? '' : analysis.error.message).toBe(true);
      expect(analysis.warnings).toEqual([]);
      expect(analysis.result.tuples.length).toBeGreaterThan(0);
      expect(verifyWithSql(SQL, database, analysis.sql.sql, analysis.result).identical).toBe(true);
      expect(exercise.statement.length).toBeGreaterThan(20);
    },
  );
});
