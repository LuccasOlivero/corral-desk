import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { common, createLowlight } from "lowlight";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../api";
import { SlashCommand } from "./slash";

const lowlight = createLowlight(common);

async function storeImage(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
  const path = await api.saveImage(Array.from(buf), ext);
  return convertFileSrc(path);
}

export default function Editor({ pageId }: { pageId: string }) {
  const [ready, setReady] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const idRef = useRef(pageId);
  idRef.current = pageId;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Título" : "Escribe '/' para ver los comandos…"),
      }),
      SlashCommand,
    ],
    content: "",
    editorProps: {
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach(async (f) => {
          const src = await storeImage(f);
          view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })));
        });
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        files.forEach(async (f) => {
          const src = await storeImage(f);
          view.dispatch(view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src })));
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      pending.current = true;
      window.clearTimeout(timer.current);
      const id = idRef.current;
      timer.current = window.setTimeout(() => {
        pending.current = false;
        api.updatePage(id, { content: JSON.stringify(editor.getJSON()), body: editor.getText() });
      }, 400);
    },
  });

  // carga del contenido de la página
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    setReady(false);
    api.getContent(pageId).then((raw) => {
      if (cancelled) return;
      let doc: unknown = "";
      try { doc = raw ? JSON.parse(raw) : ""; } catch { doc = ""; }
      editor.commands.setContent(doc as never, { emitUpdate: false });
      setReady(true);
    });
    return () => {
      cancelled = true;
      // guardar al salir si quedaban cambios sin persistir
      if (pending.current) {
        window.clearTimeout(timer.current);
        pending.current = false;
        api.updatePage(pageId, { content: JSON.stringify(editor.getJSON()), body: editor.getText() });
      }
    };
  }, [editor, pageId]);

  return (
    <div style={{ opacity: ready ? 1 : 0 }}>
      {editor && (
        <DragHandle editor={editor}>
          <div className="drag-handle">⋮⋮</div>
        </DragHandle>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
