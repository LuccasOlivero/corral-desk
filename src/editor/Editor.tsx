import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { common, createLowlight } from "lowlight";
import { convertFileSrc } from "@tauri-apps/api/core";
import Details, { DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { api } from "../api";
import { useStore } from "../store";
import { Extension } from "@tiptap/core";
import { SlashCommand } from "./slash";

const lowlight = createLowlight(common);

const SaveShortcut = Extension.create({
  name: "saveShortcut",
  addKeyboardShortcuts() {
    return {
      "Mod-s": () => {
        this.options.onSave(this.editor);
        return true;
      },
    };
  },
});

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

  const setSaveStatus = useStore((s) => s.setSaveStatus);

  const save = (editorInstance: any) => {
    window.clearTimeout(timer.current);
    pending.current = false;
    setSaveStatus("saving");
    api.updatePage(idRef.current, { content: JSON.stringify(editorInstance.getJSON()), body: editorInstance.getText() })
      .then(() => { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000); })
      .catch(() => setSaveStatus("idle"));
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Highlight.configure({ multicolor: true }),
      Details.configure({ persist: true, HTMLAttributes: { class: "details" } }),
      DetailsSummary,
      DetailsContent,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Encabezado" : "Escribe '/' para ver los comandos…"),
      }),
      SlashCommand,
      SaveShortcut.configure({ onSave: save }),
    ],
    content: "",
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          // el editor se captura en el evento si usamos un ref, pero podemos disparar un evento global o solo guardarlo.
          // dado que no tenemos el objeto editor actualizado acá en el closure inicial, vamos a despachar un evento
          // global y escucharlo en un useEffect, o simplemente ignorarlo acá porque App.tsx ya hace preventDefault
          // y podemos guardar usando un atajo nativo.
          return true;
        }
        return false;
      },
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
      setSaveStatus("idle");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        save(editor);
      }, 600);
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
        <BubbleMenu editor={editor} className="bubble-menu">
          <button onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a80' }).run()} className={editor.isActive('highlight', { color: '#fef08a80' }) ? 'is-active' : ''} style={{ backgroundColor: '#fef08a' }}>A</button>
          <button onClick={() => editor.chain().focus().toggleHighlight({ color: '#bbf7d080' }).run()} className={editor.isActive('highlight', { color: '#bbf7d080' }) ? 'is-active' : ''} style={{ backgroundColor: '#bbf7d0' }}>A</button>
          <button onClick={() => editor.chain().focus().toggleHighlight({ color: '#bfdbfe80' }).run()} className={editor.isActive('highlight', { color: '#bfdbfe80' }) ? 'is-active' : ''} style={{ backgroundColor: '#bfdbfe' }}>A</button>
          <button onClick={() => editor.chain().focus().toggleHighlight({ color: '#fbcfe880' }).run()} className={editor.isActive('highlight', { color: '#fbcfe880' }) ? 'is-active' : ''} style={{ backgroundColor: '#fbcfe8' }}>A</button>
          <button onClick={() => editor.chain().focus().toggleHighlight({ color: '#e9d5ff80' }).run()} className={editor.isActive('highlight', { color: '#e9d5ff80' }) ? 'is-active' : ''} style={{ backgroundColor: '#e9d5ff' }}>A</button>
          <button onClick={() => editor.chain().focus().unsetHighlight().run()} className="rm-hl">Quitar</button>
        </BubbleMenu>
      )}
      {editor && (
        <DragHandle editor={editor}>
          <div className="drag-handle">⋮⋮</div>
        </DragHandle>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
