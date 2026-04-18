import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { slotToApp, slotTypeToDb, slotStatusToDb } from '../db/mappers.js';
import { resyncPeriodScoresFromSlots } from '../db/helpers.js';

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
  const { periodId, type, statusFilter } = req.query as {
    periodId?: string;
    type?: string;
    /** When 'auto', only wipe slots with statut='automatise' (keeps manual ones). */
    statusFilter?: string;
  };
  if (!periodId) return res.status(400).json({ error: 'periodId requis' });

  // Optional extra condition: restrict to auto-assigned slots only
  const autoOnly = statusFilter === 'auto' ? " AND statut = 'automatise'" : '';

  db.transaction(() => {
    if (type === 'astreinte') {
      db.prepare(`UPDATE slots SET cadre_id = NULL, statut = 'automatise' WHERE period_id = ? AND type = 'Astreinte'${autoOnly}`).run(periodId);
    } else if (type === 'permanence') {
      db.prepare(`UPDATE slots SET cadre_id = NULL, statut = 'automatise' WHERE period_id = ? AND type = 'Permanence'${autoOnly}`).run(periodId);
    } else {
      db.prepare(`UPDATE slots SET cadre_id = NULL, statut = 'automatise' WHERE period_id = ?${autoOnly}`).run(periodId);
    }
    resyncPeriodScoresFromSlots(periodId);
  })();

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
