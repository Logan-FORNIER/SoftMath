use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSecrets {
    pub gemini_api_key: String,
    pub anthropic_api_key: String,
}

fn secrets_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("Impossible de localiser le dossier local de l'application : {err}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|err| format!("Impossible de créer le dossier de configuration IA : {err}"))?;
    }
    Ok(dir.join("ai-secrets.json"))
}

#[tauri::command]
fn ai_load_secrets(app: tauri::AppHandle) -> Result<AiSecrets, String> {
    let path = secrets_file_path(&app)?;
    if !path.exists() {
        return Ok(AiSecrets::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Impossible de lire le coffre des clés API : {err}"))?;
    serde_json::from_str::<AiSecrets>(&raw)
        .map_err(|err| format!("Format invalide dans le coffre des clés API : {err}"))
}

#[tauri::command]
fn ai_save_secrets(app: tauri::AppHandle, secrets: AiSecrets) -> Result<(), String> {
    let path = secrets_file_path(&app)?;
    let sanitized = AiSecrets {
        gemini_api_key: secrets.gemini_api_key.trim().to_string(),
        anthropic_api_key: secrets.anthropic_api_key.trim().to_string(),
    };
    let json = serde_json::to_string_pretty(&sanitized)
        .map_err(|err| format!("Erreur de sérialisation des clés API : {err}"))?;
    fs::write(&path, json)
        .map_err(|err| format!("Impossible d'enregistrer le coffre des clés API : {err}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(&path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // Must be registered after tauri_plugin_fs so user-selected folder scopes persist across restarts.
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![ai_load_secrets, ai_save_secrets])
        .run(tauri::generate_context!())
        .expect("error while running SoftMath");
}
