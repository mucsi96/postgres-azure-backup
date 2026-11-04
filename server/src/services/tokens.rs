use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DownloadType {
    Archive,
    Pgdump,
    Sql,
    DataExport,
}

pub struct Download {
    pub database: String,
    pub key: String,
    pub kind: DownloadType,
    expires: Instant,
}

#[derive(Default)]
pub struct Tokens(HashMap<String, Download>);

impl Tokens {
    pub fn cleanup(&mut self) {
        let now = Instant::now();
        self.0.retain(|_, item| item.expires > now);
    }
    pub fn create(&mut self, database: String, key: String, kind: DownloadType) -> String {
        self.cleanup();
        let token = uuid::Uuid::new_v4().to_string();
        self.0.insert(
            token.clone(),
            Download {
                database,
                key,
                kind,
                expires: Instant::now() + Duration::from_secs(30),
            },
        );
        token
    }
    pub fn consume(&mut self, token: &str) -> Option<Download> {
        self.0
            .remove(token)
            .filter(|item| item.expires > Instant::now())
    }
}
