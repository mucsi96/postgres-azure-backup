use super::error::{Error, Result};
use crate::settings::Folder;
use std::{
    fs::File,
    path::{Component, Path, PathBuf},
};

pub struct FolderFile {
    pub path: PathBuf,
    pub entry: String,
    pub size: u64,
}

pub fn collect(folders: &[Folder]) -> Result<Vec<FolderFile>> {
    let mut files = Vec::new();
    for folder in folders {
        let root = Path::new(&folder.path);
        if !root.exists() {
            return Err(Error::Folder(format!(
                "Folder backup path does not exist: '{}'. The PersistentVolumeClaim is likely missing or its mountPath is misconfigured. Verify the PVC is bound and mounted at this path on the backup pod.",
                folder.path
            )));
        }
        if !root.is_dir() {
            return Err(Error::Folder(format!(
                "Folder backup path is not a directory: '{}'. Check that the configured path points to a directory, not a file.",
                folder.path
            )));
        }
        let basename = root.file_name().ok_or(Error::BadRequest)?.to_string_lossy();
        for entry in walkdir::WalkDir::new(root) {
            let entry = entry.map_err(anyhow::Error::from)?;
            // Never follow links outside the configured mount.
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = entry
                .path()
                .strip_prefix(root)
                .map_err(anyhow::Error::from)?;
            files.push(FolderFile {
                path: entry.path().to_owned(),
                entry: format!("folders/{basename}/{}", relative.to_string_lossy()),
                size: entry.metadata().map_err(anyhow::Error::from)?.len(),
            });
        }
    }
    Ok(files)
}

pub fn create(directory: &Path, files: &[FolderFile]) -> anyhow::Result<PathBuf> {
    let output = directory.join("backup.zip");
    let mut zip = zip::ZipWriter::new(File::create(&output)?);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for name in ["database.pgdump", "database.sql"] {
        zip.start_file(name, options)?;
        std::io::copy(&mut File::open(directory.join(name))?, &mut zip)?;
    }
    for file in files {
        zip.start_file(&file.entry, options)?;
        std::io::copy(&mut File::open(&file.path)?, &mut zip)?;
    }
    zip.finish()?;
    Ok(output)
}

pub struct Extracted {
    pub dump: Option<PathBuf>,
    pub sql: Option<PathBuf>,
    pub folders: Vec<(String, PathBuf, PathBuf)>,
}

pub fn extract_download(archive: &Path, directory: &Path, plain: bool) -> anyhow::Result<PathBuf> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        if entry.is_dir()
            || entry.name()?.starts_with("folders/")
            || entry.name()?.ends_with(".sql") != plain
        {
            continue;
        }
        anyhow::ensure!(!entry.is_symlink(), "Archive links are not supported");
        let target = directory.join(if plain {
            "download.sql"
        } else {
            "download.pgdump"
        });
        std::io::copy(&mut entry, &mut File::create(&target)?)?;
        return Ok(target);
    }
    anyhow::bail!("Requested dump not found in archive")
}

pub fn extract(archive: &Path, directory: &Path) -> anyhow::Result<Extracted> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?)?;
    let mut result = Extracted {
        dump: None,
        sql: None,
        folders: Vec::new(),
    };
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let path = entry
            .enclosed_name()
            .ok_or_else(|| anyhow::anyhow!("Unsafe archive path"))?;
        anyhow::ensure!(
            path.components().all(|c| matches!(c, Component::Normal(_))),
            "Unsafe archive path"
        );
        anyhow::ensure!(!entry.is_symlink(), "Archive links are not supported");
        if entry.is_dir() {
            continue;
        }
        let target = directory.join(&path);
        std::fs::create_dir_all(
            target
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Missing parent"))?,
        )?;
        std::io::copy(&mut entry, &mut File::create(&target)?)?;
        if let Ok(relative) = path.strip_prefix("folders") {
            let mut parts = relative.components();
            let folder = parts
                .next()
                .ok_or_else(|| anyhow::anyhow!("Missing folder"))?
                .as_os_str()
                .to_string_lossy()
                .into_owned();
            let relative = parts.as_path().to_owned();
            anyhow::ensure!(!relative.as_os_str().is_empty(), "Missing folder file path");
            result.folders.push((folder, relative, target));
        } else if path.extension().is_some_and(|ext| ext == "sql") {
            result.sql = Some(target);
        } else {
            result.dump = Some(target);
        }
    }
    Ok(result)
}

pub fn restore_folders(
    files: &[(String, PathBuf, PathBuf)],
    folders: &[Folder],
) -> anyhow::Result<()> {
    for (name, relative, source) in files {
        let Some(folder) = folders.iter().find(|folder| {
            Path::new(&folder.path)
                .file_name()
                .is_some_and(|base| base == name.as_str())
        }) else {
            tracing::warn!(folder = name, "Skipping unconfigured backup folder");
            continue;
        };
        let root = std::fs::canonicalize(&folder.path)?;
        let target = root.join(relative);
        // Reject links in every existing component, including the destination.
        let mut current = root.clone();
        for component in relative.components() {
            anyhow::ensure!(
                matches!(component, Component::Normal(_)),
                "Unsafe restoration path"
            );
            current.push(component);
            if let Ok(metadata) = std::fs::symlink_metadata(&current) {
                anyhow::ensure!(
                    !metadata.file_type().is_symlink(),
                    "Restoration path contains a symlink"
                );
            }
        }
        std::fs::create_dir_all(
            target
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Missing parent"))?,
        )?;
        std::fs::copy(source, target)?;
    }
    Ok(())
}
