mod db;

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use db::{PageMeta, PagePatch, SearchHit};
use rusqlite::{Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    conn: Mutex<Connection>,
    assets_dir: std::path::PathBuf,
}

type R<T> = Result<T, String>;

fn e<E: ToString>(x: E) -> String {
    x.to_string()
}

#[tauri::command]
fn has_user(s: tauri::State<AppState>) -> R<bool> {
    let c = s.conn.lock().map_err(e)?;
    let n: i64 = c.query_row("SELECT COUNT(*) FROM user", [], |r| r.get(0)).map_err(e)?;
    Ok(n > 0)
}

#[tauri::command]
fn register(s: tauri::State<AppState>, email: String, password: String) -> R<()> {
    if email.trim().is_empty() || password.len() < 6 {
        return Err("Email requerido y contraseña de al menos 6 caracteres".into());
    }
    let c = s.conn.lock().map_err(e)?;
    let n: i64 = c.query_row("SELECT COUNT(*) FROM user", [], |r| r.get(0)).map_err(e)?;
    if n > 0 {
        return Err("Ya existe un usuario".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default().hash_password(password.as_bytes(), &salt).map_err(e)?.to_string();
    c.execute("INSERT INTO user(id,email,pass_hash) VALUES(1,?1,?2)", rusqlite::params![email.trim().to_lowercase(), hash]).map_err(e)?;
    Ok(())
}

#[tauri::command]
fn login(s: tauri::State<AppState>, email: String, password: String) -> R<()> {
    let c = s.conn.lock().map_err(e)?;
    let row: Option<(String, String)> = c
        .query_row("SELECT email, pass_hash FROM user WHERE id=1", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(e)?;
    let (mail, hash) = row.ok_or("No hay usuario creado")?;
    let parsed = PasswordHash::new(&hash).map_err(e)?;
    let ok = mail == email.trim().to_lowercase()
        && Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok();
    if ok { Ok(()) } else { Err("Email o contraseña incorrectos".into()) }
}

#[tauri::command]
fn list_pages(s: tauri::State<AppState>) -> R<Vec<PageMeta>> {
    db::list_pages(&*s.conn.lock().map_err(e)?).map_err(e)
}

#[tauri::command]
fn get_content(s: tauri::State<AppState>, id: String) -> R<String> {
    db::get_content(&*s.conn.lock().map_err(e)?, &id).map_err(e)
}

#[tauri::command]
fn create_page(s: tauri::State<AppState>, parent_id: Option<String>) -> R<PageMeta> {
    db::create_page(&*s.conn.lock().map_err(e)?, parent_id).map_err(e)
}

#[tauri::command]
fn update_page(s: tauri::State<AppState>, id: String, patch: PagePatch) -> R<PageMeta> {
    db::update_page(&*s.conn.lock().map_err(e)?, &id, patch).map_err(e)
}

#[tauri::command]
fn move_page(s: tauri::State<AppState>, id: String, parent_id: Option<String>, position: f64) -> R<()> {
    db::move_page(&*s.conn.lock().map_err(e)?, &id, parent_id, position)
}

#[tauri::command]
fn trash_page(s: tauri::State<AppState>, id: String) -> R<()> {
    db::trash_page(&*s.conn.lock().map_err(e)?, &id).map_err(e)
}

#[tauri::command]
fn restore_page(s: tauri::State<AppState>, id: String) -> R<()> {
    db::restore_page(&*s.conn.lock().map_err(e)?, &id).map_err(e)
}

#[tauri::command]
fn purge_page(s: tauri::State<AppState>, id: String) -> R<()> {
    db::purge_page(&*s.conn.lock().map_err(e)?, &id).map_err(e)
}

#[tauri::command]
fn search(s: tauri::State<AppState>, q: String) -> R<Vec<SearchHit>> {
    db::search(&*s.conn.lock().map_err(e)?, &q).map_err(e)
}

/// Guarda una imagen en la carpeta de datos y devuelve su ruta absoluta.
#[tauri::command]
fn save_image(s: tauri::State<AppState>, bytes: Vec<u8>, ext: String) -> R<String> {
    let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(5).collect();
    let ext = if ext.is_empty() { "png".to_string() } else { ext.to_lowercase() };
    let path = s.assets_dir.join(format!("{}.{}", uuid::Uuid::new_v4(), ext));
    std::fs::write(&path, bytes).map_err(e)?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let assets = dir.join("assets");
            std::fs::create_dir_all(&assets)?;
            let conn = db::open(&dir.join("corral.db"))?;
            app.manage(AppState { conn: Mutex::new(conn), assets_dir: assets });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            has_user, register, login, list_pages, get_content, create_page, update_page,
            move_page, trash_page, restore_page, purge_page, search, save_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
