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

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPhase {
    pub id: String,
    pub page_id: String,
    pub name: String,
    pub status: String, // "active" | "other" | "completed"
    pub created_at: i64,
    pub activated_at: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCategory {
    pub id: String,
    pub page_id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: String,
    pub page_id: String,
    pub seq: i64,
    pub title: String,
    pub description: String,
    pub workflow: String,  // "backlog" | "todo" | "doing" | "qa" | "done"
    pub state: String,     // "open" | "blocked" | "closed"
    pub priority: String,  // "urgent" | "high" | "medium" | "low"
    pub task_type: String, // "task" | "epic" | "bug" | "stub"
    pub author: String,
    pub assignee: String,
    pub phase_id: Option<String>,
    pub epic_id: Option<String>,
    pub categories: Vec<String>,
    pub depends_on: Vec<String>,
    pub real_minutes: i64,
    pub ai_minutes: i64,
    pub human_minutes: i64,
    pub via_mcp: bool,
    pub position: f64,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub closed_at: Option<i64>,
    pub comment_count: i64,
}

#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskCreate {
    pub page_id: String,
    pub title: String,
    pub description: Option<String>,
    pub workflow: Option<String>,
    pub state: Option<String>,
    pub priority: Option<String>,
    pub task_type: Option<String>,
    pub author: Option<String>,
    pub assignee: Option<String>,
    pub phase_id: Option<String>,
    pub epic_id: Option<String>,
    pub categories: Option<Vec<String>>,
    pub depends_on: Option<Vec<String>>,
    pub real_minutes: Option<i64>,
    pub ai_minutes: Option<i64>,
    pub human_minutes: Option<i64>,
    pub via_mcp: Option<bool>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub workflow: Option<String>,
    pub state: Option<String>,
    pub priority: Option<String>,
    pub task_type: Option<String>,
    pub assignee: Option<String>,
    /// Cadena vacía = quitar
    pub phase_id: Option<String>,
    /// Cadena vacía = quitar
    pub epic_id: Option<String>,
    pub categories: Option<Vec<String>>,
    pub depends_on: Option<Vec<String>>,
    pub real_minutes: Option<i64>,
    pub ai_minutes: Option<i64>,
    pub human_minutes: Option<i64>,
    pub position: Option<f64>,
    pub actor: Option<String>,
    pub via_mcp: Option<bool>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskActivity {
    pub id: String,
    pub task_id: String,
    pub page_id: String,
    pub kind: String, // "event" | "comment"
    pub author: String,
    pub body: String,
    pub via_mcp: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTrackerData {
    pub tasks: Vec<TaskItem>,
    pub phases: Vec<ProjectPhase>,
    pub categories: Vec<ProjectCategory>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatPoint {
    pub day_start: i64,
    pub label: String,
    pub created: i64,
    pub completed: i64,
    pub closed: i64,
    pub activity: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskTimeEntry {
    pub id: String,
    pub page_id: String,
    pub seq: i64,
    pub title: String,
    pub real_minutes: i64,
    pub ai_minutes: i64,
    pub human_minutes: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatsSummary {
    pub created_count: i64,
    pub completed_count: i64,
    pub closed_count: i64,
    pub activity_count: i64,
    pub real_minutes_total: i64,
    pub ai_minutes_total: i64,
    pub human_minutes_total: i64,
    pub daily: Vec<DailyStatPoint>,
    pub top_time_tasks: Vec<TaskTimeEntry>,
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
         CREATE VIRTUAL TABLE IF NOT EXISTS page_fts USING fts5(page_id UNINDEXED, title, body);

         CREATE TABLE IF NOT EXISTS project_phase(
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'other',
            created_at INTEGER NOT NULL,
            activated_at INTEGER,
            completed_at INTEGER
         );
         CREATE INDEX IF NOT EXISTS idx_phase_page ON project_phase(page_id, created_at DESC);

         CREATE TABLE IF NOT EXISTS project_category(
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_cat_page ON project_category(page_id, name);

         CREATE TABLE IF NOT EXISTS task(
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            workflow TEXT NOT NULL DEFAULT 'todo',
            state TEXT NOT NULL DEFAULT 'open',
            priority TEXT NOT NULL DEFAULT 'medium',
            task_type TEXT NOT NULL DEFAULT 'task',
            author TEXT NOT NULL DEFAULT 'Luccas',
            assignee TEXT NOT NULL DEFAULT 'Luccas',
            phase_id TEXT REFERENCES project_phase(id) ON DELETE SET NULL,
            epic_id TEXT REFERENCES task(id) ON DELETE SET NULL,
            categories_json TEXT NOT NULL DEFAULT '[]',
            depends_on_json TEXT NOT NULL DEFAULT '[]',
            real_minutes INTEGER NOT NULL DEFAULT 0,
            ai_minutes INTEGER NOT NULL DEFAULT 0,
            human_minutes INTEGER NOT NULL DEFAULT 0,
            via_mcp INTEGER NOT NULL DEFAULT 0,
            position REAL NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            completed_at INTEGER,
            closed_at INTEGER
         );
         CREATE INDEX IF NOT EXISTS idx_task_page ON task(page_id, workflow, position);
         CREATE INDEX IF NOT EXISTS idx_task_created ON task(created_at);
         CREATE INDEX IF NOT EXISTS idx_task_completed ON task(completed_at);
         CREATE INDEX IF NOT EXISTS idx_task_closed ON task(closed_at);

         CREATE TABLE IF NOT EXISTS task_activity(
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
            page_id TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
            kind TEXT NOT NULL DEFAULT 'event',
            author TEXT NOT NULL DEFAULT 'Luccas',
            body TEXT NOT NULL,
            via_mcp INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_task_act_task ON task_activity(task_id, created_at DESC);
         CREATE INDEX IF NOT EXISTS idx_task_act_page_time ON task_activity(page_id, created_at);",
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
        .execute([id])?;
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

// ============================================================================
// Task Tracker, Phases, Categories & Statistics
// ============================================================================

const TASK_COLS: &str = "
    t.id, t.page_id, t.seq, t.title, t.description, t.workflow, t.state,
    t.priority, t.task_type, t.author, t.assignee, t.phase_id, t.epic_id,
    t.categories_json, t.depends_on_json, t.real_minutes, t.ai_minutes,
    t.human_minutes, t.via_mcp, t.position, t.created_at, t.updated_at,
    t.completed_at, t.closed_at,
    (SELECT COUNT(*) FROM task_activity a WHERE a.task_id = t.id AND a.kind = 'comment') AS comment_count
";

fn parse_str_vec(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn row_task(r: &rusqlite::Row) -> rusqlite::Result<TaskItem> {
    let cats_raw: String = r.get(13)?;
    let deps_raw: String = r.get(14)?;
    Ok(TaskItem {
        id: r.get(0)?,
        page_id: r.get(1)?,
        seq: r.get(2)?,
        title: r.get(3)?,
        description: r.get(4)?,
        workflow: r.get(5)?,
        state: r.get(6)?,
        priority: r.get(7)?,
        task_type: r.get(8)?,
        author: r.get(9)?,
        assignee: r.get(10)?,
        phase_id: r.get(11)?,
        epic_id: r.get(12)?,
        categories: parse_str_vec(&cats_raw),
        depends_on: parse_str_vec(&deps_raw),
        real_minutes: r.get(15)?,
        ai_minutes: r.get(16)?,
        human_minutes: r.get(17)?,
        via_mcp: r.get::<_, i64>(18)? != 0,
        position: r.get(19)?,
        created_at: r.get(20)?,
        updated_at: r.get(21)?,
        completed_at: r.get(22)?,
        closed_at: r.get(23)?,
        comment_count: r.get(24)?,
    })
}

fn row_phase(r: &rusqlite::Row) -> rusqlite::Result<ProjectPhase> {
    Ok(ProjectPhase {
        id: r.get(0)?,
        page_id: r.get(1)?,
        name: r.get(2)?,
        status: r.get(3)?,
        created_at: r.get(4)?,
        activated_at: r.get(5)?,
        completed_at: r.get(6)?,
    })
}

fn row_category(r: &rusqlite::Row) -> rusqlite::Result<ProjectCategory> {
    Ok(ProjectCategory {
        id: r.get(0)?,
        page_id: r.get(1)?,
        name: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn row_activity(r: &rusqlite::Row) -> rusqlite::Result<TaskActivity> {
    Ok(TaskActivity {
        id: r.get(0)?,
        task_id: r.get(1)?,
        page_id: r.get(2)?,
        kind: r.get(3)?,
        author: r.get(4)?,
        body: r.get(5)?,
        via_mcp: r.get::<_, i64>(6)? != 0,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}

pub fn get_project_tracker(conn: &Connection, page_id: &str) -> rusqlite::Result<ProjectTrackerData> {
    let mut st_tasks = conn.prepare_cached(&format!(
        "SELECT {TASK_COLS} FROM task t WHERE t.page_id = ?1 ORDER BY t.position ASC, t.created_at DESC"
    ))?;
    let tasks = st_tasks.query_map([page_id], row_task)?.collect::<rusqlite::Result<Vec<_>>>()?;

    let mut st_phases = conn.prepare_cached(
        "SELECT id, page_id, name, status, created_at, activated_at, completed_at
         FROM project_phase WHERE page_id = ?1 ORDER BY created_at DESC",
    )?;
    let phases = st_phases.query_map([page_id], row_phase)?.collect::<rusqlite::Result<Vec<_>>>()?;

    let mut st_cats = conn.prepare_cached(
        "SELECT id, page_id, name, created_at
         FROM project_category WHERE page_id = ?1 ORDER BY name ASC",
    )?;
    let categories = st_cats.query_map([page_id], row_category)?.collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(ProjectTrackerData { tasks, phases, categories })
}

pub fn get_task_by_id(conn: &Connection, id: &str) -> rusqlite::Result<TaskItem> {
    let mut st = conn.prepare_cached(&format!("SELECT {TASK_COLS} FROM task t WHERE t.id = ?1"))?;
    st.query_row([id], row_task)
}

pub fn create_task(conn: &Connection, input: TaskCreate) -> rusqlite::Result<TaskItem> {
    let id = uuid::Uuid::new_v4().to_string();
    let act_id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let workflow = input.workflow.unwrap_or_else(|| "todo".into());
    let state = input.state.unwrap_or_else(|| "open".into());
    let priority = input.priority.unwrap_or_else(|| "medium".into());
    let task_type = input.task_type.unwrap_or_else(|| "task".into());
    let author = input.author.unwrap_or_else(|| "Luccas".into());
    let assignee = input.assignee.unwrap_or_else(|| author.clone());
    let description = input.description.unwrap_or_default();
    let cats_json = serde_json::to_string(&input.categories.unwrap_or_default()).unwrap_or_else(|_| "[]".into());
    let deps_json = serde_json::to_string(&input.depends_on.unwrap_or_default()).unwrap_or_else(|_| "[]".into());
    let real_m = input.real_minutes.unwrap_or(0);
    let ai_m = input.ai_minutes.unwrap_or(0);
    let human_m = input.human_minutes.unwrap_or(0);
    let via_mcp = input.via_mcp.unwrap_or(false) as i64;
    let completed_at = if workflow == "done" { Some(now) } else { None };
    let closed_at = if state == "closed" { Some(now) } else { None };

    let tx = conn.unchecked_transaction()?;
    let seq: i64 = tx
        .prepare_cached("SELECT COALESCE(MAX(seq), 0) + 1 FROM task")?
        .query_row([], |r| r.get(0))?;
    let pos: f64 = tx
        .prepare_cached("SELECT COALESCE(MAX(position), 0) + 1 FROM task WHERE page_id = ?1 AND workflow = ?2")?
        .query_row(params![&input.page_id, &workflow], |r| r.get(0))?;

    let phase_id: Option<String> = match input.phase_id.and_then(nz) {
        Some(pid) => Some(pid),
        None => tx
            .prepare_cached("SELECT id FROM project_phase WHERE page_id = ?1 AND status = 'active' LIMIT 1")?
            .query_row([&input.page_id], |r| r.get(0))
            .optional()?,
    };
    let epic_id = input.epic_id.and_then(nz);

    tx.prepare_cached(
        "INSERT INTO task(
            id, page_id, seq, title, description, workflow, state, priority, task_type,
            author, assignee, phase_id, epic_id, categories_json, depends_on_json,
            real_minutes, ai_minutes, human_minutes, via_mcp, position,
            created_at, updated_at, completed_at, closed_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
            ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, ?20,
            ?21, ?21, ?22, ?23
         )",
    )?
    .execute(params![
        &id,
        &input.page_id,
        seq,
        input.title.trim(),
        description,
        &workflow,
        &state,
        &priority,
        &task_type,
        &author,
        &assignee,
        &phase_id,
        &epic_id,
        &cats_json,
        &deps_json,
        real_m,
        ai_m,
        human_m,
        via_mcp,
        pos,
        now,
        completed_at,
        closed_at
    ])?;

    tx.prepare_cached(
        "INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'event', ?4, 'created this task', ?5, ?6, ?6)",
    )?
    .execute(params![act_id, &id, &input.page_id, &author, via_mcp, now])?;

    tx.commit()?;
    get_task_by_id(conn, &id)
}

pub fn update_task(conn: &Connection, id: &str, p: TaskPatch) -> rusqlite::Result<TaskItem> {
    let now = now_ms();
    let current = get_task_by_id(conn, id)?;
    let actor = p.actor.unwrap_or_else(|| "Luccas".into());
    let via_mcp = p.via_mcp.unwrap_or(false) as i64;

    let next_title = p.title.map(|s| s.trim().to_string()).unwrap_or_else(|| current.title.clone());
    let next_desc = p.description.unwrap_or_else(|| current.description.clone());
    let next_workflow = p.workflow.unwrap_or_else(|| current.workflow.clone());
    let next_state = p.state.unwrap_or_else(|| current.state.clone());
    let next_priority = p.priority.unwrap_or_else(|| current.priority.clone());
    let next_type = p.task_type.unwrap_or_else(|| current.task_type.clone());
    let next_assignee = p.assignee.unwrap_or_else(|| current.assignee.clone());
    let next_phase = match p.phase_id {
        Some(s) => nz(s),
        None => current.phase_id.clone(),
    };
    let next_epic = match p.epic_id {
        Some(s) => nz(s),
        None => current.epic_id.clone(),
    };
    let next_cats = p.categories.unwrap_or_else(|| current.categories.clone());
    let next_deps = p.depends_on.unwrap_or_else(|| current.depends_on.clone());
    let cats_json = serde_json::to_string(&next_cats).unwrap_or_else(|_| "[]".into());
    let deps_json = serde_json::to_string(&next_deps).unwrap_or_else(|_| "[]".into());
    let next_real = p.real_minutes.unwrap_or(current.real_minutes);
    let next_ai = p.ai_minutes.unwrap_or(current.ai_minutes);
    let next_human = p.human_minutes.unwrap_or(current.human_minutes);
    let next_pos = p.position.unwrap_or(current.position);

    let completed_at = if next_workflow == "done" {
        current.completed_at.or(Some(now))
    } else {
        None
    };
    let closed_at = if next_state == "closed" {
        current.closed_at.or(Some(now))
    } else {
        None
    };

    let tx = conn.unchecked_transaction()?;
    tx.prepare_cached(
        "UPDATE task SET
            title = ?1,
            description = ?2,
            workflow = ?3,
            state = ?4,
            priority = ?5,
            task_type = ?6,
            assignee = ?7,
            phase_id = ?8,
            epic_id = ?9,
            categories_json = ?10,
            depends_on_json = ?11,
            real_minutes = ?12,
            ai_minutes = ?13,
            human_minutes = ?14,
            position = ?15,
            updated_at = ?16,
            completed_at = ?17,
            closed_at = ?18
         WHERE id = ?19",
    )?
    .execute(params![
        next_title,
        next_desc,
        &next_workflow,
        &next_state,
        next_priority,
        next_type,
        next_assignee,
        next_phase,
        next_epic,
        cats_json,
        deps_json,
        next_real,
        next_ai,
        next_human,
        next_pos,
        now,
        completed_at,
        closed_at,
        id
    ])?;

    if next_workflow != current.workflow {
        let act_id = uuid::Uuid::new_v4().to_string();
        let body = format!("changed workflow status from {} to {}", current.workflow, next_workflow);
        tx.prepare_cached(
            "INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'event', ?4, ?5, ?6, ?7, ?7)",
        )?
        .execute(params![act_id, id, &current.page_id, &actor, body, via_mcp, now])?;
    }

    if next_state != current.state {
        let act_id = uuid::Uuid::new_v4().to_string();
        let body = format!("changed state from {} to {}", current.state, next_state);
        tx.prepare_cached(
            "INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'event', ?4, ?5, ?6, ?7, ?7)",
        )?
        .execute(params![act_id, id, &current.page_id, &actor, body, via_mcp, now])?;
    }

    tx.commit()?;
    get_task_by_id(conn, id)
}

pub fn delete_task(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.prepare_cached("DELETE FROM task WHERE id = ?1")?.execute([id])?;
    Ok(())
}

pub fn list_task_activity(conn: &Connection, task_id: &str) -> rusqlite::Result<Vec<TaskActivity>> {
    let mut st = conn.prepare_cached(
        "SELECT id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at
         FROM task_activity WHERE task_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = st.query_map([task_id], row_activity)?;
    rows.collect()
}

pub fn add_task_comment(
    conn: &Connection,
    task_id: &str,
    author: &str,
    body: &str,
    via_mcp: bool,
) -> rusqlite::Result<TaskActivity> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let page_id: String = conn
        .prepare_cached("SELECT page_id FROM task WHERE id = ?1")?
        .query_row([task_id], |r| r.get(0))?;
    let act = conn
        .prepare_cached(
            "INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'comment', ?4, ?5, ?6, ?7, ?7)
             RETURNING id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at",
        )?
        .query_row(params![id, task_id, page_id, author, body.trim(), via_mcp as i64, now], row_activity)?;
    conn.prepare_cached("UPDATE task SET updated_at = ?1 WHERE id = ?2")?
        .execute(params![now, task_id])?;
    Ok(act)
}

pub fn update_task_comment(conn: &Connection, id: &str, body: &str) -> rusqlite::Result<TaskActivity> {
    let now = now_ms();
    conn.prepare_cached(
        "UPDATE task_activity SET body = ?1, updated_at = ?2 WHERE id = ?3
         RETURNING id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at",
    )?
    .query_row(params![body.trim(), now, id], row_activity)
}

pub fn delete_task_comment(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.prepare_cached("DELETE FROM task_activity WHERE id = ?1")?.execute([id])?;
    Ok(())
}

pub fn create_phase(conn: &Connection, page_id: &str, name: &str, activate: bool) -> rusqlite::Result<ProjectPhase> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let tx = conn.unchecked_transaction()?;
    if activate {
        tx.prepare_cached(
            "UPDATE project_phase SET status = 'other' WHERE page_id = ?1 AND status = 'active'",
        )?
        .execute([page_id])?;
    }
    let status = if activate { "active" } else { "other" };
    let activated_at = if activate { Some(now) } else { None };
    let phase = tx
        .prepare_cached(
            "INSERT INTO project_phase(id, page_id, name, status, created_at, activated_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)
             RETURNING id, page_id, name, status, created_at, activated_at, completed_at",
        )?
        .query_row(params![id, page_id, name.trim(), status, now, activated_at], row_phase)?;
    tx.commit()?;
    Ok(phase)
}

pub fn update_phase_status(conn: &Connection, id: &str, status: &str) -> rusqlite::Result<ProjectPhase> {
    let now = now_ms();
    let tx = conn.unchecked_transaction()?;
    let page_id: String = tx
        .prepare_cached("SELECT page_id FROM project_phase WHERE id = ?1")?
        .query_row([id], |r| r.get(0))?;
    if status == "active" {
        tx.prepare_cached(
            "UPDATE project_phase SET status = 'other' WHERE page_id = ?1 AND status = 'active' AND id != ?2",
        )?
        .execute(params![&page_id, id])?;
    }
    let phase = tx
        .prepare_cached(
            "UPDATE project_phase SET
                status = ?1,
                activated_at = CASE WHEN ?1 = 'active' THEN COALESCE(activated_at, ?2) ELSE activated_at END,
                completed_at = CASE WHEN ?1 = 'completed' THEN ?2 WHEN ?1 = 'active' THEN NULL ELSE completed_at END
             WHERE id = ?3
             RETURNING id, page_id, name, status, created_at, activated_at, completed_at",
        )?
        .query_row(params![status, now, id], row_phase)?;
    tx.commit()?;
    Ok(phase)
}

pub fn delete_phase(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.prepare_cached("DELETE FROM project_phase WHERE id = ?1")?.execute([id])?;
    Ok(())
}

pub fn create_category(conn: &Connection, page_id: &str, name: &str) -> rusqlite::Result<ProjectCategory> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    conn.prepare_cached(
        "INSERT INTO project_category(id, page_id, name, created_at)
         VALUES (?1, ?2, ?3, ?4)
         RETURNING id, page_id, name, created_at",
    )?
    .query_row(params![id, page_id, name.trim().to_uppercase(), now], row_category)
}

pub fn delete_category(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.prepare_cached("DELETE FROM project_category WHERE id = ?1")?.execute([id])?;
    Ok(())
}

const DAY_MS: i64 = 86_400_000;

pub fn get_statistics(
    conn: &Connection,
    page_id: Option<&str>,
    days: i64,
) -> rusqlite::Result<StatsSummary> {
    let days = days.clamp(1, 365);
    let now = now_ms();
    let today_start = (now / DAY_MS) * DAY_MS;
    let start_ms = today_start - (days - 1) * DAY_MS;

    // Cargar tiempos de tareas vivas (de páginas no eliminadas)
    let mut created_times: Vec<i64> = Vec::new();
    let mut completed_times: Vec<i64> = Vec::new();
    let mut closed_times: Vec<i64> = Vec::new();
    let mut real_minutes_total: i64 = 0;
    let mut ai_minutes_total: i64 = 0;
    let mut human_minutes_total: i64 = 0;
    let mut top_time_tasks: Vec<TaskTimeEntry> = Vec::new();

    let mut st_tasks = conn.prepare_cached(
        "SELECT t.id, t.page_id, t.seq, t.title, t.created_at, t.completed_at, t.closed_at,
                t.real_minutes, t.ai_minutes, t.human_minutes
         FROM task t
         JOIN page p ON p.id = t.page_id
         WHERE p.deleted_at IS NULL AND (?1 IS NULL OR t.page_id = ?1)",
    )?;
    let rows = st_tasks.query_map([page_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, Option<i64>>(5)?,
            r.get::<_, Option<i64>>(6)?,
            r.get::<_, i64>(7)?,
            r.get::<_, i64>(8)?,
            r.get::<_, i64>(9)?,
        ))
    })?;

    for row in rows {
        let (id, pid, seq, title, c_at, comp_at, cl_at, rm, aim, hm) = row?;
        if c_at >= start_ms {
            created_times.push(c_at);
        }
        if let Some(t) = comp_at {
            if t >= start_ms {
                completed_times.push(t);
            }
        }
        if let Some(t) = cl_at {
            if t >= start_ms {
                closed_times.push(t);
            }
        }
        real_minutes_total += rm;
        ai_minutes_total += aim;
        human_minutes_total += hm;
        if rm + aim + hm > 0 {
            top_time_tasks.push(TaskTimeEntry {
                id,
                page_id: pid,
                seq,
                title,
                real_minutes: rm,
                ai_minutes: aim,
                human_minutes: hm,
            });
        }
    }

    top_time_tasks.sort_by(|a, b| {
        let ta = a.ai_minutes.max(a.real_minutes).max(a.human_minutes);
        let tb = b.ai_minutes.max(b.real_minutes).max(b.human_minutes);
        tb.cmp(&ta)
    });
    top_time_tasks.truncate(10);

    let mut act_times: Vec<i64> = Vec::new();
    let mut st_act = conn.prepare_cached(
        "SELECT a.created_at
         FROM task_activity a
         JOIN page p ON p.id = a.page_id
         WHERE p.deleted_at IS NULL AND a.created_at >= ?1 AND (?2 IS NULL OR a.page_id = ?2)",
    )?;
    let act_rows = st_act.query_map(params![start_ms, page_id], |r| r.get::<_, i64>(0))?;
    for ts in act_rows {
        act_times.push(ts?);
    }

    let mut daily = Vec::with_capacity(days as usize);
    for i in 0..days {
        let d_start = start_ms + i * DAY_MS;
        let d_end = d_start + DAY_MS;
        let created = created_times.iter().filter(|&&t| t >= d_start && t < d_end).count() as i64;
        let completed = completed_times.iter().filter(|&&t| t >= d_start && t < d_end).count() as i64;
        let closed = closed_times.iter().filter(|&&t| t >= d_start && t < d_end).count() as i64;
        let activity = act_times.iter().filter(|&&t| t >= d_start && t < d_end).count() as i64;
        daily.push(DailyStatPoint {
            day_start: d_start,
            label: format!("D-{}", days - 1 - i),
            created,
            completed,
            closed,
            activity,
        });
    }

    Ok(StatsSummary {
        created_count: created_times.len() as i64,
        completed_count: completed_times.len() as i64,
        closed_count: closed_times.len() as i64,
        activity_count: act_times.len() as i64,
        real_minutes_total,
        ai_minutes_total,
        human_minutes_total,
        daily,
        top_time_tasks,
    })
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

    #[test]
    fn ciclo_completo_tasks_fases_y_estadisticas() {
        let c = mem();
        let p1 = create_page(&c, None).unwrap();
        let p2 = create_page(&c, None).unwrap();

        let ph1 = create_phase(&c, &p1.id, "3.0", true).unwrap();
        assert_eq!(ph1.status, "active");
        let ph2 = create_phase(&c, &p1.id, "3.1", true).unwrap();
        assert_eq!(ph2.status, "active");

        let tracker = get_project_tracker(&c, &p1.id).unwrap();
        let active_count = tracker.phases.iter().filter(|x| x.status == "active").count();
        assert_eq!(active_count, 1);

        let t1 = create_task(
            &c,
            TaskCreate {
                page_id: p1.id.clone(),
                title: "Validate allocated 131k ROCm context".into(),
                priority: Some("high".into()),
                ai_minutes: Some(120),
                real_minutes: Some(45),
                via_mcp: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(t1.seq, 1);
        assert_eq!(t1.phase_id.as_deref(), Some(ph2.id.as_str()));
        assert!(t1.via_mcp);

        let updated = update_task(
            &c,
            &t1.id,
            TaskPatch {
                workflow: Some("done".into()),
                state: Some("closed".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.workflow, "done");
        assert!(updated.completed_at.is_some());
        assert!(updated.closed_at.is_some());

        add_task_comment(&c, &t1.id, "Luccas", "Revisado y validado", true).unwrap();
        let acts = list_task_activity(&c, &t1.id).unwrap();
        assert_eq!(acts.len(), 4); // created + workflow change + state change + comment

        create_task(
            &c,
            TaskCreate {
                page_id: p2.id.clone(),
                title: "Segunda tarea en otro proyecto".into(),
                ai_minutes: Some(60),
                ..Default::default()
            },
        )
        .unwrap();

        let stats_p1 = get_statistics(&c, Some(&p1.id), 30).unwrap();
        assert_eq!(stats_p1.created_count, 1);
        assert_eq!(stats_p1.completed_count, 1);
        assert_eq!(stats_p1.closed_count, 1);
        assert_eq!(stats_p1.ai_minutes_total, 120);

        let stats_all = get_statistics(&c, None, 30).unwrap();
        assert_eq!(stats_all.created_count, 2);
        assert_eq!(stats_all.ai_minutes_total, 180);
    }
}
