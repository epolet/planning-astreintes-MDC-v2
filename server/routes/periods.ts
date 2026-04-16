import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { periodToApp } from '../db/mappers.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM planning_periods ORDER BY start_date DESC').all();
  res.json((rows as Record<string, unknown>[]).map(periodToApp));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM planning_periods WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(periodToApp(row as Record<string, unknown>));
});

router.post('/', (req, res) => {
  const { label, startDate, endDate, status, zone } = req.body;
  if (!label || !startDate || !endDate) {
    return res.status(400).json({ error: 'label, startDate et endDate sont requis' });
  }
  if (startDate >= endDate) {
    return res.status(400).json({ error: 'La date de debut doit etre anterieure a la date de fin' });
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO planning_periods (id, label, start_date, end_date, status, zone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, label, startDate, endDate, status ?? 'draft', zone ?? 'C', now, now);
  const row = db.prepare('SELECT * FROM planning_periods WHERE id = ?').get(id);
  res.status(201).json(periodToApp(row as Record<string, unknown>));
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  db.prepare('UPDATE planning_periods SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM planning_periods WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
