use super::{
    archives, database,
    error::{Error, Result},
    storage::StorageService,
    tokens::Tokens,
};
use crate::{
    models::{BackupOperation, DatabaseInfo, DatabaseSummary, SmartResult},
    settings::{Database, Settings},
};
use chrono::{Duration, Utc};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct BackupService {
    pub databases: Vec<Database>,
    pub storage: StorageService,
    pub tokens: Mutex<Tokens>,
    pub operations: Mutex<()>,
}

impl BackupService {
    pub fn new(settings: &Settings) -> anyhow::Result<Arc<Self>> {
        Ok(Arc::new(Self {
            databases: settings.databases.clone(),
            storage: StorageService::new(&settings.storage)?,
            tokens: Mutex::new(Tokens::default()),
            operations: Mutex::new(()),
        }))
    }
    pub fn database(&self, name: &str) -> Result<&Database> {
        self.databases
            .iter()
            .find(|db| db.name == name)
            .ok_or(Error::NotFound)
    }
    pub fn validate_key(key: &str) -> Result<()> {
        if !key.ends_with(".zip")
            || key.contains(['/', '\\', '\r', '\n', '"'])
            || key.starts_with('.')
        {
            return Err(Error::BadRequest);
        }
        Ok(())
    }
    pub async fn info(&self, db: &Database) -> Result<DatabaseInfo> {
        let tables = database::tables(db, false).await?;
        let total_row_count = tables.iter().map(|table| table.row_count).sum();
        let folders = db.folder_backups.clone();
        let file_count = tokio::task::spawn_blocking(move || archives::collect(&folders))
            .await
            .map_err(anyhow::Error::from)??
            .len();
        Ok(DatabaseInfo {
            tables,
            total_row_count,
            file_count,
        })
    }
    pub async fn summaries(&self) -> Result<Vec<DatabaseSummary>> {
        let mut summaries = Vec::new();
        for db in &self.databases {
            let tables = database::tables(db, true).await?;
            let backups = self.storage.list(&db.prefix()).await?;
            let folders = db.folder_backups.clone();
            let file_count = tokio::task::spawn_blocking(move || archives::collect(&folders))
                .await
                .map_err(anyhow::Error::from)??
                .len();
            summaries.push(DatabaseSummary {
                name: db.name.clone(),
                tables_count: tables.len(),
                total_row_count: tables.iter().map(|t| t.row_count).sum(),
                file_count,
                backups_count: backups.len(),
                last_backup_time: backups.first().map(|b| b.last_modified),
            });
        }
        Ok(summaries)
    }
    pub async fn backup(&self, db: &Database, retention: i64) -> Result<()> {
        tracing::info!(database = db.name, retention, "Creating backup");
        let directory = Arc::new(tempfile::tempdir().map_err(anyhow::Error::from)?);
        database::dump(db, &directory.path().join("database.pgdump"), false, false).await?;
        database::dump(db, &directory.path().join("database.sql"), true, false).await?;
        let rows: i64 = database::tables(db, false)
            .await?
            .iter()
            .map(|t| t.row_count)
            .sum();
        let folders = db.folder_backups.clone();
        let dir = directory.clone();
        let (archive, count, size) = tokio::task::spawn_blocking(move || -> Result<_> {
            let files = archives::collect(&folders)?;
            let size: u64 = files.iter().map(|f| f.size).sum();
            Ok((archives::create(dir.path(), &files)?, files.len(), size))
        })
        .await
        .map_err(anyhow::Error::from)??;
        let key = format!(
            "{}.{rows}.{count}.{size}.{retention}.zip",
            Utc::now().format("%Y%m%d-%H%M%S")
        );
        self.storage.upload(&db.prefix(), &key, &archive).await?;
        tracing::info!(database = db.name, key, "Backup completed");
        Ok(())
    }
    pub async fn restore(&self, db: &Database, key: &str) -> Result<()> {
        Self::validate_key(key)?;
        let directory = Arc::new(tempfile::tempdir().map_err(anyhow::Error::from)?);
        let archive = directory.path().join("backup.zip");
        self.storage.download(&db.prefix(), key, &archive).await?;
        let dir = directory.clone();
        let extracted = tokio::task::spawn_blocking(move || {
            archives::extract(&archive, &dir.path().join("extracted"))
        })
        .await
        .map_err(anyhow::Error::from)??;
        let dump = extracted
            .dump
            .ok_or_else(|| anyhow::anyhow!("No database dump in archive"))?;
        database::restore(db, &dump, directory.path()).await?;
        let folders = db.folder_backups.clone();
        tokio::task::spawn_blocking(move || {
            let _directory = directory;
            archives::restore_folders(&extracted.folders, &folders)
        })
        .await
        .map_err(anyhow::Error::from)??;
        Ok(())
    }
    pub async fn smart(&self) -> SmartResult {
        let _guard = self.operations.lock().await;
        let mut result = SmartResult::default();
        if let Err(error) = self.smart_inner(&mut result).await {
            tracing::error!(%error, "Smart backup failed");
            result.error = Some("Smart backup failed; see server logs".into());
        }
        result
    }
    async fn smart_inner(&self, result: &mut SmartResult) -> Result<()> {
        for db in &self.databases {
            let backups = self.storage.list(&db.prefix()).await?;
            for (retention, interval) in [(356, 30), (30, 7), (7, 1)] {
                let last = backups
                    .iter()
                    .filter(|b| {
                        matches!(b.retention_period, 7 | 30 | 356)
                            && b.retention_period >= retention
                    })
                    .map(|b| b.last_modified)
                    .max();
                if last.is_none_or(|last| Utc::now() - last >= Duration::days(interval)) {
                    self.backup(db, retention).await?;
                    result.backups_performed.push(BackupOperation {
                        database: db.name.clone(),
                        retention_period: retention,
                    });
                    break;
                }
            }
        }
        for db in &self.databases {
            for backup in self.storage.list(&db.prefix()).await? {
                let expires = backup
                    .last_modified
                    .checked_add_signed(
                        Duration::try_days(backup.retention_period)
                            .ok_or_else(|| anyhow::anyhow!("Invalid retention"))?,
                    )
                    .ok_or_else(|| anyhow::anyhow!("Invalid expiration"))?;
                if expires < Utc::now() {
                    self.storage.delete(&db.prefix(), &backup.name).await?;
                }
            }
        }
        result.cleanup_performed = true;
        Ok(())
    }
}
