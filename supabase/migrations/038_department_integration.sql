-- Migration 038: Department integration — staff, knowledge base, tickets

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department_id);

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_department ON knowledge_base(company_id, department_id);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_department ON tickets(company_id, department_id, status);
