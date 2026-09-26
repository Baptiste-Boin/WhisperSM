use anyhow::{anyhow, Result};
use chrono::{DateTime, Local, Utc};
use log::{debug, error, info};
use rusqlite::{params, Connection, OptionalExtension};
use rusqlite_migration::{Migrations, M};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_specta::Event;

/// Database migrations for transcription history.
/// Each migration is applied in order. The library tracks which migrations
/// have been applied using SQLite's user_version pragma.
///
/// Note: For users upgrading from tauri-plugin-sql, migrate_from_tauri_plugin_sql()
/// converts the old _sqlx_migrations table tracking to the user_version pragma,
/// ensuring migrations don't re-run on existing databases.
static MIGRATIONS: &[M] = &[
    M::up(
        "CREATE TABLE IF NOT EXISTS transcription_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            saved BOOLEAN NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            transcription_text TEXT NOT NULL
        );",
    ),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_processed_text TEXT;"),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_process_prompt TEXT;"),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_process_requested BOOLEAN NOT NULL DEFAULT 0;"),
    M::up(
        "CREATE INDEX IF NOT EXISTS idx_history_saved_timestamp ON transcription_history(saved, timestamp);
         CREATE INDEX IF NOT EXISTS idx_history_timestamp ON transcription_history(timestamp);",
    ),
    M::up("ALTER TABLE transcription_history ADD COLUMN app_name TEXT;"),
    M::up("ALTER TABLE transcription_history ADD COLUMN duration_ms INTEGER;"),
];

/// Columns selected for every `HistoryEntry` query, in the order
/// `map_history_entry` expects.
const ENTRY_COLUMNS: &str = "id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt, post_process_requested, app_name, duration_ms";

/// Typing speed used to estimate how much time dictation saved compared to
/// typing the same words (words per minute).
const TYPING_WPM: f64 = 40.0;

/// Aggregate numbers shown on the Home screen.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct HistoryStats {
    pub total_entries: i64,
    pub total_words: i64,
    pub entries_today: i64,
    pub words_today: i64,
    pub post_processed_entries: i64,
    pub last_timestamp: Option<i64>,
    /// Total recorded speech, in milliseconds (entries with a known duration).
    pub total_duration_ms: i64,
    /// Number of distinct applications text was dictated into.
    pub apps_used: i64,
    /// Average dictation speed in words per minute (0 when unknown).
    pub average_wpm: f64,
    /// Estimated time saved compared to typing at 40 WPM, in milliseconds.
    pub time_saved_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct PaginatedHistory {
    pub entries: Vec<HistoryEntry>,
    pub has_more: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type, tauri_specta::Event)]
#[serde(tag = "action")]
pub enum HistoryUpdatePayload {
    #[serde(rename = "added")]
    Added { entry: HistoryEntry },
    #[serde(rename = "updated")]
    Updated { entry: HistoryEntry },
    #[serde(rename = "deleted")]
    Deleted { id: i64 },
    #[serde(rename = "toggled")]
    Toggled { id: i64 },
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct HistoryEntry {
    pub id: i64,
    pub file_name: String,
    pub timestamp: i64,
    pub saved: bool,
    pub title: String,
    pub transcription_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
    pub post_process_requested: bool,
    /// Application that was frontmost when the dictation started.
    pub app_name: Option<String>,
    /// Length of the recorded (speech-only) audio, in milliseconds.
    pub duration_ms: Option<i64>,
}

pub struct HistoryManager {
    app_handle: AppHandle,
    recordings_dir: PathBuf,
    db_path: PathBuf,
}

impl HistoryManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        // Recordings live in Documents/WhisperSM/recordings; the database
        // stays in the application-support folder.
        let app_data_dir = crate::portable::app_data_dir(app_handle)?;
        let recordings_dir = crate::storage::recordings_dir(app_handle);
        let legacy_recordings_dir = app_data_dir.join("recordings");
        let db_path = app_data_dir.join("history.db");

        // Ensure recordings directory exists
        if !recordings_dir.exists() {
            fs::create_dir_all(&recordings_dir)?;
            debug!("Created recordings directory: {:?}", recordings_dir);
        }

        let manager = Self {
            app_handle: app_handle.clone(),
            recordings_dir,
            db_path,
        };

