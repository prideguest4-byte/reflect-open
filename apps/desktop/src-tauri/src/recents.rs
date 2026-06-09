//! Recent-graphs list + cloud-sync detection (Plan 02).
//!
//! The recents list lives in the OS config dir — **never** inside any one
//! graph's `.reflect/` — so it survives graph deletion and isn't synced as note
//! content. Cloud-sync detection flags graphs placed inside iCloud/Dropbox/Drive
//! folders, which are unsupported for sync (Reflect syncs via GitHub only,
//! Plan 12) and risk corrupting the in-graph index.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const MAX_RECENTS: usize = 12;

/// A previously-opened graph, newest first in the stored list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentGraph {
    pub root: String,
    pub name: String,
    pub opened_ms: u64,
}

fn store_path() -> AppResult<PathBuf> {
    let base = dirs::config_dir().ok_or_else(|| AppError::io("no OS config dir"))?;
    Ok(base.join("reflect-open").join("recent-graphs.json"))
}

fn load_from(path: &Path) -> Vec<RecentGraph> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_to(path: &Path, recents: &[RecentGraph]) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json =
        serde_json::to_string_pretty(recents).map_err(|err| AppError::io(err.to_string()))?;
    fs::write(path, json)?;
    Ok(())
}

/// Prepend `entry`, dedupe by `root`, and cap the list. Pure (unit-tested).
fn with_entry(mut recents: Vec<RecentGraph>, entry: RecentGraph) -> Vec<RecentGraph> {
    recents.retain(|r| r.root != entry.root);
    recents.insert(0, entry);
    recents.truncate(MAX_RECENTS);
    recents
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|dur| dur.as_millis() as u64)
        .unwrap_or(0)
}

/// Record a graph as most-recently-opened.
pub fn record(root: &Path, name: &str) -> AppResult<()> {
    let path = store_path()?;
    let entry = RecentGraph {
        root: root.to_string_lossy().into_owned(),
        name: name.to_string(),
        opened_ms: now_ms(),
    };
    save_to(&path, &with_entry(load_from(&path), entry))
}

/// The recent-graphs list, newest first.
pub fn list() -> AppResult<Vec<RecentGraph>> {
    Ok(load_from(&store_path()?))
}

/// Drop a graph from the recents list (by root path).
pub fn forget(root: &str) -> AppResult<()> {
    let path = store_path()?;
    let mut recents = load_from(&path);
    recents.retain(|r| r.root != root);
    save_to(&path, &recents)
}

/// Command: the recent-graphs list, newest first.
#[tauri::command]
pub fn recent_graphs() -> AppResult<Vec<RecentGraph>> {
    list()
}

/// Command: drop a graph from recents (by root path).
#[tauri::command]
pub fn forget_recent(root: String) -> AppResult<()> {
    forget(&root)
}

/// Heuristic: which file-sync provider, if any, is `path` inside? Pure
/// (unit-tested). A `Some(_)` result means the UI should warn (Plan 12 / Plan 04).
pub fn detect_cloud_sync(path: &Path) -> Option<&'static str> {
    let lower = path.to_string_lossy();
    if lower.contains("Mobile Documents")
        || lower.contains("com~apple~CloudDocs")
        || lower.contains("iCloud Drive")
    {
        Some("icloud")
    } else if lower.contains("/Dropbox/")
        || lower.ends_with("/Dropbox")
        || lower.contains("\\Dropbox\\")
    {
        Some("dropbox")
    } else if lower.contains("Google Drive")
        || lower.contains("GoogleDrive")
        || lower.contains("My Drive")
    {
        Some("googleDrive")
    } else if lower.contains("OneDrive") {
        Some("oneDrive")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn entry(root: &str, opened_ms: u64) -> RecentGraph {
        RecentGraph {
            root: root.to_string(),
            name: root.rsplit('/').next().unwrap_or(root).to_string(),
            opened_ms,
        }
    }

    #[test]
    fn prepends_dedupes_and_caps() {
        let mut list = Vec::new();
        for i in 0..15 {
            list = with_entry(list, entry(&format!("/g/{i}"), i));
        }
        assert_eq!(list.len(), MAX_RECENTS);
        assert_eq!(list[0].root, "/g/14"); // newest first

        // Re-opening an existing root moves it to front without duplicating.
        let list = with_entry(list, entry("/g/10", 99));
        assert_eq!(list[0].root, "/g/10");
        assert_eq!(list.iter().filter(|r| r.root == "/g/10").count(), 1);
        assert_eq!(list.len(), MAX_RECENTS);
    }

    #[test]
    fn save_load_round_trip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("recent-graphs.json");
        let recents = vec![entry("/a", 1), entry("/b", 2)];
        save_to(&path, &recents).unwrap();
        assert_eq!(load_from(&path), recents);
    }

    #[test]
    fn missing_store_loads_empty() {
        let dir = tempdir().unwrap();
        assert!(load_from(&dir.path().join("nope.json")).is_empty());
    }

    #[test]
    fn detects_cloud_providers() {
        use std::path::Path;
        assert_eq!(
            detect_cloud_sync(Path::new(
                "/Users/x/Library/Mobile Documents/com~apple~CloudDocs/Graph"
            )),
            Some("icloud")
        );
        assert_eq!(
            detect_cloud_sync(Path::new("/Users/x/Dropbox/Graph")),
            Some("dropbox")
        );
        assert_eq!(
            detect_cloud_sync(Path::new(
                "/Users/x/Library/CloudStorage/GoogleDrive-a/My Drive/Graph"
            )),
            Some("googleDrive")
        );
        assert_eq!(detect_cloud_sync(Path::new("/Users/x/Notes/Graph")), None);
    }
}
