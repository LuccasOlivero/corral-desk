use rusqlite::{params, Connection};
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
         PRAGMA synchronous=NORMAL;
         PRAGMA temp_store=MEMORY;
         PRAGMA cache_size=-8000;
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
         CREATE INDEX IF NOT EXISTS idx_page_parent_pos ON page(parent_id, position);
         CREATE INDEX IF NOT EXISTS idx_page_order ON page(position, created_at);
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
    let mut st = conn.prepare_cached(&format!("SELECT {META} FROM page ORDER BY position, created_at"))?;
    let rows = st.query_map([], row_meta)?;
    rows.collect()
}

#[cfg(test)]
pub fn get_page_meta(conn: &Connection, id: &str) -> rusqlite::Result<PageMeta> {
    let mut st = conn.prepare_cached(&format!("SELECT {META} FROM page WHERE id=?1"))?;
    st.query_row([id], row_meta)
}

pub fn get_content(conn: &Connection, id: &str) -> rusqlite::Result<String> {
    let mut st = conn.prepare_cached("SELECT content FROM page WHERE id=?1")?;
    st.query_row([id], |r| r.get(0))
}

pub fn create_page(conn: &Connection, parent_id: Option<String>) -> rusqlite::Result<PageMeta> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let tx = conn.unchecked_transaction()?;
    let pos: f64 = tx
        .prepare_cached("SELECT COALESCE(MAX(position),0)+1 FROM page WHERE parent_id IS ?1")?
        .query_row(params![parent_id], |r| r.get(0))?;
    let meta = tx
        .prepare_cached(&format!(
            "INSERT INTO page(id,parent_id,title,position,created_at,updated_at)
             VALUES(?1,?2,'',?3,?4,?4)
             RETURNING {META}"
        ))?
        .query_row(params![id, parent_id, pos, now], row_meta)?;
    tx.prepare_cached("INSERT INTO page_fts(page_id,title,body) VALUES(?1,'','')")?
        .execute([&id])?;
    tx.commit()?;
    Ok(meta)
}

fn nz(s: String) -> Option<String> {
    if s.is_empty() { None } else { Some(s) }
}

pub fn update_page(conn: &Connection, id: &str, p: PagePatch) -> rusqlite::Result<PageMeta> {
    let now = now_ms();
    let has_title = p.title.is_some();
    let has_icon = p.icon.is_some();
    let icon_val = p.icon.and_then(nz);
    let has_cover = p.cover.is_some();
    let cover_val = p.cover.and_then(nz);
    let has_content = p.content.is_some();
    let has_body = p.body.is_some();
    let has_fav = p.favorite.is_some();
    let fav_val = p.favorite.map(|v| v as i64);

    let tx = conn.unchecked_transaction()?;
    let meta = tx
        .prepare_cached(&format!(
            "UPDATE page SET
                title = CASE WHEN ?1 THEN ?2 ELSE title END,
                icon = CASE WHEN ?3 THEN ?4 ELSE icon END,
                cover = CASE WHEN ?5 THEN ?6 ELSE cover END,
                content = CASE WHEN ?7 THEN ?8 ELSE content END,
                favorite = CASE WHEN ?9 THEN ?10 ELSE favorite END,
                updated_at = ?11
             WHERE id = ?12
             RETURNING {META}"
        ))?
        .query_row(
            params![
                has_title,
                p.title.as_deref(),
                has_icon,
                icon_val,
                has_cover,
                cover_val,
                has_content,
                p.content.as_deref(),
                has_fav,
                fav_val,
                now,
                id
            ],
            row_meta,
        )?;

    if has_title || has_body {
        tx.prepare_cached(
            "UPDATE page_fts SET
                title = CASE WHEN ?1 THEN ?2 ELSE title END,
                body = CASE WHEN ?3 THEN ?4 ELSE body END
             WHERE page_id = ?5",
        )?
        .execute(params![has_title, p.title.as_deref(), has_body, p.body.as_deref(), id])?;
    }
    tx.commit()?;
    Ok(meta)
}

/// Evita mover una página dentro de sí misma o de sus descendientes en una sola consulta SQL.
pub fn move_page(
    conn: &Connection,
    id: &str,
    parent_id: Option<String>,
    position: f64,
) -> Result<(), String> {
    if let Some(pid) = parent_id.as_ref() {
        if pid == id {
            return Err("No se puede mover una página dentro de sí misma".into());
        }
        let is_desc: bool = conn
            .prepare_cached(
                "WITH RECURSIVE anc(cur) AS (
                    SELECT parent_id FROM page WHERE id = ?1
                    UNION ALL
                    SELECT p.parent_id FROM page p JOIN anc ON p.id = anc.cur WHERE p.parent_id IS NOT NULL
                 )
                 SELECT EXISTS(SELECT 1 FROM anc WHERE cur = ?2)",
            )
            .map_err(|e| e.to_string())?
            .query_row(params![pid, id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if is_desc {
            return Err("No se puede mover una página dentro de sí misma".into());
        }
    }
    conn.prepare_cached("UPDATE page SET parent_id=?1, position=?2, updated_at=?3 WHERE id=?4")
        .map_err(|e| e.to_string())?
        .execute(params![parent_id, position, now_ms(), id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn trash_page(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let mut st = conn.prepare_cached(
        "WITH RECURSIVE d(id) AS (
            SELECT ?1
            UNION ALL
            SELECT p.id FROM page p JOIN d ON p.parent_id = d.id
         )
         UPDATE page SET deleted_at = ?2
         WHERE id IN (SELECT id FROM d) AND deleted_at IS NULL",
    )?;
    st.execute(params![id, now_ms()])?;
    Ok(())
}

pub fn restore_page(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    // Si el padre sigue en la papelera, la página vuelve a la raíz y restaura todo el subárbol en 1 query
    let mut st = conn.prepare_cached(
        "WITH RECURSIVE d(id) AS (
            SELECT ?1
            UNION ALL
            SELECT p.id FROM page p JOIN d ON p.parent_id = d.id
         )
         UPDATE page
         SET deleted_at = NULL,
             parent_id = CASE
                 WHEN id = ?1 AND EXISTS (
                     SELECT 1 FROM page parent
                     WHERE parent.id = page.parent_id AND parent.deleted_at IS NOT NULL
                 ) THEN NULL
                 ELSE parent_id
             END
         WHERE id IN (SELECT id FROM d)",
    )?;
    st.execute([id])?;
    Ok(())
}

pub fn purge_page(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.prepare_cached(
        "WITH RECURSIVE d(id) AS (
            SELECT ?1
            UNION ALL
            SELECT p.id FROM page p JOIN d ON p.parent_id = d.id
         )
         DELETE FROM page_fts WHERE page_id IN (SELECT id FROM d)",
    )?
    .execute([id])?;
    tx.prepare_cached("DELETE FROM page WHERE id=?1")?
        .execute([id])?; // cascade a hijos
    tx.commit()
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
    let mut st = conn.prepare_cached(
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
