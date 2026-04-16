import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { periodScoreToApp } from '../db/mappers.js';

const router = Router();

function rowToCounters(r: Record<string, number>) {
  return {
    cadreId: (r as unknown as Record<string, unknown>).cadre_id as string,
    astreinteD1: r.astreinte_d1 ?? 0,
    astreinteD2: r.astreinte_d2 ?? 0,
    astreinteD3: r.astreinte_d3 ?? 0,
    astreinteD4: r.astreinte_d4 ?? 0,
    astreinteD5: r.astreinte_d5 ?? 0,
    permanenceD1: r.permanence_d1 ?? 0,
    permanenceD2: r.permanence_d2 ?? 0,
    permanenceD3: r.permanence_d3 ?? 0,
    permanenceD4: r.permanence_d4 ?? 0,
    permanenceD5: r.permanence_d5 ?? 0,
  };
}

// Literal sub-routes before query-param routes
router.get('/cumulative', (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });

  const period = db.prepare('SELECT start_date FROM planning_periods WHERE id = ?').get(periodId as string) as { start_date: string } | undefined;
  if (!period) return res.json([]);

  const rows = db.prepare(`
    SELECT ps.cadre_id,
      SUM(ps.astreinte_d1) AS astreinte_d1, SUM(ps.astreinte_d2) AS astreinte_d2,
      SUM(ps.astreinte_d3) AS astreinte_d3, SUM(ps.astreinte_d4) AS astreinte_d4,
      SUM(ps.astreinte_d5) AS astreinte_d5,
      SUM(ps.permanence_d1) AS permanence_d1, SUM(ps.permanence_d2) AS permanence_d2,
      SUM(ps.permanence_d3) AS permanence_d3, SUM(ps.permanence_d4) AS permanence_d4,
      SUM(ps.permanence_d5) AS permanence_d5
    FROM period_scores ps
    JOIN planning_periods pp ON ps.period_id = pp.id
    WHERE pp.status = 'published' AND pp.start_date < ?
    GROUP BY ps.cadre_id
  `).all(period.start_date) as Record<string, number>[];

  res.json(rows.map(rowToCounters));
});

router.get('/cumulative-all', (_req, res) => {
  const rows = db.prepare(`
    SELECT ps.cadre_id,
      SUM(ps.astreinte_d1) AS astreinte_d1, SUM(ps.astreinte_d2) AS astreinte_d2,
      SUM(ps.astreinte_d3) AS astreinte_d3, SUM(ps.astreinte_d4) AS astreinte_d4,
      SUM(ps.astreinte_d5) AS astreinte_d5,
      SUM(ps.permanence_d1) AS permanence_d1, SUM(ps.permanence_d2) AS permanence_d2,
      SUM(ps.permanence_d3) AS permanence_d3, SUM(ps.permanence_d4) AS permanence_d4,
      SUM(ps.permanence_d5) AS permanence_d5
    FROM period_scores ps
    JOIN planning_periods pp ON ps.period_id = pp.id
    WHERE pp.status = 'published'
    GROUP BY ps.cadre_id
  `).all() as Record<string, number>[];

  res.json(rows.map(rowToCounters));
});

// Per-cadre per-period breakdown for historical export
router.get('/all-periods', (_req, res) => {
  const rows = db.prepare(`
    SELECT ps.cadre_id, ps.period_id, pp.label AS period_label, pp.start_date, pp.end_date, pp.status,
      ps.astreinte_d1, ps.astreinte_d2, ps.astreinte_d3, ps.astreinte_d4, ps.astreinte_d5,
      ps.permanence_d1, ps.permanence_d2, ps.permanence_d3, ps.permanence_d4, ps.permanence_d5
    FROM period_scores ps
    JOIN planning_periods pp ON ps.period_id = pp.id
    ORDER BY pp.start_date ASC
  `).all() as Record<string, unknown>[];

  res.json(rows.map(r => ({
    cadreId: r.cadre_id,
    periodId: r.period_id,
    periodLabel: r.period_label,
    periodStatus: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    astreinteD1: (r.astreinte_d1 as number) ?? 0,
    astreinteD2: (r.astreinte_d2 as number) ?? 0,
    astreinteD3: (r.astreinte_d3 as number) ?? 0,
    astreinteD4: (r.astreinte_d4 as number) ?? 0,
    astreinteD5: (r.astreinte_d5 as number) ?? 0,
    permanenceD1: (r.permanence_d1 as number) ?? 0,
    permanenceD2: (r.permanence_d2 as number) ?? 0,
    permanenceD3: (r.permanence_d3 as number) ?? 0,
    permanenceD4: (r.permanence_d4 as number) ?? 0,
    permanenceD5: (r.permanence_d5 as number) ?? 0,
  })));
});

