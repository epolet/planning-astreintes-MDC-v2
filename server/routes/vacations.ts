import { Router } from 'express';
import db from '../db/client.js';
import { vacationToApp } from '../db/mappers.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM vacations ORDER BY start_date').all();
  res.json((rows as Record<string, unknown>[]).map(vacationToApp));
});

router.post('/', (req, res) => {
  const { name, startDate, endDate, zone, type } = req.body;
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'name, startDate et endDate sont requis' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'La date de debut doit etre anterieure ou egale a la date de fin' });
  }

  const result = db.prepare(
    'INSERT INTO vacations (name, start_date, end_date, zone, type) VALUES (?, ?, ?, ?, ?)'
  ).run(name, startDate, endDate, zone ?? 'all', type ?? 'other');

  res.status(201).json(vacationToApp({
    id: result.lastInsertRowid, name, start_date: startDate, end_date: endDate, zone: zone ?? 'all', type: type ?? 'other',
  }));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM vacations WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
