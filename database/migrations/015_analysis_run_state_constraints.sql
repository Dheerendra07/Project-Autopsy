DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analysis_runs_status_check'
  ) THEN
    ALTER TABLE analysis_runs
      ADD CONSTRAINT analysis_runs_status_check
      CHECK (status IN ('queued', 'running', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analysis_runs_mode_check'
  ) THEN
    ALTER TABLE analysis_runs
      ADD CONSTRAINT analysis_runs_mode_check
      CHECK (analysis_mode IN ('check', 'full', 'incremental'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analysis_runs_terminal_timestamp_check'
  ) THEN
    ALTER TABLE analysis_runs
      ADD CONSTRAINT analysis_runs_terminal_timestamp_check
      CHECK (
        (status IN ('queued', 'running') AND completed_at IS NULL)
        OR
        (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
      );
  END IF;
END $$;
