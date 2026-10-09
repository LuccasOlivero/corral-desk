import sys
import sqlite3
import json
import time
import uuid

from mcp.server.mcpserver import MCPServer

if len(sys.argv) < 2:
    print("Usage: python server.py <path-to-corral.db>", file=sys.stderr)
    sys.exit(1)

db_path = sys.argv[1]

# Setup server
mcp = MCPServer("corral-mcp", version="0.1.0")

def get_db():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
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
        cur = conn.execute("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page WHERE id = ?", (id,))
        meta = cur.fetchone()
        if not meta:
            return json.dumps({"error": f"Page not found: {id}"})
        cur = conn.execute("SELECT content FROM page WHERE id = ?", (id,))
        content_row = cur.fetchone()
        return json.dumps({
            "meta": dict(meta),
            "content": content_row["content"] if content_row else ""
        }, indent=2)

@mcp.tool()
def corral_create_page(title: str = "", content: str = "", parent_id: str | None = None) -> str:
    """Create a new page in Corral
    Args:
        title: The title of the page
        content: The content of the page
        parent_id: Optional parent page ID
    """
    new_id = str(uuid.uuid4())
    now = now_ms()
    with get_db() as conn:
        if parent_id:
            cur = conn.execute("SELECT COALESCE(MAX(position),0)+1 FROM page WHERE parent_id = ?", (parent_id,))
        else:
            cur = conn.execute("SELECT COALESCE(MAX(position),0)+1 FROM page WHERE parent_id IS NULL")
        pos_row = cur.fetchone()
        pos = pos_row[0] if pos_row else 1
        
        conn.execute("INSERT INTO page(id, parent_id, title, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (new_id, parent_id, title, content, pos, now, now))
        conn.execute("INSERT INTO page_fts(page_id, title, body) VALUES (?, ?, ?)",
                     (new_id, title, content))
        conn.commit()
        
        cur = conn.execute("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page WHERE id = ?", (new_id,))
        meta = cur.fetchone()
        return json.dumps(dict(meta) if meta else {}, indent=2)

@mcp.tool()
def corral_update_page(id: str, title: str | None = None, icon: str | None = None, cover: str | None = None, content: str | None = None, body: str | None = None, favorite: bool | None = None) -> str:
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
    with get_db() as conn:
        cur = conn.execute("SELECT id FROM page WHERE id = ?", (id,))
        if not cur.fetchone():
            return json.dumps({"error": f"Page not found: {id}"})
        
        if title is not None:
            conn.execute("UPDATE page SET title = ? WHERE id = ?", (title, id))
            conn.execute("UPDATE page_fts SET title = ? WHERE page_id = ?", (title, id))
        if icon is not None:
            val = None if icon == "" else icon
            conn.execute("UPDATE page SET icon = ? WHERE id = ?", (val, id))
        if cover is not None:
            val = None if cover == "" else cover
            conn.execute("UPDATE page SET cover = ? WHERE id = ?", (val, id))
        if content is not None:
            conn.execute("UPDATE page SET content = ? WHERE id = ?", (content, id))
        if body is not None:
            conn.execute("UPDATE page_fts SET body = ? WHERE page_id = ?", (body, id))
        if favorite is not None:
            conn.execute("UPDATE page SET favorite = ? WHERE id = ?", (1 if favorite else 0, id))
            
        conn.execute("UPDATE page SET updated_at = ? WHERE id = ?", (now, id))
        conn.commit()
        
        cur = conn.execute("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page WHERE id = ?", (id,))
        meta = cur.fetchone()
        return json.dumps(dict(meta) if meta else {}, indent=2)

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
