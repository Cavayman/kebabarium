-- Sync runs keep their notes (missing keys, exhausted budgets) so the admin can see why a run did nothing.
ALTER TABLE sync_runs ADD COLUMN notes TEXT;
