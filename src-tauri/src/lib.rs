use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Saves predating the slot system lived in this one file; slot 1 still reads
/// it so an existing campaign is not orphaned by the upgrade.
const LEGACY_SAVE_FILE: &str = "save.warfire";

/// Where a slot's save lives. Slot names come from the UI, so they are
/// sanitised to keep a stray value from escaping the data directory.
fn slot_path(app: &tauri::AppHandle, slot: &str) -> Result<PathBuf, String> {
    let clean: String = slot
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(24)
        .collect();
    if clean.is_empty() {
        return Err(String::from("invalid save slot"));
    }
    Ok(save_dir(app)?.join(format!("save-{clean}.warfire")))
}

/// The file a slot read should fall back to: only slot 1 has a predecessor.
fn legacy_path(app: &tauri::AppHandle, slot: &str) -> Option<PathBuf> {
    if slot != "1" {
        return None;
    }
    save_dir(app).ok().map(|dir| dir.join(LEGACY_SAVE_FILE))
}

/// Resolve (and create) the per-user game data directory.
fn save_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Persist a base64 save blob to disk. Returns the full path written.
#[tauri::command]
fn save_game(app: tauri::AppHandle, slot: String, data: String) -> Result<String, String> {
    let path = slot_path(&app, &slot)?;
    fs::write(&path, &data).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Read a slot's save blob, or `None` when that slot is empty.
#[tauri::command]
fn load_game(app: tauri::AppHandle, slot: String) -> Result<Option<String>, String> {
    let path = slot_path(&app, &slot)?;
    let path = if path.exists() {
        path
    } else {
        match legacy_path(&app, &slot) {
            Some(old) if old.exists() => old,
            _ => return Ok(None),
        }
    };
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))
}

/// Report where saves live, for display in the UI.
#[tauri::command]
fn save_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(save_dir(&app)?.to_string_lossy().into_owned())
}

/// Delete a slot's save. Returns true when something was removed.
///
/// Slot 1 also owns the pre-slot file: `load_game` reads it as a fallback, so
/// leaving it behind would make a deleted slot come back on the next read.
#[tauri::command]
fn delete_save(app: tauri::AppHandle, slot: String) -> Result<bool, String> {
    let path = slot_path(&app, &slot)?;
    let mut removed = false;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("cannot delete {}: {e}", path.display()))?;
        removed = true;
    }
    if let Some(legacy) = legacy_path(&app, &slot) {
        if legacy.exists() {
            fs::remove_file(&legacy)
                .map_err(|e| format!("cannot delete {}: {e}", legacy.display()))?;
            removed = true;
        }
    }
    Ok(removed)
}

/// Locate the `decisions/` directory.
///
/// Checked in order: the `WARFIRE_DECISIONS_DIR` override, the working
/// directory (what `tauri dev` uses), next to the executable, and finally the
/// per-user data directory. Returns `None` when none exist — the frontend then
/// falls back to the copy bundled into the web assets.
fn decisions_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(dir) = std::env::var("WARFIRE_DECISIONS_DIR") {
        if !dir.is_empty() {
            candidates.push(PathBuf::from(dir));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("decisions"));
        // `tauri dev` runs from src-tauri/, so the project root is one level up.
        candidates.push(cwd.join("../decisions"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("decisions"));
            candidates.push(parent.join("resources/decisions"));
        }
    }
    if let Ok(data) = app.path().app_data_dir() {
        candidates.push(data.join("decisions"));
    }

    candidates.into_iter().find(|p| p.is_dir())
}

/// Read every `*.warf-decision` file on disk.
///
/// Returns `(filename, contents)` pairs. An empty vec means "no directory
/// found", which the frontend treats as "use the bundled decisions".
#[tauri::command]
fn load_decision_files(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let Some(dir) = decisions_dir(&app) else {
        return Ok(Vec::new());
    };

    let entries = fs::read_dir(&dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
    let mut out: Vec<(String, String)> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_decision = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with(".warf-decision"))
            .unwrap_or(false);
        if !is_decision {
            continue;
        }
        match fs::read_to_string(&path) {
            Ok(text) => {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                out.push((name, text));
            }
            Err(e) => return Err(format!("cannot read {}: {e}", path.display())),
        }
    }

    // Stable order so the UI does not reshuffle between reloads.
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

/// Where decisions are being read from, for display in the UI.
#[tauri::command]
fn decisions_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(match decisions_dir(&app) {
        Some(p) => p.to_string_lossy().into_owned(),
        None => String::from("(bundled)"),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_game,
            load_game,
            save_location,
            delete_save,
            load_decision_files,
            decisions_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running WARFIRE RISES");
}
