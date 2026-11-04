use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub name: String,
    pub last_modified: DateTime<Utc>,
    pub size: u64,
    pub total_row_count: i64,
    pub file_count: u64,
    pub files_total_size: u64,
    pub retention_period: i64,
    pub has_plain_dump: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    pub name: String,
    pub row_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub tables: Vec<Table>,
    pub total_row_count: i64,
    pub file_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSummary {
    pub name: String,
    pub tables_count: usize,
    pub total_row_count: i64,
    pub file_count: usize,
    pub backups_count: usize,
    pub last_backup_time: Option<DateTime<Utc>>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartResult {
    pub backups_performed: Vec<BackupOperation>,
    pub cleanup_performed: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOperation {
    pub database: String,
    pub retention_period: i64,
}
