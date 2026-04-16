import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { slotToApp, slotTypeToDb, slotStatusToDb } from '../db/mappers.js';

const router = Router();

const SLOTS_WITH_CADRE = `
  SELECT s.*, c.nom AS cadre_nom
  FROM slots s
  LEFT JOIN cadres c ON s.cadre_id = c.id
`;

// Literal sub-routes must come before /:id
router.get('/count', (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });
  const row = db.prepare('SELECT COUNT(*) AS n FROM slots WHERE period_id = ?').get(periodId as string) as { n: number };
  res.json({ count: row.n });
});

router.post('/batch', (req, res) => {
  const slots: Record<string, unknown>[] = req.body;
  if (!Array.isArray(slots) || slots.length === 0) return res.json({ ok: true });

  const insert = db.prepare(`
    INSERT INTO slots (id, date, type, difficulte, cadre_id, statut, label, period_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
    for (const s of rows) {
      insert.run(
        randomUUID(),
        s.date,
        slotTypeToDb(s.type as string),
        s.difficulty ?? 1,
        s.cadreId ?? null,
        slotStatusToDb(s.status as string),
        s.label ?? null,
        s.periodId ?? null,
      );
    }
  });
  insertMany(slots);
  res.status(201).json({ ok: true });
});

router.post('/clear', (req, res) => {
  const { periodId, type } = req.query as { periodId?: string; type?: string };
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });

  const clearAndRecompute = db.transaction(() => {
    // 1. Clear slot assignments
    if (type === 'astreinte') {
      db.prepare(`UPDATE slots SET cadre_id = NULL, statut = 'automatise' WHERE period_id = ? AND type = 'Astreinte'`).run(periodId);
    } else if (type === 'permanence') {
      db.prepare(`UPDATE slots SET cadre_id = NULL, statut = 'automatise' WHERE period_id = ? AND type = 'Permanence'`).run(periodId);
    } else {
      db.prepare(`UPDATE slots SET cadre_id = NULL, statut = 'automatise' WHERE period_id = ?`).run(periodId);
    }

    // 2. Recount period_scores from remaining assigned slots
    const remaining = db.prepare(`
      SELECT cadre_id, type, difficulte, COUNT(*) AS cnt
      FROM slots
      WHERE period_id = ? AND cadre_id IS NOT NULL
      GROUP BY cadre_id, type, difficulte
    `).all(periodId) as { cadre_id: string; type: string; difficulte: number; cnt: number }[];

    const scoreMap = new Map<string, Record<string, number>>();
    for (const row of remaining) {
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

    // 3. Replace period_scores for this period
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

    // 4. Recalculate global cadre scores from ALL period_scores (draft + published)
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

  clearAndRecompute();
  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const { periodId } = req.query;
  let rows: unknown[];
  if (periodId) {
    rows = db.prepare(`${SLOTS_WITH_CADRE} WHERE s.period_id = ? ORDER BY s.date`).all(periodId as string);
  } else {
    rows = db.prepare(`${SLOTS_WITH_CADRE} ORDER BY s.date`).all();
  }
  res.json((rows as Record<string, unknown>[]).map(slotToApp));
});

router.patch('/:id/with-scores', (req, res) => {
  const { cadreId: newCadreId, difficulty: newDifficulty, periodId } = req.body;
  const slotId = req.params.id;

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId) as Record<string, unknown> | undefined;
  if (!slot) return res.status(404).json({ error: 'Slot not found' });

  const oldCadreId = (slot.cadre_id as string) ?? null;
  const oldD = slot.difficulte as number;
  const newD = Number(newDifficulty);

  // Validate difficulty to prevent SQL injection via template literal column names
  if (!Number.isInteger(newD) || newD < 1 || newD > 5) {
    return res.status(400).json({ error: 'difficulty must be 1-5' });
  }

  const typePrefix = slot.type === 'Astreinte' ? 'astreinte' : 'permanence';
  const colOld = `${typePrefix}_d${oldD}`;
  const colNew = `${typePrefix}_d${newD}`;

  const updateWithScores = db.transaction(() => {
    if (periodId) {
      // Case 1: old cadre removed / replaced — decrement old cadre's counter
      if (oldCadreId && oldCadreId !== newCadreId) {
        db.prepare(`UPDATE period_scores SET ${colOld} = MAX(0, ${colOld} - 1) WHERE period_id = ? AND cadre_id = ?`)
          .run(periodId, oldCadreId);
        db.prepare(`UPDATE cadres SET ${colOld} = MAX(0, ${colOld} - 1) WHERE id = ?`)
          .run(oldCadreId);
      }

      // Case 2: new cadre assigned — increment new cadre's counter
      if (newCadreId && newCadreId !== oldCadreId) {
        const existing = db.prepare('SELECT id FROM period_scores WHERE period_id = ? AND cadre_id = ?')
          .get(periodId, newCadreId);
        if (existing) {
          db.prepare(`UPDATE period_scores SET ${colNew} = ${colNew} + 1 WHERE period_id = ? AND cadre_id = ?`)
            .run(periodId, newCadreId);
        } else {
          const now = new Date().toISOString();
          db.prepare(`INSERT INTO period_scores (id, cadre_id, period_id, ${colNew}, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), newCadreId, periodId, 1, now, now);
        }
        db.prepare(`UPDATE cadres SET ${colNew} = ${colNew} + 1 WHERE id = ?`)
          .run(newCadreId);
      }

      // Case 3: same cadre, difficulty changed — move count from old column to new column
      if (newCadreId && newCadreId === oldCadreId && newD !== oldD) {
        db.prepare(`UPDATE period_scores SET ${colOld} = MAX(0, ${colOld} - 1), ${colNew} = ${colNew} + 1 WHERE period_id = ? AND cadre_id = ?`)
          .run(periodId, newCadreId);
        db.prepare(`UPDATE cadres SET ${colOld} = MAX(0, ${colOld} - 1), ${colNew} = ${colNew} + 1 WHERE id = ?`)
          .run(newCadreId);
      }
    }

    db.prepare(`UPDATE slots SET cadre_id = ?, difficulte = ?, statut = 'manuel' WHERE id = ?`)
      .run(newCadreId ?? null, newD, slotId);
  });

  updateWithScores();
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const { cadreId, difficulty, status, label } = req.body;
  const sets: string[] = [];
  const params: unknown[] = [];

  if (cadreId !== undefined)    { sets.push('cadre_id = ?');   params.push(cadreId); }
  if (difficulty !== undefined) { sets.push('difficulte = ?'); params.push(difficulty); }
  if (status !== undefined)     { sets.push('statut = ?');     params.push(slotStatusToDb(status)); }
  if (label !== undefined)      { sets.push('label = ?');      params.push(label); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE slots SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// Delete a single slot and atomically decrement the assigned cadre's counters
router.delete('/:id', (req, res) => {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!slot) return res.status(404).json({ error: 'Slot not found' });

  const oldCadreId = slot.cadre_id as string | null;
  const oldD = slot.difficulte as number;
  const periodId = slot.period_id as string | null;
  const typePrefix = slot.type === 'Astreinte' ? 'astreinte' : 'permanence';
  const col = `${typePrefix}_d${oldD}`;

  const deleteWithScores = db.transaction(() => {
    if (oldCadreId && periodId) {
      db.prepare(`UPDATE period_scores SET ${col} = MAX(0, ${col} - 1) WHERE period_id = ? AND cadre_id = ?`)
        .run(periodId, oldCadreId);
      db.prepare(`UPDATE cadres SET ${col} = MAX(0, ${col} - 1) WHERE id = ?`)
        .run(oldCadreId);
    }
    db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  });

  deleteWithScores();
  res.json({ ok: true });
});

router.delete('/', (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });
  db.prepare('DELETE FROM slots WHERE period_id = ?').run(periodId as string);
  res.json({ ok: true });
});

export default router;
