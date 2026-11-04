use crate::{
    models::{Backup, DatabaseInfo, DatabaseSummary, SmartResult},
    services::{
        archives,
        backup::BackupService,
        database,
        error::{Error, Result},
        storage::StorageService,
        tokens::DownloadType,
    },
};
use axum::{
    Extension, Json,
    body::Body,
    extract::Path,
    http::header,
    response::{IntoResponse, Response},
};
use loco_rs::controller::Routes;
use object_store::ObjectStoreExt;
use serde::Serialize;
use std::sync::Arc;

type Service = Extension<Arc<BackupService>>;

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api")
        .add("/databases", axum::routing::get(databases))
        .add("/database/{name}/tables", axum::routing::get(tables))
        .add("/database/{name}/backups", axum::routing::get(backups))
        .add(
            "/database/{name}/last-backup-time",
            axum::routing::get(last_backup),
        )
        .add("/database/{name}/backup", axum::routing::post(backup))
        .add("/backup-all", axum::routing::post(backup_all))
        .add("/smart-backup", axum::routing::post(smart))
        .add(
            "/database/{name}/restore/{key}",
            axum::routing::post(restore),
        )
        .add(
            "/database/{name}/backup/{key}/{kind}/download-token",
            axum::routing::post(token),
        )
        .add(
            "/database/{name}/export-sql/download-token",
            axum::routing::post(export_token),
        )
        .add("/download/{token}", axum::routing::get(download))
}
async fn databases(Extension(service): Service) -> Result<Json<Vec<DatabaseSummary>>> {
    Ok(Json(service.summaries().await?))
}
async fn tables(
    Extension(service): Service,
    Path(name): Path<String>,
) -> Result<Json<DatabaseInfo>> {
    Ok(Json(service.info(service.database(&name)?).await?))
}
async fn backups(
    Extension(service): Service,
    Path(name): Path<String>,
) -> Result<Json<Vec<Backup>>> {
    Ok(Json(
        service
            .storage
            .list(&service.database(&name)?.prefix())
            .await?,
    ))
}
async fn last_backup(
    Extension(service): Service,
    Path(name): Path<String>,
) -> Result<Json<Option<chrono::DateTime<chrono::Utc>>>> {
    Ok(Json(
        service
            .storage
            .list(&service.database(&name)?.prefix())
            .await?
            .first()
            .map(|b| b.last_modified),
    ))
}
async fn backup(Extension(service): Service, Path(name): Path<String>) -> Result<()> {
    let _guard = service.operations.lock().await;
    service.backup(service.database(&name)?, 7).await
}
async fn backup_all(Extension(service): Service) -> Result<()> {
    let _guard = service.operations.lock().await;
    for db in &service.databases {
        service.backup(db, 7).await?;
    }
    Ok(())
}
async fn smart(Extension(service): Service) -> Json<SmartResult> {
    Json(service.smart().await)
}
async fn restore(
    Extension(service): Service,
    Path((name, key)): Path<(String, String)>,
) -> Result<()> {
    let _guard = service.operations.lock().await;
    service.restore(service.database(&name)?, &key).await
}
#[derive(Serialize)]
struct Token {
    token: String,
}
async fn token(
    Extension(service): Service,
    Path((name, key, kind)): Path<(String, String, DownloadType)>,
) -> Result<Json<Token>> {
    service.database(&name)?;
    BackupService::validate_key(&key)?;
    if matches!(kind, DownloadType::DataExport) {
        return Err(Error::BadRequest);
    }
    Ok(Json(Token {
        token: service.tokens.lock().await.create(name, key, kind),
    }))
}
async fn export_token(
    Extension(service): Service,
    Path(name): Path<String>,
) -> Result<Json<Token>> {
    service.database(&name)?;
    Ok(Json(Token {
        token: service
            .tokens
            .lock()
            .await
            .create(name, String::new(), DownloadType::DataExport),
    }))
}

async fn download(Extension(service): Service, Path(token): Path<String>) -> Result<Response> {
    let download = service
        .tokens
        .lock()
        .await
        .consume(&token)
        .ok_or(Error::Gone)?;
    let db = service.database(&download.database)?;
    let (body, size, filename, content_type) = if matches!(download.kind, DownloadType::Archive) {
        let object = service
            .storage
            .0
            .get(&StorageService::path(&db.prefix(), &download.key))
            .await
            .map_err(anyhow::Error::from)?;
        let size = object.meta.size;
        (
            Body::from_stream(object.into_stream()),
            size,
            download.key,
            "application/octet-stream",
        )
    } else {
        let directory = Arc::new(tempfile::tempdir().map_err(anyhow::Error::from)?);
        let (file, filename, content_type) = if matches!(download.kind, DownloadType::DataExport) {
            let file = directory.path().join("export.sql");
            database::dump(db, &file, true, true).await?;
            (file, format!("{}-data-export.sql", db.name), "text/plain")
        } else {
            let archive = directory.path().join("backup.zip");
            service
                .storage
                .download(&db.prefix(), &download.key, &archive)
                .await?;
            let dir = directory.clone();
            let plain = matches!(download.kind, DownloadType::Sql);
            let extracted = tokio::task::spawn_blocking(move || {
                archives::extract_download(&archive, dir.path(), plain)
            })
            .await
            .map_err(anyhow::Error::from)??;
            match download.kind {
                DownloadType::Sql => (
                    extracted,
                    download.key.replace(".zip", ".sql"),
                    "text/plain",
                ),
                _ => (
                    extracted,
                    download.key.replace(".zip", ".pgdump"),
                    "application/octet-stream",
                ),
            }
        };
        let file = tokio::fs::File::open(file)
            .await
            .map_err(anyhow::Error::from)?;
        let size = file.metadata().await.map_err(anyhow::Error::from)?.len();
        // Keep the temporary directory alive until the response stream is dropped,
        // including when a client disconnects before consuming the body.
        use futures::StreamExt;
        let stream = tokio_util::io::ReaderStream::new(file).map(move |chunk| {
            let _keep = &directory;
            chunk
        });
        (Body::from_stream(stream), size, filename, content_type)
    };
    let filename = filename.replace(['"', '\r', '\n', '\\'], "_");
    Ok((
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (header::CONTENT_LENGTH, size.to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        body,
    )
        .into_response())
}