/**
 * Resync period_scores from actual slot assignments for a given period,
 * then recalculate global cadre scores. Safe: does not modify any slots.
 */
router.post('/resync/:periodId', (req, res) => {
  const { periodId } = req.params;

  const resync = db.transaction(() => {
    // 1. Recount from actual assigned slots
    const rows = db.prepare(`
      SELECT cadre_id, type, difficulte, COUNT(*) AS cnt
      FROM slots
      WHERE period_id = ? AND cadre_id IS NOT NULL
      GROUP BY cadre_id, type, difficulte
    `).all(periodId) as { cadre_id: string; type: string; difficulte: number; cnt: number }[];

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

    // 2. Replace period_scores for this period
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
      ins.run(randomUUID(), cadreId, periodId,
        s.astreinte_d1, s.astreinte_d2, s.astreinte_d3, s.astreinte_d4, s.astreinte_d5,
        s.permanence_d1, s.permanence_d2, s.permanence_d3, s.permanence_d4, s.permanence_d5,
        now, now);
    }

    // 3. Recalculate global cadre scores from ALL period_scores (published + draft)
    const totals = db.prepare(`
      SELECT ps.cadre_id,
        SUM(ps.astreinte_d1) AS a1, SUM(ps.astreinte_d2) AS a2,
        SUM(ps.astreinte_d3) AS a3, SUM(ps.astreinte_d4) AS a4, SUM(ps.astreinte_d5) AS a5,
        SUM(ps.permanence_d1) AS p1, SUM(ps.permanence_d2) AS p2,
        SUM(ps.permanence_d3) AS p3, SUM(ps.permanence_d4) AS p4, SUM(ps.permanence_d5) AS p5
      FROM period_scores ps
      GROUP BY ps.cadre_id
    `).all() as { cadre_id: string; a1:number; a2:number; a3:number; a4:number; a5:number; p1:number; p2:number; p3:number; p4:number; p5:number }[];

    db.prepare(`UPDATE cadres SET
      astreinte_d1=0, astreinte_d2=0, astreinte_d3=0, astreinte_d4=0, astreinte_d5=0,
      permanence_d1=0, permanence_d2=0, permanence_d3=0, permanence_d4=0, permanence_d5=0
    `).run();
    const upd = db.prepare(`UPDATE cadres SET
      astreinte_d1=?, astreinte_d2=?, astreinte_d3=?, astreinte_d4=?, astreinte_d5=?,
      permanence_d1=?, permanence_d2=?, permanence_d3=?, permanence_d4=?, permanence_d5=?
      WHERE id=?`);
    for (const r of totals) {
      upd.run(r.a1, r.a2, r.a3, r.a4, r.a5, r.p1, r.p2, r.p3, r.p4, r.p5, r.cadre_id);
    }
  });

  resync();
  res.json({ ok: true });
});

