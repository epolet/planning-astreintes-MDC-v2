import { Router } from 'express';
import db from '../db/client.js';

const router = Router();

const DEFAULT_VACATIONS = [
  { name: 'Vacances de Noel 2025-2026',       type: 'noel',      zone: 'all', startDate: '2025-12-20', endDate: '2026-01-05' },
  { name: "Vacances d'Hiver 2026 (Zone A)",   type: 'hiver',     zone: 'A',   startDate: '2026-02-14', endDate: '2026-03-02' },
  { name: "Vacances d'Hiver 2026 (Zone B)",   type: 'hiver',     zone: 'B',   startDate: '2026-02-07', endDate: '2026-02-23' },
  { name: "Vacances d'Hiver 2026 (Zone C)",   type: 'hiver',     zone: 'C',   startDate: '2026-02-21', endDate: '2026-03-09' },
  { name: 'Vacances de Printemps 2026 (Zone A)', type: 'printemps', zone: 'A', startDate: '2026-04-11', endDate: '2026-04-27' },
  { name: 'Vacances de Printemps 2026 (Zone B)', type: 'printemps', zone: 'B', startDate: '2026-04-04', endDate: '2026-04-20' },
  { name: 'Vacances de Printemps 2026 (Zone C)', type: 'printemps', zone: 'C', startDate: '2026-04-18', endDate: '2026-05-04' },
  { name: "Vacances d'Ete 2026",              type: 'ete',       zone: 'all', startDate: '2026-07-04', endDate: '2026-09-01' },
  { name: 'Vacances de Toussaint 2026',       type: 'toussaint', zone: 'all', startDate: '2026-10-17', endDate: '2026-11-02' },
  { name: 'Vacances de Noel 2026-2027',       type: 'noel',      zone: 'all', startDate: '2026-12-19', endDate: '2027-01-04' },
];

// POST /init — seeds defaults if not already initialized
router.post('/init', (_req, res) => {
  const existing = db.prepare("SELECT id FROM app_config WHERE key = 'initialized'").get();
  if (existing) return res.json({ ok: true, seeded: false });

  const insertConfig = db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)');
  const insertVacation = db.prepare(
    'INSERT INTO vacations (name, start_date, end_date, zone, type) VALUES (?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    insertConfig.run('initialized', 'true');
    insertConfig.run('zone', 'C');
    for (const v of DEFAULT_VACATIONS) {
      insertVacation.run(v.name, v.startDate, v.endDate, v.zone, v.type);
    }
  })();

  res.json({ ok: true, seeded: true });
});

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM app_config').all();
  res.json(rows);
});

router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT * FROM app_config WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  db.prepare(`
    INSERT INTO app_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(req.params.key, value);
  res.json({ ok: true });
});

export default router;
