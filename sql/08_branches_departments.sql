-- ============================================================
-- 08 · Branches, Departments & Branch-Departments
-- ============================================================

-- ── 1. branches ──
CREATE TABLE IF NOT EXISTS branches (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_id    BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  state_id      BIGINT REFERENCES states(id)    ON DELETE SET NULL,
  city_id       BIGINT REFERENCES cities(id)    ON DELETE SET NULL,
  branch_manager_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

  name          CITEXT NOT NULL,
  code          CITEXT NOT NULL UNIQUE,
  branch_type   TEXT NOT NULL DEFAULT 'office'
                CHECK (branch_type IN ('headquarters','office','campus','remote','warehouse','other')),

  address_line_1 TEXT,
  address_line_2 TEXT,
  pincode        TEXT,
  phone          TEXT,
  email          CITEXT,
  website        TEXT,
  google_maps_url TEXT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_country   ON branches(country_id);
CREATE INDEX IF NOT EXISTS idx_branches_state     ON branches(state_id);
CREATE INDEX IF NOT EXISTS idx_branches_city      ON branches(city_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager   ON branches(branch_manager_id);
CREATE INDEX IF NOT EXISTS idx_branches_type      ON branches(branch_type);
CREATE INDEX IF NOT EXISTS idx_branches_active    ON branches(is_active);

CREATE OR REPLACE TRIGGER set_branches_updated
  BEFORE UPDATE ON branches FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── 2. departments ──
CREATE TABLE IF NOT EXISTS departments (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  head_user_id         BIGINT REFERENCES users(id)       ON DELETE SET NULL,

  name          CITEXT NOT NULL UNIQUE,
  code          CITEXT NOT NULL UNIQUE,
  description   TEXT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_parent  ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_head    ON departments(head_user_id);
CREATE INDEX IF NOT EXISTS idx_departments_active  ON departments(is_active);

CREATE OR REPLACE TRIGGER set_departments_updated
  BEFORE UPDATE ON departments FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── 3. branch_departments ──
CREATE TABLE IF NOT EXISTS branch_departments (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id          BIGINT NOT NULL REFERENCES branches(id)    ON DELETE CASCADE,
  department_id      BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  local_head_user_id BIGINT REFERENCES users(id)                ON DELETE SET NULL,

  employee_capacity  INT,
  floor_or_wing      TEXT,
  extension_number   TEXT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (branch_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_depts_branch     ON branch_departments(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_depts_department  ON branch_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_branch_depts_head        ON branch_departments(local_head_user_id);
CREATE INDEX IF NOT EXISTS idx_branch_depts_active      ON branch_departments(is_active);

CREATE OR REPLACE TRIGGER set_branch_departments_updated
  BEFORE UPDATE ON branch_departments FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── 4. Permissions (6 per resource × 3 resources = 18) ──
INSERT INTO permissions (resource, action, display_name, description) VALUES
  ('branch','create','Create Branch','Create new branches'),
  ('branch','read','Read Branch','View branch details'),
  ('branch','update','Update Branch','Edit branch information'),
  ('branch','delete','Delete Branch','Remove branches'),
  ('branch','activate','Activate Branch','Toggle branch active status'),
  ('branch','deactivate','Deactivate Branch','Deactivate branches'),

  ('department','create','Create Department','Create new departments'),
  ('department','read','Read Department','View department details'),
  ('department','update','Update Department','Edit department information'),
  ('department','delete','Delete Department','Remove departments'),
  ('department','activate','Activate Department','Toggle department active status'),
  ('department','deactivate','Deactivate Department','Deactivate departments'),

  ('branch_department','create','Create Branch Department','Assign department to branch'),
  ('branch_department','read','Read Branch Department','View branch-department details'),
  ('branch_department','update','Update Branch Department','Edit branch-department assignment'),
  ('branch_department','delete','Delete Branch Department','Remove branch-department assignment'),
  ('branch_department','activate','Activate Branch Department','Toggle branch-department active status'),
  ('branch_department','deactivate','Deactivate Branch Department','Deactivate branch-department assignments')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 5. Enable RLS ──
ALTER TABLE branches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read branches"           ON branches           FOR SELECT USING (true);
CREATE POLICY "Public read departments"        ON departments        FOR SELECT USING (true);
CREATE POLICY "Public read branch_departments" ON branch_departments FOR SELECT USING (true);
