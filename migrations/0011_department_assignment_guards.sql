CREATE TRIGGER users_department_insert BEFORE INSERT ON users
WHEN NEW.department_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM departments WHERE id = NEW.department_id AND enabled = 1
) AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.id AND department_id IS NEW.department_id)
BEGIN SELECT RAISE(ABORT, 'DEPARTMENT_INACTIVE'); END;
CREATE TRIGGER users_department_update BEFORE UPDATE OF department_id ON users
WHEN NEW.department_id IS NOT OLD.department_id AND NEW.department_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM departments WHERE id = NEW.department_id AND enabled = 1
)
BEGIN SELECT RAISE(ABORT, 'DEPARTMENT_INACTIVE'); END;
