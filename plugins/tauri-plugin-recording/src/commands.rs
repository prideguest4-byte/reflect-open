use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::RecordingExt;
use crate::Result;

/// Start recording into the plugin's staging directory. Prompts for the
/// microphone on first use; rejects when access is denied.
#[command]
pub(crate) async fn start_recording<R: Runtime>(
    app: AppHandle<R>,
    request: StartRequest,
) -> Result<()> {
    app.recording().start_recording(request)
}

/// Stop the active recording; returns the staged file and its duration.
#[command]
pub(crate) async fn stop_recording<R: Runtime>(app: AppHandle<R>) -> Result<StopResponse> {
    app.recording().stop_recording()
}

/// Stop the active recording and discard its file.
#[command]
pub(crate) async fn cancel_recording<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.recording().cancel_recording()
}

/// Whether a native recording is live right now. A fresh webview mount asks
/// this to find a recording that outlived its UI (a reload or crash
/// mid-memo) and stop-and-save it.
#[command]
pub(crate) async fn recording_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RecordingStatusResponse> {
    app.recording().recording_status()
}

/// Finished recordings still in staging — crash orphans a launch pass must
/// ingest, plus any file currently mid-ingest (callers filter those).
#[command]
pub(crate) async fn list_staged<R: Runtime>(app: AppHandle<R>) -> Result<ListStagedResponse> {
    app.recording().list_staged()
}

/// A staged recording's bytes, base64-encoded for the capture pipeline.
#[command]
pub(crate) async fn read_staged<R: Runtime>(
    app: AppHandle<R>,
    request: StagedPathRequest,
) -> Result<ReadStagedResponse> {
    app.recording().read_staged(request)
}

/// Remove a staged recording once its bytes are durably in the graph.
#[command]
pub(crate) async fn delete_staged<R: Runtime>(
    app: AppHandle<R>,
    request: StagedPathRequest,
) -> Result<()> {
    app.recording().delete_staged(request)
}
