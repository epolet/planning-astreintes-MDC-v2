import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { periodScoreToApp, aggregateScoreToApp } from '../db/mappers.js';
import { recalculateCadreGlobalScores, resyncPeriodScoresFromSlots } from '../db/helpers.js';

const router = Router();

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

  res.json(rows.map(r => aggregateScoreToApp(r as Record<string, unknown>)));
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

  res.json(rows.map(r => aggregateScoreToApp(r as Record<string, unknown>)));
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

/** Resync period_scores from actual slot assignments, then recalculate global scores. */
router.post('/resync/:periodId', (req, res) => {
  const { periodId } = req.params;
  db.transaction(() => resyncPeriodScoresFromSlots(periodId))();
  res.json({ ok: true });
});

/** Recalculate global cadre score counters from all period_scores (draft + published). */
router.post('/recalculate', (_req, res) => {
  db.transaction(() => recalculateCadreGlobalScores())();
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
