import { Router } from 'express';
import db from '../db/client.js';
import { closedDayToApp } from '../db/mappers.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM closed_days ORDER BY date').all();
  res.json((rows as Record<string, unknown>[]).map(closedDayToApp));
});

router.post('/', (req, res) => {
  const { date, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'date est requise' });

  const result = db.prepare('INSERT INTO closed_days (date, reason) VALUES (?, ?)').run(date, reason ?? '');
  res.status(201).json(closedDayToApp({ id: result.lastInsertRowid, date, reason: reason ?? '' }));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM closed_days WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
