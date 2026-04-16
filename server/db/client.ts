import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '../../data/planning.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS cadres (
    id                   TEXT PRIMARY KEY,
    nom                  TEXT NOT NULL,
    prenom               TEXT NOT NULL DEFAULT '',
    role                 TEXT NOT NULL CHECK(role IN ('Astreinte','Permanence','Both')),
    distance_moins_30min INTEGER NOT NULL DEFAULT 0,
    astreinte_d1         INTEGER NOT NULL DEFAULT 0,
    astreinte_d2         INTEGER NOT NULL DEFAULT 0,
    astreinte_d3         INTEGER NOT NULL DEFAULT 0,
    astreinte_d4         INTEGER NOT NULL DEFAULT 0,
    astreinte_d5         INTEGER NOT NULL DEFAULT 0,
    permanence_d1        INTEGER NOT NULL DEFAULT 0,
    permanence_d2        INTEGER NOT NULL DEFAULT 0,
    permanence_d3        INTEGER NOT NULL DEFAULT 0,
    permanence_d4        INTEGER NOT NULL DEFAULT 0,
    permanence_d5        INTEGER NOT NULL DEFAULT 0,
    actif                INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS planning_periods (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
    zone       TEXT NOT NULL DEFAULT 'C' CHECK(zone IN ('A','B','C')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS slots (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK(type IN ('Astreinte','Permanence')),
    difficulte INTEGER NOT NULL DEFAULT 1 CHECK(difficulte IN (1,2,3,4,5)),
    cadre_id   TEXT REFERENCES cadres(id) ON DELETE SET NULL,
    statut     TEXT NOT NULL DEFAULT 'automatise' CHECK(statut IN ('automatise','manuel')),
    label      TEXT,
    period_id  TEXT REFERENCES planning_periods(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS period_scores (
    id               TEXT PRIMARY KEY,
    cadre_id         TEXT NOT NULL REFERENCES cadres(id) ON DELETE CASCADE,
    period_id        TEXT NOT NULL REFERENCES planning_periods(id) ON DELETE CASCADE,
    astreinte_d1     INTEGER NOT NULL DEFAULT 0,
    astreinte_d2     INTEGER NOT NULL DEFAULT 0,
    astreinte_d3     INTEGER NOT NULL DEFAULT 0,
    astreinte_d4     INTEGER NOT NULL DEFAULT 0,
    astreinte_d5     INTEGER NOT NULL DEFAULT 0,
    permanence_d1    INTEGER NOT NULL DEFAULT 0,
    permanence_d2    INTEGER NOT NULL DEFAULT 0,
    permanence_d3    INTEGER NOT NULL DEFAULT 0,
    permanence_d4    INTEGER NOT NULL DEFAULT 0,
    permanence_d5    INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(cadre_id, period_id)
  );

  CREATE TABLE IF NOT EXISTS vacations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    zone       TEXT NOT NULL,
    type       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS closed_days (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    date   TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS app_config (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    key   TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wishes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    cadre_id  TEXT NOT NULL REFERENCES cadres(id) ON DELETE CASCADE,
    slot_id   TEXT NOT NULL REFERENCES slots(id)  ON DELETE CASCADE,
    UNIQUE(cadre_id, slot_id)
  );

  CREATE INDEX IF NOT EXISTS idx_slots_period_id ON slots(period_id);
  CREATE INDEX IF NOT EXISTS idx_slots_date      ON slots(date);
  CREATE INDEX IF NOT EXISTS idx_ps_cadre_id     ON period_scores(cadre_id);
  CREATE INDEX IF NOT EXISTS idx_ps_period_id    ON period_scores(period_id);
  CREATE INDEX IF NOT EXISTS idx_pp_status       ON planning_periods(status);
  CREATE INDEX IF NOT EXISTS idx_vac_zone        ON vacations(zone);
  CREATE INDEX IF NOT EXISTS idx_wishes_slot_id  ON wishes(slot_id);
  CREATE INDEX IF NOT EXISTS idx_wishes_cadre_id ON wishes(cadre_id);
`);

// ─── Schema migrations ────────────────────────────────────────────────────────
const cadresCols = (db.prepare('PRAGMA table_info(cadres)').all() as { name: string }[]).map(c => c.name);

if (!cadresCols.includes('prenom')) {
  db.exec(`ALTER TABLE cadres ADD COLUMN prenom TEXT NOT NULL DEFAULT '';`);
}
if (!cadresCols.includes('astreinte_d1')) {
  db.exec(`
    ALTER TABLE cadres ADD COLUMN astreinte_d1 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN astreinte_d2 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN astreinte_d3 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN astreinte_d4 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN permanence_d1 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN permanence_d2 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN permanence_d3 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN permanence_d4 INTEGER NOT NULL DEFAULT 0;
  `);
}
// D5 (Noël) counters
if (!cadresCols.includes('astreinte_d5')) {
  db.exec(`
    ALTER TABLE cadres ADD COLUMN astreinte_d5 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cadres ADD COLUMN permanence_d5 INTEGER NOT NULL DEFAULT 0;
  `);
}

const psCols = (db.prepare('PRAGMA table_info(period_scores)').all() as { name: string }[]).map(c => c.name);
if (!psCols.includes('astreinte_d1')) {
  db.exec(`
    ALTER TABLE period_scores ADD COLUMN astreinte_d1 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN astreinte_d2 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN astreinte_d3 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN astreinte_d4 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN permanence_d1 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN permanence_d2 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN permanence_d3 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN permanence_d4 INTEGER NOT NULL DEFAULT 0;
  `);
}
if (!psCols.includes('astreinte_d5')) {
  db.exec(`
    ALTER TABLE period_scores ADD COLUMN astreinte_d5 INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE period_scores ADD COLUMN permanence_d5 INTEGER NOT NULL DEFAULT 0;
  `);
}

// ─── Migrate slots table to allow difficulte = 5 (Noël) ──────────────────────
// SQLite CHECK constraints can't be altered, so we rebuild the table if needed.
const slotsCols = (db.prepare('PRAGMA table_info(slots)').all() as { name: string; type: string }[]);
const slotsCheckRow = (db.prepare(
  `SELECT sql FROM sqlite_master WHERE type='table' AND name='slots'`
).get() as { sql: string } | undefined);

if (slotsCheckRow && slotsCheckRow.sql.includes('(1,2,3,4)') && !slotsCheckRow.sql.includes('(1,2,3,4,5)')) {
  // Rebuild slots with the extended CHECK constraint
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE slots_v2 (
      id         TEXT PRIMARY KEY,
      date       TEXT NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('Astreinte','Permanence')),
      difficulte INTEGER NOT NULL DEFAULT 1 CHECK(difficulte IN (1,2,3,4,5)),
      cadre_id   TEXT REFERENCES cadres(id) ON DELETE SET NULL,
      statut     TEXT NOT NULL DEFAULT 'automatise' CHECK(statut IN ('automatise','manuel')),
      label      TEXT,
      period_id  TEXT REFERENCES planning_periods(id) ON DELETE CASCADE
    );
    INSERT INTO slots_v2 SELECT * FROM slots;
    DROP TABLE slots;
    ALTER TABLE slots_v2 RENAME TO slots;
    CREATE INDEX IF NOT EXISTS idx_slots_period_id ON slots(period_id);
    CREATE INDEX IF NOT EXISTS idx_slots_date      ON slots(date);
  `);
  db.pragma('foreign_keys = ON');
}

// Suppress unused warning
void slotsCols;

export default db;
