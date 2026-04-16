/*
  # Add Planning Periods and Period Scores

  1. New Tables
    - `planning_periods`
      - `id` (uuid, primary key)
      - `label` (text) - human-readable label like "Janvier - Juin 2026"
      - `start_date` (date) - first day of the semester
      - `end_date` (date) - last day of the semester
      - `status` (text) - 'draft' or 'published'
      - `zone` (text) - school holiday zone (A, B, C)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `period_scores`
      - `id` (uuid, primary key)
      - `cadre_id` (uuid, FK to cadres)
      - `period_id` (uuid, FK to planning_periods)
      - `score_astreinte` (integer) - accumulated astreinte difficulty for this period
      - `score_permanence` (integer) - accumulated permanence difficulty for this period
      - unique constraint on (cadre_id, period_id)

  2. Modified Tables
    - `slots`
      - Add `period_id` (uuid, FK to planning_periods, nullable for migration)
      - Add `label` (text, nullable) - human-readable slot label

  3. Security
    - Enable RLS on `planning_periods` and `period_scores`
    - Add public CRUD policies (app uses hardcoded auth, no Supabase auth)

  4. Notes
    - period_id on slots is nullable to not break existing data
    - period_scores has a unique constraint on (cadre_id, period_id) to ensure one score record per cadre per period
*/

-- Create planning_periods table
CREATE TABLE IF NOT EXISTS planning_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  zone text NOT NULL DEFAULT 'C',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT planning_periods_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT planning_periods_zone_check CHECK (zone IN ('A', 'B', 'C'))
);

ALTER TABLE planning_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read planning_periods"
  ON planning_periods FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public can insert planning_periods"
  ON planning_periods FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Public can update planning_periods"
  ON planning_periods FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete planning_periods"
  ON planning_periods FOR DELETE
  TO anon
  USING (true);

-- Create period_scores table
CREATE TABLE IF NOT EXISTS period_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadre_id uuid NOT NULL REFERENCES cadres(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES planning_periods(id) ON DELETE CASCADE,
  score_astreinte integer NOT NULL DEFAULT 0,
  score_permanence integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT period_scores_unique UNIQUE (cadre_id, period_id)
);

ALTER TABLE period_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read period_scores"
  ON period_scores FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public can insert period_scores"
  ON period_scores FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Public can update period_scores"
  ON period_scores FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete period_scores"
  ON period_scores FOR DELETE
  TO anon
  USING (true);

-- Add period_id and label to slots table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'slots' AND column_name = 'period_id'
  ) THEN
    ALTER TABLE slots ADD COLUMN period_id uuid REFERENCES planning_periods(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'slots' AND column_name = 'label'
  ) THEN
    ALTER TABLE slots ADD COLUMN label text;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_slots_period_id ON slots(period_id);
CREATE INDEX IF NOT EXISTS idx_slots_date ON slots(date);
CREATE INDEX IF NOT EXISTS idx_period_scores_cadre_id ON period_scores(cadre_id);
CREATE INDEX IF NOT EXISTS idx_period_scores_period_id ON period_scores(period_id);
CREATE INDEX IF NOT EXISTS idx_planning_periods_status ON planning_periods(status);
