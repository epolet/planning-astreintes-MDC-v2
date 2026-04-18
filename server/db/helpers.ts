/**
 * Shared database helpers used by multiple routes.
 * These are plain functions (not transactions) — callers wrap them in
 * db.transaction() as needed so they compose correctly with outer transactions.
 */
import { randomUUID } from 'crypto';
import db from './client.js';

type ScoreTotalsRow = {
  cadre_id: string;
  a1: number; a2: number; a3: number; a4: number; a5: number;
  p1: number; p2: number; p3: number; p4: number; p5: number;
};

type SlotCountRow = {
  cadre_id: string;
  type: string;
  difficulte: number;
  cnt: number;
};

/**
 * Recalculates the global score counters on the `cadres` table by summing all
 * `period_scores` rows (draft + published). Must be called after any mutation
 * that changes period_scores.
 */
export function recalculateCadreGlobalScores(): void {
  const totals = db.prepare(`
    SELECT ps.cadre_id,
      SUM(ps.astreinte_d1) AS a1, SUM(ps.astreinte_d2) AS a2,
      SUM(ps.astreinte_d3) AS a3, SUM(ps.astreinte_d4) AS a4, SUM(ps.astreinte_d5) AS a5,
      SUM(ps.permanence_d1) AS p1, SUM(ps.permanence_d2) AS p2,
      SUM(ps.permanence_d3) AS p3, SUM(ps.permanence_d4) AS p4, SUM(ps.permanence_d5) AS p5
    FROM period_scores ps
    GROUP BY ps.cadre_id
  `).all() as ScoreTotalsRow[];

  db.prepare(`UPDATE cadres SET
    astreinte_d1 = 0, astreinte_d2 = 0, astreinte_d3 = 0, astreinte_d4 = 0, astreinte_d5 = 0,
    permanence_d1 = 0, permanence_d2 = 0, permanence_d3 = 0, permanence_d4 = 0, permanence_d5 = 0
  `).run();

  const upd = db.prepare(`UPDATE cadres SET
    astreinte_d1 = ?, astreinte_d2 = ?, astreinte_d3 = ?, astreinte_d4 = ?, astreinte_d5 = ?,
    permanence_d1 = ?, permanence_d2 = ?, permanence_d3 = ?, permanence_d4 = ?, permanence_d5 = ?
    WHERE id = ?`);

  for (const r of totals) {
    upd.run(r.a1, r.a2, r.a3, r.a4, r.a5, r.p1, r.p2, r.p3, r.p4, r.p5, r.cadre_id);
  }
}

/**
 * Resyncs `period_scores` for a given period by recounting from actual slot
 * assignments, then calls recalculateCadreGlobalScores().
 * Safe: does not modify any slots.
 */
export function resyncPeriodScoresFromSlots(periodId: string): void {
  const rows = db.prepare(`
    SELECT cadre_id, type, difficulte, COUNT(*) AS cnt
    FROM slots
    WHERE period_id = ? AND cadre_id IS NOT NULL
    GROUP BY cadre_id, type, difficulte
  `).all(periodId) as SlotCountRow[];

  const scoreMap = new Map<string, Record<string, number>>();
  for (const row of rows) {
    if (!scoreMap.has(row.cadre_id)) {
      scoreMap.set(row.cadre_id, {
        astreinte_d1: 0, astreinte_d2: 0, astreinte_d3: 0, astreinte_d4: 0, astreinte_d5: 0,
        permanence_d1: 0, permanence_d2: 0, permanence_d3: 0, permanence_d4: 0, permanence_d5: 0,
      });
    }
    const prefix = row.type === 'Astreinte' ? 'astreinte' : 'permanence';
    const key = `${prefix}_d${row.difficulte}`;
    const s = scoreMap.get(row.cadre_id)!;
    s[key] = (s[key] ?? 0) + row.cnt;
  }

  db.prepare('DELETE FROM period_scores WHERE period_id = ?').run(periodId);

  const now = new Date().toISOString();
  const ins = db.prepare(`
    INSERT INTO period_scores (id, cadre_id, period_id,
      astreinte_d1, astreinte_d2, astreinte_d3, astreinte_d4, astreinte_d5,
      permanence_d1, permanence_d2, permanence_d3, permanence_d4, permanence_d5,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [cadreId, s] of scoreMap) {
    ins.run(
      randomUUID(), cadreId, periodId,
      s.astreinte_d1, s.astreinte_d2, s.astreinte_d3, s.astreinte_d4, s.astreinte_d5,
      s.permanence_d1, s.permanence_d2, s.permanence_d3, s.permanence_d4, s.permanence_d5,
      now, now,
    );
  }

  recalculateCadreGlobalScores();
}
