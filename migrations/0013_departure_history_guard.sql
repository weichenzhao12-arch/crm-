CREATE TRIGGER prevent_departed_account_deletion BEFORE DELETE ON users
WHEN EXISTS (SELECT 1 FROM personnel_departures WHERE user_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'OFFBOARDED_USER'); END;
