ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skill_level smallint
  CHECK (skill_level IS NULL OR (skill_level >= 1 AND skill_level <= 5));