        // Initialize database and run migrations synchronously
        manager.init_database()?;

        if legacy_recordings_dir != manager.recordings_dir {
            if let Err(e) = manager.migrate_legacy_recordings(&legacy_recordings_dir) {
                error!("Failed to move legacy recordings: {}", e);
            }
        }

        Ok(manager)
    }

    /// Move `recordings/whispersm-<ts>.wav` files from the old location into
    /// `recordings/<ts>/output.wav` (with a `meta.json`) and update the
    /// database paths.
    fn migrate_legacy_recordings(&self, legacy_dir: &std::path::Path) -> Result<()> {
        if !legacy_dir.is_dir() {
            return Ok(());
        }
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM transcription_history WHERE file_name NOT LIKE '%/%'",
            ENTRY_COLUMNS
        ))?;
        let entries = stmt
            .query_map([], Self::map_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);

        let mut moved = 0;
        for entry in entries {
            let old_path = legacy_dir.join(&entry.file_name);
            if !old_path.is_file() {
                continue;
            }
            let (file_name, new_path) =
                crate::storage::allocate_recording(&self.recordings_dir, entry.timestamp);
            if let Err(e) = fs::rename(&old_path, &new_path).or_else(|_| {
                fs::copy(&old_path, &new_path).and_then(|_| fs::remove_file(&old_path))
            }) {
                error!("Failed to move {}: {}", old_path.display(), e);
                let _ = crate::storage::remove_recording(&self.recordings_dir, &file_name);
                continue;
            }
            conn.execute(
                "UPDATE transcription_history SET file_name = ?1 WHERE id = ?2",
                params![&file_name, entry.id],
            )?;
            let meta = self.basic_meta(&entry);
            crate::storage::write_recording_meta(&self.recordings_dir, &file_name, &meta);
            moved += 1;
        }
        // Remove the old folder when nothing is left in it.
        let _ = fs::remove_dir(legacy_dir);
        if moved > 0 {
            info!(
                "Moved {} recordings to {}",
                moved,
                self.recordings_dir.display()
            );
        }
        Ok(())
    }

    /// Minimal `meta.json` for an entry, built from the history row only.
    fn basic_meta(&self, entry: &HistoryEntry) -> crate::storage::RecordingMeta {
        let datetime = DateTime::from_timestamp(entry.timestamp, 0)
            .map(|utc| {
                utc.with_timezone(&Local)
                    .format("%Y-%m-%dT%H:%M:%S")
                    .to_string()
            })
            .unwrap_or_default();
        crate::storage::RecordingMeta {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            result: entry
                .post_processed_text
                .clone()
                .unwrap_or_else(|| entry.transcription_text.clone()),
            raw_result: entry.transcription_text.clone(),
            prompt: entry.post_process_prompt.clone().unwrap_or_default(),
            duration: entry.duration_ms.unwrap_or(0),
            datetime,
            application_context_enabled: entry.app_name.is_some(),
            prompt_context: crate::storage::PromptContext {
                application_context: crate::storage::ApplicationContext {
                    nouns: Vec::new(),
                    name: entry.app_name.clone().unwrap_or_default(),
                },
                ..Default::default()
            },
            ..Default::default()
        }
    }

    /// Create the folder for a new recording. Returns the path stored in
    /// history (relative to the recordings folder) and the absolute WAV path.
    pub fn allocate_recording(&self) -> (String, PathBuf) {
        crate::storage::allocate_recording(&self.recordings_dir, Utc::now().timestamp())
    }

    /// Write the recording's `meta.json`.
    pub fn write_meta(&self, file_name: &str, meta: &crate::storage::RecordingMeta) {
        crate::storage::write_recording_meta(&self.recordings_dir, file_name, meta);
    }

    /// Refresh the text fields of the recording's `meta.json`.
    pub fn update_meta_text(
        &self,
        file_name: &str,
        raw_result: &str,
        result: &str,
        prompt: Option<&str>,
    ) {
        crate::storage::update_recording_meta_text(
            &self.recordings_dir,
            file_name,
            raw_result,
            result,
            prompt,
        );
    }

    fn init_database(&self) -> Result<()> {
        info!("Initializing database at {:?}", self.db_path);

        let mut conn = Connection::open(&self.db_path)?;

        // Handle migration from tauri-plugin-sql to rusqlite_migration
        // tauri-plugin-sql used _sqlx_migrations table, rusqlite_migration uses user_version pragma
        self.migrate_from_tauri_plugin_sql(&conn)?;

        // Create migrations object and run to latest version
        let migrations = Migrations::new(MIGRATIONS.to_vec());

        // Validate migrations in debug builds
        #[cfg(debug_assertions)]
        migrations.validate().expect("Invalid migrations");

        // Get current version before migration
        let version_before: i32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        debug!("Database version before migration: {}", version_before);

        // Apply any pending migrations
        migrations.to_latest(&mut conn)?;

        // WAL avoids writers blocking readers and cuts fsync cost on the
        // transcription hot path. The mode is persistent, set it once here.
        let _mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;

        // Get version after migration
        let version_after: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        if version_after > version_before {
            info!(
                "Database migrated from version {} to {}",
                version_before, version_after
            );
        } else {
            debug!("Database already at latest version {}", version_after);
        }

        Ok(())
    }

    /// Migrate from tauri-plugin-sql's migration tracking to rusqlite_migration's.
    /// tauri-plugin-sql used a _sqlx_migrations table, while rusqlite_migration uses
    /// SQLite's user_version pragma. This function checks if the old system was in use
    /// and sets the user_version accordingly so migrations don't re-run.
    fn migrate_from_tauri_plugin_sql(&self, conn: &Connection) -> Result<()> {
        // Check if the old _sqlx_migrations table exists
        let has_sqlx_migrations: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !has_sqlx_migrations {
            return Ok(());
        }

        // Check current user_version
        let current_version: i32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        if current_version > 0 {
            // Already migrated to rusqlite_migration system
            return Ok(());
        }

        // Get the highest version from the old migrations table
        let old_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if old_version > 0 {
            info!(
                "Migrating from tauri-plugin-sql (version {}) to rusqlite_migration",
                old_version
            );

            // Set user_version to match the old migration state
            conn.pragma_update(None, "user_version", old_version)?;

            // Optionally drop the old migrations table (keeping it doesn't hurt)
            // conn.execute("DROP TABLE IF EXISTS _sqlx_migrations", [])?;

            info!(
                "Migration tracking converted: user_version set to {}",
                old_version
            );
        }

        Ok(())
    }

    fn get_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        // NORMAL is safe with WAL and avoids an fsync per transaction.
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(conn)
    }

    fn map_history_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
        Ok(HistoryEntry {
            id: row.get("id")?,
            file_name: row.get("file_name")?,
            timestamp: row.get("timestamp")?,
            saved: row.get("saved")?,
            title: row.get("title")?,
            transcription_text: row.get("transcription_text")?,
            post_processed_text: row.get("post_processed_text")?,
            post_process_prompt: row.get("post_process_prompt")?,
            post_process_requested: row.get("post_process_requested")?,
            app_name: row.get("app_name")?,
            duration_ms: row.get("duration_ms")?,
        })
    }

    pub fn recordings_dir(&self) -> &std::path::Path {
        &self.recordings_dir
    }

    /// Save a new history entry to the database.
    /// The WAV file should already have been written to the recordings directory.
    #[allow(clippy::too_many_arguments)]
    pub fn save_entry(
        &self,
        file_name: String,
        transcription_text: String,
        post_process_requested: bool,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
        app_name: Option<String>,
        duration_ms: Option<i64>,
    ) -> Result<HistoryEntry> {
        let timestamp = Utc::now().timestamp();
        let title = self.format_timestamp_title(timestamp);

        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO transcription_history (
                file_name,
                timestamp,
                saved,
                title,
                transcription_text,
                post_processed_text,
                post_process_prompt,
                post_process_requested,
                app_name,
                duration_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &file_name,
                timestamp,
                false,
                &title,
                &transcription_text,
                &post_processed_text,
                &post_process_prompt,
                post_process_requested,
                &app_name,
                duration_ms,
            ],
        )?;

        let entry = HistoryEntry {
            id: conn.last_insert_rowid(),
            file_name,
            timestamp,
            saved: false,
            title,
            transcription_text,
            post_processed_text,
            post_process_prompt,
            post_process_requested,
            app_name,
            duration_ms,
        };

        debug!("Saved history entry with id {}", entry.id);

        // Emit typed event for real-time frontend updates
        if let Err(e) = (HistoryUpdatePayload::Added {
            entry: entry.clone(),
        })
        .emit(&self.app_handle)
        {
            error!("Failed to emit history-updated event: {}", e);
        }

        // Retention cleanup is best-effort housekeeping; it must not delay
        // the update event or fail the save.
        if let Err(e) = self.cleanup_old_entries() {
            error!("Failed to clean up old history entries: {}", e);
        }

        Ok(entry)
    }

    /// Update an existing history entry with new transcription results (used by retry).
    pub fn update_transcription(
        &self,
        id: i64,
        transcription_text: String,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
    ) -> Result<HistoryEntry> {
        let conn = self.get_connection()?;
        let updated = conn.execute(
            "UPDATE transcription_history
             SET transcription_text = ?1,
                 post_processed_text = ?2,
                 post_process_prompt = ?3
             WHERE id = ?4",
            params![
                transcription_text,
                post_processed_text,
                post_process_prompt,
                id
            ],
        )?;

        if updated == 0 {
            return Err(anyhow!("History entry {} not found", id));
        }

        let entry = conn.query_row(
            &format!(
                "SELECT {} FROM transcription_history WHERE id = ?1",
                ENTRY_COLUMNS
            ),
            params![id],
            Self::map_history_entry,
        )?;

        debug!("Updated transcription for history entry {}", id);

        if let Err(e) = (HistoryUpdatePayload::Updated {
            entry: entry.clone(),
        })
        .emit(&self.app_handle)
        {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(entry)
    }

    pub fn cleanup_old_entries(&self) -> Result<()> {
        let retention_period = crate::settings::get_recording_retention_period(&self.app_handle);

        match retention_period {
            crate::settings::RecordingRetentionPeriod::Never => {
                // Don't delete anything
                return Ok(());
            }
            crate::settings::RecordingRetentionPeriod::PreserveLimit => {
                // Use the old count-based logic with history_limit
                let limit = crate::settings::get_history_limit(&self.app_handle);
                return self.cleanup_by_count(limit);
            }
            _ => {
                // Use time-based logic
                return self.cleanup_by_time(retention_period);
            }
        }
    }

    fn delete_entries_and_files(&self, entries: &[(i64, String)]) -> Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }

        let mut conn = self.get_connection()?;
        let mut deleted_count = 0;

        // Delete all rows in one transaction (one fsync instead of one per row)
        let tx = conn.transaction()?;
        for (id, _) in entries {
            tx.execute(
                "DELETE FROM transcription_history WHERE id = ?1",
                params![id],
            )?;
        }
        tx.commit()?;

        for (_, file_name) in entries {
            match crate::storage::remove_recording(&self.recordings_dir, file_name) {
                Ok(true) => {
                    debug!("Deleted old recording: {}", file_name);
                    deleted_count += 1;
                }
                Ok(false) => {}
                Err(e) => error!("Failed to delete recording {}: {}", file_name, e),
            }
        }

        Ok(deleted_count)
    }

    fn cleanup_by_count(&self, limit: usize) -> Result<()> {
        let conn = self.get_connection()?;

        // Get all entries that are not saved, ordered by timestamp desc
        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 ORDER BY timestamp DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries.push(row?);
        }

        if entries.len() > limit {
            let entries_to_delete = &entries[limit..];
            let deleted_count = self.delete_entries_and_files(entries_to_delete)?;

            if deleted_count > 0 {
                debug!("Cleaned up {} old history entries by count", deleted_count);
            }
        }

        Ok(())
    }

    fn cleanup_by_time(
        &self,
        retention_period: crate::settings::RecordingRetentionPeriod,
    ) -> Result<()> {
        let conn = self.get_connection()?;

        // Calculate cutoff timestamp (current time minus retention period)
        let now = Utc::now().timestamp();
        let cutoff_timestamp = match retention_period {
            crate::settings::RecordingRetentionPeriod::Days3 => now - (3 * 24 * 60 * 60), // 3 days in seconds
            crate::settings::RecordingRetentionPeriod::Weeks2 => now - (2 * 7 * 24 * 60 * 60), // 2 weeks in seconds
            crate::settings::RecordingRetentionPeriod::Months3 => now - (3 * 30 * 24 * 60 * 60), // 3 months in seconds (approximate)
            _ => unreachable!("Should not reach here"),
        };

        // Get all unsaved entries older than the cutoff timestamp
        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 AND timestamp < ?1",
        )?;

        let rows = stmt.query_map(params![cutoff_timestamp], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries_to_delete: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries_to_delete.push(row?);
        }

        let deleted_count = self.delete_entries_and_files(&entries_to_delete)?;

        if deleted_count > 0 {
            debug!(
                "Cleaned up {} old history entries based on retention period",
                deleted_count
            );
        }

        Ok(())
    }

    /// List entries newest first. `cursor` continues after the given id,
    /// `limit` caps the page (max 100) and `query` filters on the raw or
    /// processed text (case-insensitive substring).
    pub async fn get_history_entries(
        &self,
        cursor: Option<i64>,
        limit: Option<usize>,
        query: Option<String>,
    ) -> Result<PaginatedHistory> {
        let conn = self.get_connection()?;
        let limit = limit.map(|l| l.min(100));
        let query = query
            .map(|q| q.trim().to_string())
            .filter(|q| !q.is_empty());

        let mut clauses: Vec<String> = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(cursor_id) = cursor {
            clauses.push(format!("id < ?{}", values.len() + 1));
            values.push(Box::new(cursor_id));
        }
        if let Some(q) = query {
            let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));
            let index = values.len() + 1;
            clauses.push(format!(
                "(transcription_text LIKE ?{i} ESCAPE '\\' OR post_processed_text LIKE ?{i} ESCAPE '\\' OR app_name LIKE ?{i} ESCAPE '\\')",
                i = index
            ));
            values.push(Box::new(pattern));
        }
        let where_clause = if clauses.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", clauses.join(" AND "))
        };
        let limit_clause = match limit {
            Some(lim) => {
                values.push(Box::new((lim + 1) as i64));
                format!(" LIMIT ?{}", values.len())
            }
            None => String::new(),
        };

        let sql = format!(
            "SELECT {} FROM transcription_history{} ORDER BY id DESC{}",
            ENTRY_COLUMNS, where_clause, limit_clause
        );
        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        let mut entries: Vec<HistoryEntry> = stmt
            .query_map(params.as_slice(), Self::map_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let has_more = limit.is_some_and(|lim| entries.len() > lim);
        if has_more {
            entries.pop();
        }

        Ok(PaginatedHistory { entries, has_more })
    }

    #[cfg(test)]
    fn get_latest_entry_with_conn(conn: &Connection) -> Result<Option<HistoryEntry>> {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM transcription_history ORDER BY timestamp DESC LIMIT 1",
            ENTRY_COLUMNS
        ))?;

        let entry = stmt.query_row([], Self::map_history_entry).optional()?;
        Ok(entry)
    }

    /// Compute usage statistics (counts, word totals, speed and time saved).
    /// `since` restricts the aggregate numbers to entries at or after that
    /// unix timestamp; `None` means all time.
    pub fn get_stats(&self, since: Option<i64>) -> Result<HistoryStats> {
        let conn = self.get_connection()?;
        Self::get_stats_with_conn(&conn, since)
    }

    fn get_stats_with_conn(conn: &Connection, since: Option<i64>) -> Result<HistoryStats> {
        let start_of_day = Local::now()
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .and_then(|dt| dt.and_local_timezone(Local).single())
            .map(|dt| dt.timestamp())
            .unwrap_or(0);
        let since = since.unwrap_or(i64::MIN);

        let (total_entries, post_processed_entries, last_timestamp): (i64, i64, Option<i64>) = conn
            .query_row(
                "SELECT COUNT(*), SUM(CASE WHEN post_processed_text IS NOT NULL THEN 1 ELSE 0 END), MAX(timestamp) FROM transcription_history WHERE timestamp >= ?1",
                params![since],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                        row.get::<_, Option<i64>>(2)?,
                    ))
                },
            )?;
        let entries_today: i64 = conn.query_row(
            "SELECT COUNT(*) FROM transcription_history WHERE timestamp >= ?1",
            params![start_of_day.max(since)],
            |row| row.get(0),
        )?;
        let apps_used: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT app_name) FROM transcription_history WHERE timestamp >= ?1 AND app_name IS NOT NULL AND app_name != ''",
            params![since],
            |row| row.get(0),
        )?;

        let mut total_words: i64 = 0;
        let mut words_today: i64 = 0;
        let mut total_duration_ms: i64 = 0;
        let mut timed_words: i64 = 0;
        let mut stmt = conn.prepare(
            "SELECT timestamp, COALESCE(post_processed_text, transcription_text), duration_ms FROM transcription_history WHERE timestamp >= ?1",
        )?;
        let rows = stmt.query_map(params![since], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
            ))
        })?;
        for row in rows {
            let (timestamp, text, duration_ms) = row?;
            let words = text.split_whitespace().count() as i64;
            total_words += words;
            if timestamp >= start_of_day {
                words_today += words;
            }
            if let Some(duration) = duration_ms.filter(|d| *d > 0) {
                total_duration_ms += duration;
                timed_words += words;
            }
        }

        let average_wpm = if total_duration_ms > 0 {
            timed_words as f64 / (total_duration_ms as f64 / 60_000.0)
        } else {
            0.0
        };
        // Time it would have taken to type the same words, minus the time
        // actually spent speaking (only counted when the duration is known).
        let typing_ms = (total_words as f64 / TYPING_WPM * 60_000.0) as i64;
        let time_saved_ms = (typing_ms - total_duration_ms).max(0);

        Ok(HistoryStats {
            total_entries,
            total_words,
            entries_today,
            words_today,
            post_processed_entries,
            last_timestamp,
            total_duration_ms,
            apps_used,
            average_wpm,
            time_saved_ms,
        })
    }

    pub fn get_latest_completed_entry(&self) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        Self::get_latest_completed_entry_with_conn(&conn)
    }

    fn get_latest_completed_entry_with_conn(conn: &Connection) -> Result<Option<HistoryEntry>> {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM transcription_history WHERE transcription_text != '' ORDER BY timestamp DESC LIMIT 1",
            ENTRY_COLUMNS
        ))?;

        let entry = stmt.query_row([], Self::map_history_entry).optional()?;
        Ok(entry)
    }

    pub async fn toggle_saved_status(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Get current saved status
        let current_saved: bool = conn.query_row(
            "SELECT saved FROM transcription_history WHERE id = ?1",
            params![id],
            |row| row.get("saved"),
        )?;

        let new_saved = !current_saved;

        conn.execute(
            "UPDATE transcription_history SET saved = ?1 WHERE id = ?2",
            params![new_saved, id],
        )?;

        debug!("Toggled saved status for entry {}: {}", id, new_saved);

        // Emit history updated event
        if let Err(e) = (HistoryUpdatePayload::Toggled { id }).emit(&self.app_handle) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    pub fn get_audio_file_path(&self, file_name: &str) -> PathBuf {
        self.recordings_dir.join(file_name)
    }

    #[allow(dead_code)]
    pub fn update_transcription_text(
        &self,
        id: i64,
        new_text: &str,
        model_name: Option<&str>,
    ) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE transcription_history SET transcription_text = ?1, model_name = ?2 WHERE id = ?3",
            params![new_text, model_name, id],
        )?;

        debug!("Updated transcription text for entry {}", id);

        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    pub async fn get_entry_by_id(&self, id: i64) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM transcription_history WHERE id = ?1",
            ENTRY_COLUMNS
        ))?;

        let entry = stmt.query_row([id], Self::map_history_entry).optional()?;

        Ok(entry)
    }

    pub async fn delete_entry(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Get the entry to find the file name
        if let Some(entry) = self.get_entry_by_id(id).await? {
            // Delete the recording folder (audio + meta.json) first
            if let Err(e) = crate::storage::remove_recording(&self.recordings_dir, &entry.file_name)
            {
                error!("Failed to delete recording {}: {}", entry.file_name, e);
                // Continue with database deletion even if file deletion fails
            }
        }

        // Delete from database
        conn.execute(
            "DELETE FROM transcription_history WHERE id = ?1",
            params![id],
        )?;

        debug!("Deleted history entry with id: {}", id);

        // Emit history updated event
        if let Err(e) = (HistoryUpdatePayload::Deleted { id }).emit(&self.app_handle) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    fn format_timestamp_title(&self, timestamp: i64) -> String {
        if let Some(utc_datetime) = DateTime::from_timestamp(timestamp, 0) {
            // Convert UTC to local timezone
            let local_datetime = utc_datetime.with_timezone(&Local);
            local_datetime.format("%B %e, %Y - %l:%M%p").to_string()
        } else {
            format!("Recording {}", timestamp)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE transcription_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                saved BOOLEAN NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                transcription_text TEXT NOT NULL,
                post_processed_text TEXT,
                post_process_prompt TEXT,
                post_process_requested BOOLEAN NOT NULL DEFAULT 0,
                app_name TEXT,
                duration_ms INTEGER
            );",
        )
        .expect("create transcription_history table");
        conn
    }

    fn insert_entry(conn: &Connection, timestamp: i64, text: &str, post_processed: Option<&str>) {
        insert_entry_full(conn, timestamp, text, post_processed, None, None);
    }

    fn insert_entry_full(
        conn: &Connection,
        timestamp: i64,
        text: &str,
        post_processed: Option<&str>,
        app_name: Option<&str>,
        duration_ms: Option<i64>,
    ) {
        conn.execute(
            "INSERT INTO transcription_history (
                file_name,
                timestamp,
                saved,
                title,
                transcription_text,
                post_processed_text,
                post_process_prompt,
                post_process_requested,
                app_name,
                duration_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                format!("whispersm-{}.wav", timestamp),
                timestamp,
                false,
                format!("Recording {}", timestamp),
                text,
                post_processed,
                Option::<String>::None,
                false,
                app_name,
                duration_ms,
            ],
        )
        .expect("insert history entry");
    }

    #[test]
    fn stats_compute_speed_apps_and_time_saved() {
        let conn = setup_conn();
        // 120 words in 60 seconds => 120 WPM
        let text = vec!["word"; 120].join(" ");
        insert_entry_full(&conn, 100, &text, None, Some("Slack"), Some(60_000));
        insert_entry_full(&conn, 200, "hello world", None, Some("Mail"), None);
        insert_entry_full(&conn, 300, "again", None, Some("Slack"), Some(1_000));

        let stats = HistoryManager::get_stats_with_conn(&conn, None).expect("stats");
        assert_eq!(stats.total_entries, 3);
        assert_eq!(stats.total_words, 123);
        assert_eq!(stats.apps_used, 2);
        assert_eq!(stats.total_duration_ms, 61_000);
        // 121 timed words over 61s
        assert!((stats.average_wpm - 121.0 / (61.0 / 60.0)).abs() < 0.01);
        // typing 123 words at 40 WPM = 184.5s, minus 61s spoken
        assert_eq!(stats.time_saved_ms, 184_500 - 61_000);

        let recent = HistoryManager::get_stats_with_conn(&conn, Some(250)).expect("stats");
        assert_eq!(recent.total_entries, 1);
        assert_eq!(recent.total_words, 1);
        assert_eq!(recent.apps_used, 1);
    }

    #[test]
    fn get_latest_entry_returns_none_when_empty() {
        let conn = setup_conn();
        let entry = HistoryManager::get_latest_entry_with_conn(&conn).expect("fetch latest entry");
        assert!(entry.is_none());
    }

    #[test]
    fn get_latest_entry_returns_newest_entry() {
        let conn = setup_conn();
        insert_entry(&conn, 100, "first", None);
        insert_entry(&conn, 200, "second", Some("processed"));

        let entry = HistoryManager::get_latest_entry_with_conn(&conn)
            .expect("fetch latest entry")
            .expect("entry exists");

        assert_eq!(entry.timestamp, 200);
        assert_eq!(entry.transcription_text, "second");
        assert_eq!(entry.post_processed_text.as_deref(), Some("processed"));
    }

    #[test]
    fn get_latest_completed_entry_skips_empty_entries() {
        let conn = setup_conn();
        insert_entry(&conn, 100, "completed", None);
        insert_entry(&conn, 200, "", None);

        let entry = HistoryManager::get_latest_completed_entry_with_conn(&conn)
            .expect("fetch latest completed entry")
            .expect("completed entry exists");

        assert_eq!(entry.timestamp, 100);
        assert_eq!(entry.transcription_text, "completed");
    }
}
