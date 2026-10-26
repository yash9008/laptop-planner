import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'foundation-settings',
    sql: `
      CREATE TABLE planner_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        day_start_minute INTEGER NOT NULL DEFAULT 360
          CHECK (day_start_minute >= 0 AND day_start_minute < 1440),
        day_end_minute INTEGER NOT NULL DEFAULT 1320
          CHECK (day_end_minute > day_start_minute AND day_end_minute <= 1440),
        time_zone TEXT NOT NULL CHECK (length(time_zone) > 0)
      );
    `,
  },
  {
    version: 2,
    name: 'daily-tasks-and-calendar-blocks',
    sql: `
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
        notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
        planned_date TEXT NOT NULL CHECK (length(planned_date) = 10),
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0 AND planned_minutes <= 9007199254740991),
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX tasks_by_day ON tasks (planned_date, deleted_at, position, id);
      CREATE TABLE calendar_blocks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        start_minute REAL NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
        end_minute REAL NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
        kind TEXT NOT NULL CHECK (kind IN ('scheduled', 'completed'))
      );
      CREATE INDEX calendar_blocks_by_day ON calendar_blocks (date, kind, start_minute);
    `,
  },
  {
    version: 3,
    name: 'fixed-events-projects-and-backlog',
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
        color TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
        deadline TEXT CHECK (deadline IS NULL OR length(deadline) = 10),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE tasks_v3 (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
        notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
        planned_date TEXT CHECK (planned_date IS NULL OR length(planned_date) = 10),
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0 AND planned_minutes <= 9007199254740991),
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        deleted_at TEXT,
        project_id TEXT REFERENCES projects(id),
        deadline TEXT CHECK (deadline IS NULL OR length(deadline) = 10)
      );
      INSERT INTO tasks_v3 (id,title,notes,planned_date,planned_minutes,completed,position,created_at,updated_at,completed_at,deleted_at)
        SELECT id,title,notes,planned_date,planned_minutes,completed,position,created_at,updated_at,completed_at,deleted_at FROM tasks;
      CREATE TABLE calendar_blocks_v3 (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks_v3(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        start_minute REAL NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
        end_minute REAL NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
        kind TEXT NOT NULL CHECK (kind IN ('scheduled', 'completed'))
      );
      INSERT INTO calendar_blocks_v3 SELECT * FROM calendar_blocks;
      DROP TABLE calendar_blocks;
      DROP TABLE tasks;
      ALTER TABLE tasks_v3 RENAME TO tasks;
      ALTER TABLE calendar_blocks_v3 RENAME TO calendar_blocks;
      CREATE INDEX tasks_by_day ON tasks (planned_date, deleted_at, position, id);
      CREATE INDEX tasks_by_project ON tasks (project_id, deleted_at, position);
      CREATE INDEX calendar_blocks_by_day ON calendar_blocks (date, kind, start_minute);
      CREATE TABLE fixed_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
        notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
        start_date TEXT NOT NULL,
        start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
        end_date TEXT NOT NULL,
        end_minute INTEGER NOT NULL CHECK (end_minute >= 0 AND end_minute < 1440),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        CHECK (end_date > start_date OR (end_date = start_date AND end_minute > start_minute))
      );
      CREATE INDEX fixed_events_by_date ON fixed_events (start_date, end_date, deleted_at);
    `,
  },
  {
    version: 4,
    name: 'recurring-occurrences-and-focus-sessions',
    sql: `
      CREATE TABLE recurring_templates (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL,
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
        project_id TEXT REFERENCES projects(id),
        weekdays TEXT NOT NULL, start_date TEXT NOT NULL, stopped_on TEXT,
        created_at TEXT NOT NULL
      );
      ALTER TABLE tasks ADD COLUMN recurrence_id TEXT REFERENCES recurring_templates(id);
      ALTER TABLE tasks ADD COLUMN occurrence_date TEXT;
      CREATE UNIQUE INDEX unique_occurrence ON tasks (recurrence_id, occurrence_date)
        WHERE recurrence_id IS NOT NULL;
      CREATE TABLE focus_sessions (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
        started_at INTEGER NOT NULL, checkpoint_at INTEGER NOT NULL,
        ended_at INTEGER, reason TEXT,
        CHECK (checkpoint_at >= started_at),
        CHECK (ended_at IS NULL OR ended_at >= started_at)
      );
      CREATE UNIQUE INDEX one_running_timer ON focus_sessions ((1)) WHERE ended_at IS NULL;
      CREATE INDEX focus_by_task ON focus_sessions (task_id, started_at);
      CREATE TABLE focus_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        task_id TEXT REFERENCES tasks(id), reason TEXT
      );
      INSERT INTO focus_state (id) VALUES (1);
    `,
  },
];

function checksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

/** Each migration batch, including the ledger, commits atomically. */
export function migrate(database: Database.Database, steps: readonly Migration[] = migrations): number {
  for (const [index, step] of steps.entries()) {
    if (step.version !== index + 1 || !step.name.trim() || !step.sql.trim()) {
      throw new Error('Migrations must have consecutive versions and non-empty names and SQL.');
    }
  }

  return database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    const applied = database.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
      .all() as AppliedMigration[];

    for (const [index, record] of applied.entries()) {
      const step = steps[index];
      if (!step) throw new Error('This database was created by a newer version of Laptop Planner.');
      if (record.version !== step.version || record.name !== step.name || record.checksum !== checksum(step)) {
        throw new Error('The database migration history does not match this application.');
      }
    }

    const recordMigration = database.prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)');
    for (const step of steps.slice(applied.length)) {
      database.exec(step.sql);
      recordMigration.run(step.version, step.name, checksum(step));
    }
    return steps.at(-1)?.version ?? 0;
  }).immediate();
}
