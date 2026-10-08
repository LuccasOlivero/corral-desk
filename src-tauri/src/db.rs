use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub cover: Option<String>,
    pub position: f64,
    pub favorite: bool,
    pub deleted_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PagePatch {
    pub title: Option<String>,
    /// Cadena vacía = quitar
    pub icon: Option<String>,
    pub cover: Option<String>,
    pub content: Option<String>,
    pub body: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Serialize, Debug)]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub snippet: String,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    Ok(conn)
}

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS user(
            id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, pass_hash TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS page(
            id TEXT PRIMARY KEY,
            parent_id TEXT REFERENCES page(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT '',
            icon TEXT, cover TEXT,
            content TEXT NOT NULL DEFAULT '',
            position REAL NOT NULL DEFAULT 0,
            favorite INTEGER NOT NULL DEFAULT 0,
            deleted_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL);
         CREATE INDEX IF NOT EXISTS idx_page_parent ON page(parent_id);
         CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(page_id UNINDEXED, title, body);",
    )
}

const META: &str = "id,parent_id,title,icon,cover,position,favorite,deleted_at,updated_at";

fn row_meta(r: &rusqlite::Row) -> rusqlite::Result<PageMeta> {
    Ok(PageMeta {
        id: r.get(0)?,
        parent_id: r.get(1)?,
        title: r.get(2)?,
        icon: r.get(3)?,
        cover: r.get(4)?,
        position: r.get(5)?,
        favorite: r.get::<_, i64>(6)? != 0,
        deleted_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}

pub fn list_pages(conn: &Connection) -> rusqlite::Result<Vec<PageMeta>> {
    let mut st = conn.prepare(&format!("SELECT {META} FROM page ORDER BY position, created_at"))?;
    let rows = st.query_map([], row_meta)?;
    rows.collect()
}

pub fn get_page_meta(conn: &Connection, id: &str) -> rusqlite::Result<PageMeta> {
    conn.query_row(&format!("SELECT {META} FROM page WHERE id=?1"), [id], row_meta)
}

pub fn get_content(conn: &Connection, id: &str) -> rusqlite::Result<String> {
    conn.query_row("SELECT content FROM page WHERE id=?1", [id], |r| r.get(0))
}

pub fn create_page(conn: &Connection, parent_id: Option<String>) -> rusqlite::Result<PageMeta> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let pos: f64 = conn.query_row(
        "SELECT COALESCE(MAX(position),0)+1 FROM page WHERE parent_id IS ?1",
        params![parent_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO page(id,parent_id,title,position,created_at,updated_at) VALUES(?1,?2,'',?3,?4,?4)",
        params![id, parent_id, pos, now],
    )?;
    conn.execute(
        "INSERT INTO page_fts(page_id,title,body) VALUES(?1,'','')",
        [&id],
    )?;
    get_page_meta(conn, &id)
}

fn nz(s: String) -> Option<String> {
    if s.is_empty() { None } else { Some(s) }
}

pub fn update_page(conn: &Connection, id: &str, p: PagePatch) -> rusqlite::Result<PageMeta> {
    let now = now_ms();
    if let Some(v) = p.title.as_ref() {
        conn.execute("UPDATE page SET title=?1 WHERE id=?2", params![v, id])?;
        conn.execute("UPDATE page_fts SET title=?1 WHERE page_id=?2", params![v, id])?;
    }
    if let Some(v) = p.icon {
        conn.execute("UPDATE page SET icon=?1 WHERE id=?2", params![nz(v), id])?;
    }
    if let Some(v) = p.cover {
        conn.execute("UPDATE page SET cover=?1 WHERE id=?2", params![nz(v), id])?;
    }
    if let Some(v) = p.content {
        conn.execute("UPDATE page SET content=?1 WHERE id=?2", params![v, id])?;
    }
    if let Some(v) = p.body {
        conn.execute("UPDATE page_fts SET body=?1 WHERE page_id=?2", params![v, id])?;
    }
    if let Some(v) = p.favorite {
        conn.execute("UPDATE page SET favorite=?1 WHERE id=?2", params![v as i64, id])?;
    }
    conn.execute("UPDATE page SET updated_at=?1 WHERE id=?2", params![now, id])?;
    get_page_meta(conn, id)
}

fn descendants(conn: &Connection, id: &str) -> rusqlite::Result<Vec<String>> {
    let mut st = conn.prepare(
        "WITH RECURSIVE d(id) AS (SELECT ?1 UNION ALL SELECT p.id FROM page p JOIN d ON p.parent_id=d.id)
         SELECT id FROM d",
    )?;
    let rows = st.query_map([id], |r| r.get(0))?;
    rows.collect()
}

/// Evita mover una página dentro de sí misma o de sus descendientes.
pub fn move_page(
    conn: &Connection,
    id: &str,
    parent_id: Option<String>,
    position: f64,
) -> Result<(), String> {
    if let Some(pid) = parent_id.as_ref() {
        let d = descendants(conn, id).map_err(|e| e.to_string())?;
        if d.iter().any(|x| x == pid) {
            return Err("No se puede mover una página dentro de sí misma".into());
        }
    }
    conn.execute(
        "UPDATE page SET parent_id=?1, position=?2, updated_at=?3 WHERE id=?4",
        params![parent_id, position, now_ms(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn trash_page(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let now = now_ms();
    for d in descendants(conn, id)? {
        conn.execute(
            "UPDATE page SET deleted_at=?1 WHERE id=?2 AND deleted_at IS NULL",
            params![now, d],
        )?;
    }
    Ok(())
}

pub fn restore_page(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    // si el padre sigue en la papelera, la página vuelve a la raíz
    let parent: Option<String> = conn
        .query_row("SELECT parent_id FROM page WHERE id=?1", [id], |r| r.get(0))
        .optional()?
        .flatten();
    if let Some(pid) = parent {
        let pdel: Option<i64> = conn
            .query_row("SELECT deleted_at FROM page WHERE id=?1", [&pid], |r| r.get(0))
            .optional()?
            .flatten();
        if pdel.is_some() {
            conn.execute("UPDATE page SET parent_id=NULL WHERE id=?1", [id])?;
        }
    }
    for d in descendants(conn, id)? {
        conn.execute("UPDATE page SET deleted_at=NULL WHERE id=?1", [d])?;
    }
    Ok(())
}

pub fn purge_page(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    for d in descendants(conn, id)? {
        conn.execute("DELETE FROM page_fts WHERE page_id=?1", [&d])?;
    }
    conn.execute("DELETE FROM page WHERE id=?1", [id])?; // cascade a hijos
    Ok(())
}

pub fn search(conn: &Connection, q: &str) -> rusqlite::Result<Vec<SearchHit>> {
    let terms: Vec<String> = q
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "")))
        .collect();
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let m = terms.join(" ");
    let mut st = conn.prepare(
        "SELECT p.id, p.title, p.icon, snippet(page_fts, 2, '', '', '…', 10)
         FROM page_fts JOIN page p ON p.id = page_fts.page_id
         WHERE page_fts MATCH ?1 AND p.deleted_at IS NULL
         ORDER BY rank LIMIT 20",
    )?;
    let rows = st.query_map([m], |r| {
        Ok(SearchHit { id: r.get(0)?, title: r.get(1)?, icon: r.get(2)?, snippet: r.get(3)? })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init(&c).unwrap();
        c
    }

    #[test]
    fn crea_anida_y_lista() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        let b = create_page(&c, Some(a.id.clone())).unwrap();
        let l = list_pages(&c).unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(b.parent_id.as_deref(), Some(a.id.as_str()));
    }

    #[test]
    fn papelera_recursiva_y_restaurar() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        let b = create_page(&c, Some(a.id.clone())).unwrap();
        trash_page(&c, &a.id).unwrap();
        assert!(get_page_meta(&c, &b.id).unwrap().deleted_at.is_some());
        restore_page(&c, &a.id).unwrap();
        assert!(get_page_meta(&c, &b.id).unwrap().deleted_at.is_none());
    }

    #[test]
    fn restaurar_hijo_con_padre_en_papelera_va_a_raiz() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        let b = create_page(&c, Some(a.id.clone())).unwrap();
        trash_page(&c, &a.id).unwrap();
        restore_page(&c, &b.id).unwrap();
        assert!(get_page_meta(&c, &b.id).unwrap().parent_id.is_none());
    }

    #[test]
    fn no_mover_dentro_de_si_misma() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        let b = create_page(&c, Some(a.id.clone())).unwrap();
        assert!(move_page(&c, &a.id, Some(b.id.clone()), 1.0).is_err());
        assert!(move_page(&c, &b.id, None, 5.0).is_ok());
    }

    #[test]
    fn purga_borra_hijos() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        create_page(&c, Some(a.id.clone())).unwrap();
        purge_page(&c, &a.id).unwrap();
        assert_eq!(list_pages(&c).unwrap().len(), 0);
    }

    #[test]
    fn busqueda_fts() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        update_page(
            &c,
            &a.id,
            PagePatch {
                title: Some("Recetas".into()),
                body: Some("tarta de manzana con canela".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(search(&c, "manz").unwrap().len(), 1);
        assert_eq!(search(&c, "recet").unwrap().len(), 1);
        assert_eq!(search(&c, "zzz").unwrap().len(), 0);
        trash_page(&c, &a.id).unwrap();
        assert_eq!(search(&c, "manz").unwrap().len(), 0);
    }

    #[test]
    fn icono_vacio_lo_quita() {
        let c = mem();
        let a = create_page(&c, None).unwrap();
        let m = update_page(&c, &a.id, PagePatch { icon: Some("📝".into()), ..Default::default() }).unwrap();
        assert_eq!(m.icon.as_deref(), Some("📝"));
        let m = update_page(&c, &a.id, PagePatch { icon: Some("".into()), ..Default::default() }).unwrap();
        assert!(m.icon.is_none());
    }
}
