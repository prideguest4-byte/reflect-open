//! The Reflect desktop shell: native primitives only.
//!
//! Per the architecture conventions, Rust owns *capabilities* (file IO, SQLite,
//! watching, recents) and TypeScript (`@reflect/core`) owns *policy and
//! composition* — a command here never encodes product rules beyond the
//! primitive it exposes. Each module wires one capability:
//! [`fs`] (graph file IO), [`db`] (SQLite index), [`watcher`] (file events),
//! [`recents`] (recent-graphs store), [`error`] (the shared error contract).

mod db;
mod error;
mod fs;
mod recents;
mod watcher;

/// Returns the desktop application version from Cargo metadata.
///
/// The canonical round-trip example for the IPC boundary: the frontend reaches
/// it only through `@reflect/core`'s typed, zod-validated `getAppVersion`.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Route `tracing` output to stderr, honoring `RUST_LOG` (default `info`).
fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    // `try_init` so a second call (tests, mobile re-entry) is a no-op, not a panic.
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(fs::GraphState::default())
        .manage(db::IndexState::default())
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            fs::graph_open,
            fs::graph_create,
            fs::note_read,
            fs::note_write,
            fs::asset_write,
            fs::note_move,
            fs::note_delete,
            fs::list_files,
            recents::recent_graphs,
            recents::forget_recent,
            db::index_open,
            db::index_apply,
            db::index_apply_batch,
            db::index_remove,
            db::index_clear,
            db::db_query,
            watcher::watch_start,
            watcher::watch_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
