import sys
import sqlite3
import json
import time
import uuid

from mcp.server.mcpserver import MCPServer

import os

default_db = os.path.expanduser(r"~\AppData\Roaming\com.luccas.corral\corral.db")
if len(sys.argv) >= 2:
    db_path = sys.argv[1]
    if not os.path.exists(db_path) and os.path.exists(default_db):
        db_path = default_db
else:
    db_path = default_db

# Setup server
mcp = MCPServer("corral-mcp", version="0.1.0")

def get_db():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA foreign_keys=ON;")
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

if __name__ == "__main__":
    mcp.run()