router.post('/recalculate', (_req, res) => {
  // Include both published AND draft periods so that an active draft's
  // contribution to the cadres table is not wiped when another period
  // is published (which triggers this endpoint).
  const rows = db.prepare(`
    SELECT ps.cadre_id,
      SUM(ps.astreinte_d1) AS a1, SUM(ps.astreinte_d2) AS a2,
      SUM(ps.astreinte_d3) AS a3, SUM(ps.astreinte_d4) AS a4,
      SUM(ps.astreinte_d5) AS a5,
      SUM(ps.permanence_d1) AS p1, SUM(ps.permanence_d2) AS p2,
      SUM(ps.permanence_d3) AS p3, SUM(ps.permanence_d4) AS p4,
      SUM(ps.permanence_d5) AS p5
    FROM period_scores ps
    JOIN planning_periods pp ON ps.period_id = pp.id
    GROUP BY ps.cadre_id
  `).all() as { cadre_id: string; a1: number; a2: number; a3: number; a4: number; a5: number; p1: number; p2: number; p3: number; p4: number; p5: number }[];

  const update = db.prepare(`UPDATE cadres SET
    astreinte_d1 = ?, astreinte_d2 = ?, astreinte_d3 = ?, astreinte_d4 = ?, astreinte_d5 = ?,
    permanence_d1 = ?, permanence_d2 = ?, permanence_d3 = ?, permanence_d4 = ?, permanence_d5 = ?
    WHERE id = ?`);

  const updateAll = db.transaction((entries: typeof rows) => {
    // First zero-out all cadres so those with no published scores are reset
    db.prepare(`UPDATE cadres SET
      astreinte_d1 = 0, astreinte_d2 = 0, astreinte_d3 = 0, astreinte_d4 = 0, astreinte_d5 = 0,
      permanence_d1 = 0, permanence_d2 = 0, permanence_d3 = 0, permanence_d4 = 0, permanence_d5 = 0
    `).run();
    for (const r of entries) {
      update.run(r.a1, r.a2, r.a3, r.a4, r.a5, r.p1, r.p2, r.p3, r.p4, r.p5, r.cadre_id);
    }
  });
  updateAll(rows);
  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });
  const rows = db.prepare('SELECT * FROM period_scores WHERE period_id = ?').all(periodId as string);
  res.json((rows as Record<string, unknown>[]).map(periodScoreToApp));
});

router.put('/upsert', (req, res) => {
  const { periodId, scores } = req.body as {
    periodId: string;
    scores: {
      cadreId: string;
      astreinteD1: number; astreinteD2: number; astreinteD3: number; astreinteD4: number; astreinteD5: number;
      permanenceD1: number; permanenceD2: number; permanenceD3: number; permanenceD4: number; permanenceD5: number;
    }[];
  };
  if (!scores || scores.length === 0) return res.json({ ok: true });

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO period_scores (
      id, cadre_id, period_id,
      astreinte_d1, astreinte_d2, astreinte_d3, astreinte_d4, astreinte_d5,
      permanence_d1, permanence_d2, permanence_d3, permanence_d4, permanence_d5,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cadre_id, period_id) DO UPDATE SET
      astreinte_d1 = excluded.astreinte_d1,
      astreinte_d2 = excluded.astreinte_d2,
      astreinte_d3 = excluded.astreinte_d3,
      astreinte_d4 = excluded.astreinte_d4,
      astreinte_d5 = excluded.astreinte_d5,
      permanence_d1 = excluded.permanence_d1,
      permanence_d2 = excluded.permanence_d2,
      permanence_d3 = excluded.permanence_d3,
      permanence_d4 = excluded.permanence_d4,
      permanence_d5 = excluded.permanence_d5,
      updated_at = excluded.updated_at
  `);
  const upsertAll = db.transaction(() => {
    for (const s of scores) {
      upsert.run(
        randomUUID(), s.cadreId, periodId,
        s.astreinteD1, s.astreinteD2, s.astreinteD3, s.astreinteD4, s.astreinteD5,
        s.permanenceD1, s.permanenceD2, s.permanenceD3, s.permanenceD4, s.permanenceD5,
        now, now,
      );
    }
  });
  upsertAll();
  res.json({ ok: true });
});

router.delete('/', (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });
  db.prepare('DELETE FROM period_scores WHERE period_id = ?').run(periodId as string);
  res.json({ ok: true });
});

export default router;
