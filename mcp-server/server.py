import sys
import sqlite3
import json
import time
import uuid
import os

from mcp.server.mcpserver import MCPServer

default_db = os.path.expanduser(r"~\AppData\Roaming\com.luccas.corral\corral.db")
if len(sys.argv) >= 2:
    db_path = sys.argv[1]
    if not os.path.exists(db_path) and os.path.exists(default_db):
        db_path = default_db
else:
    db_path = default_db

mcp = MCPServer("corral-mcp", version="0.2.0")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS project_phase(
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'other',
    created_at INTEGER NOT NULL,
    activated_at INTEGER,
    completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS project_category(
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
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
"""

def get_db():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.executescript(SCHEMA_SQL)
    return conn

def now_ms():
    return int(time.time() * 1000)

@mcp.tool()
def corral_list_pages() -> str:
    """List all pages in Corral"""
    with get_db() as conn:
        cur = conn.execute("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page ORDER BY position, created_at")
        rows = [dict(r) for r in cur.fetchall()]
        return json.dumps(rows, indent=2)

@mcp.tool()
def corral_read_page(id: str) -> str:
    """Read the content of a specific page by ID
    Args:
        id: The ID of the page to read
    """
    with get_db() as conn:
        cur = conn.execute(
            "SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at, content FROM page WHERE id = ?",
            (id,),
        )
        row = cur.fetchone()
        if not row:
            return json.dumps({"error": f"Page not found: {id}"})
        data = dict(row)
        content = data.pop("content", "")
        return json.dumps({
            "meta": data,
            "content": content
        }, indent=2)

@mcp.tool()
def corral_create_page(title: str = "", content: str | dict | None = "", parent_id: str | None = None, icon: str | None = None, cover: str | None = None, body: str | None = None) -> str:
    """Create a new page in Corral
    Args:
        title: The title of the page
        content: The content of the page
        parent_id: Optional parent page ID
        icon: Optional icon emoji
        cover: Optional cover image URL or CSS gradient
        body: Optional plain text for full-text search
    """
    new_id = str(uuid.uuid4())
    now = now_ms()
    content_str = json.dumps(content, ensure_ascii=False) if isinstance(content, dict) else (content or "")
    with get_db() as conn:
        cur = conn.execute("SELECT COALESCE(MAX(position),0)+1 FROM page WHERE parent_id IS ?", (parent_id,))
        pos_row = cur.fetchone()
        pos = pos_row[0] if pos_row else 1
        
        search_body = body if body is not None else content_str
        cur = conn.execute(
            """INSERT INTO page(id, parent_id, title, content, icon, cover, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at""",
            (new_id, parent_id, title, content_str, icon, cover, pos, now, now),
        )
        meta = cur.fetchone()
        conn.execute(
            "INSERT INTO page_fts(page_id, title, body) VALUES (?, ?, ?)",
            (new_id, title, search_body),
        )
        conn.commit()
        return json.dumps(dict(meta) if meta else {}, indent=2)

@mcp.tool()
def corral_update_page(id: str, title: str | None = None, icon: str | None = None, cover: str | None = None, content: str | dict | None = None, body: str | None = None, favorite: bool | None = None) -> str:
    """Update an existing page in Corral
    Args:
        id: The ID of the page to update
        title: Optional new title
        icon: Optional new icon (pass "" to clear)
        cover: Optional new cover (pass "" to clear)
        content: Optional new content
        body: Optional plain text version of content for search
        favorite: Optional favorite toggle
    """
    now = now_ms()
    has_title = title is not None
    has_icon = icon is not None
    icon_val = None if icon == "" else icon
    has_cover = cover is not None
    cover_val = None if cover == "" else cover
    has_content = content is not None
    content_val = json.dumps(content, ensure_ascii=False) if isinstance(content, dict) else content
    has_body = body is not None
    has_fav = favorite is not None
    fav_val = (1 if favorite else 0) if has_fav else None

    with get_db() as conn:
        cur = conn.execute(
            """UPDATE page SET
                title = CASE WHEN ? THEN ? ELSE title END,
                icon = CASE WHEN ? THEN ? ELSE icon END,
                cover = CASE WHEN ? THEN ? ELSE cover END,
                content = CASE WHEN ? THEN ? ELSE content END,
                favorite = CASE WHEN ? THEN ? ELSE favorite END,
                updated_at = ?
               WHERE id = ?
               RETURNING id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at""",
            (
                has_title, title,
                has_icon, icon_val,
                has_cover, cover_val,
                has_content, content_val,
                has_fav, fav_val,
                now,
                id,
            ),
        )
        meta = cur.fetchone()
        if not meta:
            return json.dumps({"error": f"Page not found: {id}"})

        if has_title or has_body:
            conn.execute(
                """UPDATE page_fts SET
                    title = CASE WHEN ? THEN ? ELSE title END,
                    body = CASE WHEN ? THEN ? ELSE body END
                   WHERE page_id = ?""",
                (has_title, title, has_body, body, id),
            )
        conn.commit()
        return json.dumps(dict(meta), indent=2)

@mcp.tool()
def corral_search(query: str) -> str:
    """Perform a full-text search across all pages
    Args:
        query: Search query terms
    """
    terms = [f'"{t.replace(chr(34), "")}"*' for t in query.split() if t]
    if not terms:
        return "[]"
    
    match_str = " ".join(terms)
    with get_db() as conn:
        cur = conn.execute('''
            SELECT p.id, p.title, p.icon, snippet(page_fts, 2, '', '', '...', 10) as snippet
            FROM page_fts 
            JOIN page p ON p.id = page_fts.page_id
            WHERE page_fts MATCH ? AND p.deleted_at IS NULL
            ORDER BY rank LIMIT 20
        ''', (match_str,))
        rows = [dict(r) for r in cur.fetchall()]
        return json.dumps(rows, indent=2)

@mcp.tool()
def corral_list_tasks(page_id: str | None = None, workflow: str | None = None, state: str | None = None) -> str:
    """List tasks in Corral (optionally filtered by project page_id, workflow, or state)"""
    with get_db() as conn:
        sql = "SELECT * FROM task WHERE 1=1"
        params = []
        if page_id:
            sql += " AND page_id = ?"
            params.append(page_id)
        if workflow:
            sql += " AND workflow = ?"
            params.append(workflow)
        if state:
            sql += " AND state = ?"
            params.append(state)
        sql += " ORDER BY position ASC, created_at DESC"
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
        return json.dumps(rows, indent=2)

@mcp.tool()
def corral_create_task(
    page_id: str,
    title: str,
    description: str = "",
    workflow: str = "todo",
    state: str = "open",
    priority: str = "medium",
    task_type: str = "task",
    author: str = "Luccas",
    assignee: str = "Luccas",
    categories: list[str] | None = None,
    ai_minutes: int = 0,
    real_minutes: int = 0,
) -> str:
    """Create a task in a project/page (automatically tagged as Posted through the MCP)"""
    tid = str(uuid.uuid4())
    act_id = str(uuid.uuid4())
    now = now_ms()
    completed_at = now if workflow == "done" else None
    closed_at = now if state == "closed" else None
    cats_json = json.dumps(categories or [])
    with get_db() as conn:
        seq = conn.execute("SELECT COALESCE(MAX(seq), 0) + 1 FROM task").fetchone()[0]
        pos = conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM task WHERE page_id = ? AND workflow = ?",
            (page_id, workflow),
        ).fetchone()[0]
        ph_row = conn.execute(
            "SELECT id FROM project_phase WHERE page_id = ? AND status = 'active' LIMIT 1",
            (page_id,),
        ).fetchone()
        phase_id = ph_row["id"] if ph_row else None
        conn.execute(
            """INSERT INTO task(
                id, page_id, seq, title, description, workflow, state, priority, task_type,
                author, assignee, phase_id, categories_json, real_minutes, ai_minutes,
                via_mcp, position, created_at, updated_at, completed_at, closed_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)""",
            (
                tid, page_id, seq, title, description, workflow, state, priority, task_type,
                author, assignee, phase_id, cats_json, real_minutes, ai_minutes,
                pos, now, now, completed_at, closed_at,
            ),
        )
        conn.execute(
            """INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
               VALUES (?, ?, ?, 'event', ?, 'created this task', 1, ?, ?)""",
            (act_id, tid, page_id, author, now, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM task WHERE id = ?", (tid,)).fetchone()
        return json.dumps(dict(row) if row else {}, indent=2)

@mcp.tool()
def corral_update_task(
    id: str,
    workflow: str | None = None,
    state: str | None = None,
    priority: str | None = None,
    title: str | None = None,
    description: str | None = None,
    ai_minutes: int | None = None,
    real_minutes: int | None = None,
    actor: str = "Luccas",
) -> str:
    """Update a task's status, workflow, description, or time metrics via MCP"""
    now = now_ms()
    with get_db() as conn:
        cur = conn.execute("SELECT * FROM task WHERE id = ?", (id,)).fetchone()
        if not cur:
            return json.dumps({"error": f"Task not found: {id}"})
        old = dict(cur)
        nw = workflow if workflow is not None else old["workflow"]
        ns = state if state is not None else old["state"]
        npr = priority if priority is not None else old["priority"]
        nt = title if title is not None else old["title"]
        nd = description if description is not None else old["description"]
        nai = ai_minutes if ai_minutes is not None else old["ai_minutes"]
        nre = real_minutes if real_minutes is not None else old["real_minutes"]
        comp_at = (old["completed_at"] or now) if nw == "done" else None
        clos_at = (old["closed_at"] or now) if ns == "closed" else None
        conn.execute(
            """UPDATE task SET title=?, description=?, workflow=?, state=?, priority=?,
               ai_minutes=?, real_minutes=?, updated_at=?, completed_at=?, closed_at=?
               WHERE id=?""",
            (nt, nd, nw, ns, npr, nai, nre, now, comp_at, clos_at, id),
        )
        if nw != old["workflow"]:
            conn.execute(
                """INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
                   VALUES (?, ?, ?, 'event', ?, ?, 1, ?, ?)""",
                (str(uuid.uuid4()), id, old["page_id"], actor, f"changed workflow status from {old['workflow']} to {nw}", now, now),
            )
        if ns != old["state"]:
            conn.execute(
                """INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
                   VALUES (?, ?, ?, 'event', ?, ?, 1, ?, ?)""",
                (str(uuid.uuid4()), id, old["page_id"], actor, f"changed state from {old['state']} to {ns}", now, now),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM task WHERE id = ?", (id,)).fetchone()
        return json.dumps(dict(row) if row else {}, indent=2)

@mcp.tool()
def corral_add_task_comment(task_id: str, body: str, author: str = "Luccas") -> str:
    """Post a markdown comment on a task via MCP"""
    now = now_ms()
    cid = str(uuid.uuid4())
    with get_db() as conn:
        t = conn.execute("SELECT page_id FROM task WHERE id = ?", (task_id,)).fetchone()
        if not t:
            return json.dumps({"error": f"Task not found: {task_id}"})
        conn.execute(
            """INSERT INTO task_activity(id, task_id, page_id, kind, author, body, via_mcp, created_at, updated_at)
               VALUES (?, ?, ?, 'comment', ?, ?, 1, ?, ?)""",
            (cid, task_id, t["page_id"], author, body, now, now),
        )
        conn.execute("UPDATE task SET updated_at = ? WHERE id = ?", (now, task_id))
        conn.commit()
        row = conn.execute("SELECT * FROM task_activity WHERE id = ?", (cid,)).fetchone()
        return json.dumps(dict(row) if row else {}, indent=2)

if __name__ == "__main__":
    mcp.run()
