import { Router } from 'express';
import db from '../db/client.js';

const router = Router();

// GET /api/wishes?periodId=xxx  → { slotId: string; cadreIds: string[] }[]
router.get('/', (req, res) => {
  const { periodId, slotId } = req.query;

  if (slotId) {
    const rows = db.prepare('SELECT cadre_id FROM wishes WHERE slot_id = ?').all(slotId as string) as { cadre_id: string }[];
    return res.json(rows.map(r => r.cadre_id));
  }

  if (periodId) {
    // Return all wishes for all slots of the period
    const rows = db.prepare(`
      SELECT w.slot_id, w.cadre_id
      FROM wishes w
      JOIN slots s ON w.slot_id = s.id
      WHERE s.period_id = ?
    `).all(periodId as string) as { slot_id: string; cadre_id: string }[];

    // Group by slot_id
    const grouped = new Map<string, string[]>();
    for (const r of rows) {
      const arr = grouped.get(r.slot_id) ?? [];
      arr.push(r.cadre_id);
      grouped.set(r.slot_id, arr);
    }
    return res.json(Object.fromEntries(grouped));
  }

  return res.status(400).json({ error: 'periodId ou slotId requis' });
});

// POST /api/wishes/set  — replace all wishes for a slot
// body: { slotId: string; cadreIds: string[] }
router.post('/set', (req, res) => {
  const { slotId, cadreIds } = req.body as { slotId: string; cadreIds: string[] };
  if (!slotId) return res.status(400).json({ error: 'slotId requis' });

  const del = db.prepare('DELETE FROM wishes WHERE slot_id = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO wishes (cadre_id, slot_id) VALUES (?, ?)');

  db.transaction(() => {
    del.run(slotId);
    for (const cadreId of (cadreIds ?? [])) {
      ins.run(cadreId, slotId);
    }
  })();

  res.json({ ok: true });
});

// DELETE /api/wishes?periodId=xxx  — clear all wishes for a period
router.delete('/', (req, res) => {
  const { periodId, slotId } = req.query;

  if (slotId) {
    db.prepare('DELETE FROM wishes WHERE slot_id = ?').run(slotId as string);
    return res.json({ ok: true });
  }

  if (periodId) {
    db.prepare(`
      DELETE FROM wishes WHERE slot_id IN (
        SELECT id FROM slots WHERE period_id = ?
      )
    `).run(periodId as string);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'periodId ou slotId requis' });
});

export default router;
