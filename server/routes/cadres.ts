import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { cadreToApp, cadreRoleToDb } from '../db/mappers.js';

const router = Router();

// POST /reset-scores must be before /:id to avoid routing conflict
router.post('/reset-scores', (_req, res) => {
  db.prepare(`UPDATE cadres SET
    astreinte_d1 = 0, astreinte_d2 = 0, astreinte_d3 = 0, astreinte_d4 = 0, astreinte_d5 = 0,
    permanence_d1 = 0, permanence_d2 = 0, permanence_d3 = 0, permanence_d4 = 0, permanence_d5 = 0
  `).run();
  res.json({ ok: true });
});

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM cadres ORDER BY nom').all();
  res.json(rows.map(r => cadreToApp(r as Record<string, unknown>)));
});

router.get('/:id/slot-count', (req, res) => {
  const result = db.prepare('SELECT COUNT(*) as count FROM slots WHERE cadre_id = ?').get(req.params.id) as { count: number };
  res.json({ count: result.count });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cadres WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(cadreToApp(row as Record<string, unknown>));
});

router.post('/', (req, res) => {
  const { name, prenom, role, nearMuseum, active } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name et role sont requis' });

  const id = randomUUID();
  db.prepare(`
    INSERT INTO cadres (id, nom, prenom, role, distance_moins_30min, actif)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id, name, prenom ?? '', cadreRoleToDb[role] ?? role,
    nearMuseum ? 1 : 0,
    active !== false ? 1 : 0,
  );
  const row = db.prepare('SELECT * FROM cadres WHERE id = ?').get(id);
  res.status(201).json(cadreToApp(row as Record<string, unknown>));
});

router.patch('/:id', (req, res) => {
  const {
    name, prenom, role, nearMuseum, active,
    astreinteD1, astreinteD2, astreinteD3, astreinteD4, astreinteD5,
    permanenceD1, permanenceD2, permanenceD3, permanenceD4, permanenceD5,
  } = req.body;
  const sets: string[] = [];
  const params: unknown[] = [];

  if (name !== undefined)           { sets.push('nom = ?');                   params.push(name); }
  if (prenom !== undefined)         { sets.push('prenom = ?');                params.push(prenom); }
  if (role !== undefined)           { sets.push('role = ?');                  params.push(cadreRoleToDb[role] ?? role); }
  if (nearMuseum !== undefined)     { sets.push('distance_moins_30min = ?');  params.push(nearMuseum ? 1 : 0); }
  if (astreinteD1 !== undefined)   { sets.push('astreinte_d1 = ?');          params.push(astreinteD1); }
  if (astreinteD2 !== undefined)   { sets.push('astreinte_d2 = ?');          params.push(astreinteD2); }
  if (astreinteD3 !== undefined)   { sets.push('astreinte_d3 = ?');          params.push(astreinteD3); }
  if (astreinteD4 !== undefined)   { sets.push('astreinte_d4 = ?');          params.push(astreinteD4); }
  if (astreinteD5 !== undefined)   { sets.push('astreinte_d5 = ?');          params.push(astreinteD5); }
  if (permanenceD1 !== undefined)  { sets.push('permanence_d1 = ?');         params.push(permanenceD1); }
  if (permanenceD2 !== undefined)  { sets.push('permanence_d2 = ?');         params.push(permanenceD2); }
  if (permanenceD3 !== undefined)  { sets.push('permanence_d3 = ?');         params.push(permanenceD3); }
  if (permanenceD4 !== undefined)  { sets.push('permanence_d4 = ?');         params.push(permanenceD4); }
  if (permanenceD5 !== undefined)  { sets.push('permanence_d5 = ?');         params.push(permanenceD5); }
  if (active !== undefined)        { sets.push('actif = ?');                  params.push(active ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE cadres SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cadres WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
