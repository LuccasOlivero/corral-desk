import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const dbPath = process.argv[2];
if (!dbPath) {
    console.error("Usage: node index.js <path-to-corral.db>");
    process.exit(1);
}

const db = new Database(dbPath, { fileMustExist: true });
db.pragma("journal_mode = WAL");

const server = new McpServer({
    name: "corral-mcp",
    version: "0.1.0",
});

function nowMs(): number {
    return Date.now();
}

server.tool(
    "corral_list_pages",
    "List all pages in Corral",
    {},
    () => {
        const stmt = db.prepare("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page ORDER BY position, created_at");
        const rows = stmt.all();
        return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
    }
);

server.tool(
    "corral_read_page",
    "Read the content of a specific page by ID",
    {
        id: z.string().describe("The ID of the page to read"),
    },
    ({ id }) => {
        const stmtMeta = db.prepare("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page WHERE id = ?");
        const meta = stmtMeta.get(id) as any;
        
        if (!meta) {
            return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
        }

        const stmtContent = db.prepare("SELECT content FROM page WHERE id = ?");
        const contentRow = stmtContent.get(id) as any;

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    meta,
                    content: contentRow?.content || ""
                }, null, 2)
            }]
        };
    }
);

server.tool(
    "corral_create_page",
    "Create a new page in Corral",
    {
        parent_id: z.string().optional().describe("The ID of the parent page (optional)"),
        title: z.string().optional().describe("The title of the new page"),
        content: z.string().optional().describe("The content of the new page")
    },
    ({ parent_id, title, content }) => {
        const id = uuidv4();
        const now = nowMs();
        
        const maxPosStmt = db.prepare("SELECT COALESCE(MAX(position),0)+1 as pos FROM page WHERE parent_id IS ?");
        const posRow = maxPosStmt.get(parent_id || null) as any;
        const pos = posRow?.pos || 1;

        const insertPage = db.prepare("INSERT INTO page(id, parent_id, title, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
        insertPage.run(id, parent_id || null, title || "", content || "", pos, now, now);

        const insertFts = db.prepare("INSERT INTO page_fts(page_id, title, body) VALUES (?, ?, ?)");
        // body could be derived from content (plain text version), but we can just use content for now if not provided explicitly
        insertFts.run(id, title || "", content || "");

        const stmtMeta = db.prepare("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page WHERE id = ?");
        const meta = stmtMeta.get(id);

        return {
            content: [{ type: "text", text: JSON.stringify(meta, null, 2) }]
        };
    }
);

server.tool(
    "corral_update_page",
    "Update an existing page in Corral",
    {
        id: z.string().describe("The ID of the page to update"),
        title: z.string().optional(),
        icon: z.string().optional().describe("Pass an empty string to remove the icon"),
        cover: z.string().optional().describe("Pass an empty string to remove the cover"),
        content: z.string().optional(),
        body: z.string().optional().describe("Plain text version of content for full-text search"),
        favorite: z.boolean().optional()
    },
    (patch) => {
        const { id } = patch;
        const now = nowMs();
        
        const stmtCheck = db.prepare("SELECT id FROM page WHERE id = ?");
        if (!stmtCheck.get(id)) {
            return { content: [{ type: "text", text: `Page not found: ${id}` }], isError: true };
        }

        const runUpdate = db.transaction(() => {
            if (patch.title !== undefined) {
                db.prepare("UPDATE page SET title = ? WHERE id = ?").run(patch.title, id);
                db.prepare("UPDATE page_fts SET title = ? WHERE page_id = ?").run(patch.title, id);
            }
            if (patch.icon !== undefined) {
                const val = patch.icon === "" ? null : patch.icon;
                db.prepare("UPDATE page SET icon = ? WHERE id = ?").run(val, id);
            }
            if (patch.cover !== undefined) {
                const val = patch.cover === "" ? null : patch.cover;
                db.prepare("UPDATE page SET cover = ? WHERE id = ?").run(val, id);
            }
            if (patch.content !== undefined) {
                db.prepare("UPDATE page SET content = ? WHERE id = ?").run(patch.content, id);
            }
            if (patch.body !== undefined) {
                db.prepare("UPDATE page_fts SET body = ? WHERE page_id = ?").run(patch.body, id);
            }
            if (patch.favorite !== undefined) {
                db.prepare("UPDATE page SET favorite = ? WHERE id = ?").run(patch.favorite ? 1 : 0, id);
            }
            db.prepare("UPDATE page SET updated_at = ? WHERE id = ?").run(now, id);
        });

        runUpdate();

        const stmtMeta = db.prepare("SELECT id, parent_id, title, icon, cover, position, favorite, deleted_at, updated_at FROM page WHERE id = ?");
        const meta = stmtMeta.get(id);

        return {
            content: [{ type: "text", text: JSON.stringify(meta, null, 2) }]
        };
    }
);

server.tool(
    "corral_search",
    "Perform a full-text search across all pages",
    {
        query: z.string().describe("Search query terms")
    },
    ({ query }) => {
        const terms = query.split(/\s+/).filter(t => t.length > 0).map(t => `"${t.replace(/"/g, "")}"*`);
        if (terms.length === 0) {
            return { content: [{ type: "text", text: "[]" }] };
        }

        const matchStr = terms.join(" ");
        const stmt = db.prepare(`
            SELECT p.id, p.title, p.icon, snippet(page_fts, 2, '', '', '…', 10) as snippet
            FROM page_fts 
            JOIN page p ON p.id = page_fts.page_id
            WHERE page_fts MATCH ? AND p.deleted_at IS NULL
            ORDER BY rank LIMIT 20
        `);

        const rows = stmt.all(matchStr);
        return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }]
        };
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Corral MCP Server running on stdio");
}

main().catch(console.error);
