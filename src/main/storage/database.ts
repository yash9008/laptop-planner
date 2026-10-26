import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FoundationStatus } from '../../shared/contracts';
import { migrate } from './migrations';

interface SettingsRow {
  day_start_minute: number;
  day_end_minute: number;
  time_zone: string;
}

export class PlannerDatabase {
  readonly connection: Database.Database;
  readonly schemaVersion: number;

  constructor(readonly path: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.connection = new Database(path);
    try {
      this.connection.pragma('busy_timeout = 5000');
      this.connection.pragma('foreign_keys = ON');
      this.connection.pragma('journal_mode = WAL');
      this.connection.pragma('synchronous = FULL');
      this.schemaVersion = migrate(this.connection);
      this.connection.prepare('INSERT OR IGNORE INTO planner_settings (id, time_zone) VALUES (1, ?)').run(timeZone);
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  getStatus(): FoundationStatus['storage'] {
    const settings = this.connection.prepare('SELECT * FROM planner_settings WHERE id = 1').get() as SettingsRow;
    const sqlite = this.connection.prepare('SELECT sqlite_version() AS version').get() as { version: string };
    return {
      databasePath: this.path,
      schemaVersion: this.schemaVersion,
      sqliteVersion: sqlite.version,
      journalMode: String(this.connection.pragma('journal_mode', { simple: true })),
      dailyHours: {
        startMinute: settings.day_start_minute,
        endMinute: settings.day_end_minute,
        timeZone: settings.time_zone,
      },
    };
  }

  close(): void {
    if (this.connection.open) this.connection.close();
  }
}
