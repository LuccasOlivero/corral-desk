import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import { createLowlight } from "lowlight";
import Details, { DetailsSummary, DetailsContent } from "@tiptap/extension-details";
import { api, peekCachedContent } from "../api";
import { useStore } from "../store";
import { Extension } from "@tiptap/core";
import { SlashCommand } from "./slash";
import { SubpageNode } from "./subpage";
import { optimizeAndSaveImage } from "../utils/image";

const lowlight = createLowlight();
let grammarsPromise: Promise<void> | null = null;

function ensureGrammarsLoaded(onLoaded?: () => void) {
  if (!grammarsPromise) {
    grammarsPromise = import("./lowlightGrammars").then(({ grammars }) => {
      lowlight.register(grammars);
    });
  }
  if (onLoaded) {
    grammarsPromise.then(onLoaded).catch(() => {});
  }
}

const SaveShortcut = Extension.create<{ onSave: (editor: any) => void }>({
  name: "saveShortcut",
  addOptions() {
    return {
      onSave: () => {},
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-s": () => {
        this.options.onSave(this.editor);
        return true;
      },
    };
  },
});

const BASE_EXTENSIONS = [
  StarterKit.configure({ codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({
    HTMLAttributes: {
      loading: "lazy",
      decoding: "async",
    },
  }),
  Highlight.configure({ multicolor: true }),
  Details.configure({ persist: true, HTMLAttributes: { class: "details" } }),
  DetailsSummary,
  DetailsContent,
  SubpageNode,
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === "heading" ? "Encabezado" : "Escribe '/' para ver los comandos…",
  }),
  SlashCommand,
];

function parseDoc(raw: string | undefined): unknown {
  if (!raw) return "";
  try {
    return JSON.parse(raw);
  } catch {
    return "";
  }
}

export interface InsertSubpageDetail {
  parentId: string;
  subpageId: string;
  handled?: boolean;
}

export default memo(function Editor({ pageId }: { pageId: string }) {
  const cachedRaw = peekCachedContent(pageId);
  const [ready, setReady] = useState(cachedRaw !== undefined);
  const timer = useRef<number | undefined>(undefined);
  const idleTimer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const idRef = useRef(pageId);
  idRef.current = pageId;

  const setSaveStatus = useStore((s) => s.setSaveStatus);

  const saveRef = useRef<(editorInstance: any) => void>(() => {});
  saveRef.current = (editorInstance: any) => {
    window.clearTimeout(timer.current);
    window.clearTimeout(idleTimer.current);
    pending.current = false;
    setSaveStatus("saving");
    const content = JSON.stringify(editorInstance.getJSON());
    const body = editorInstance.getText();
    window.dispatchEvent(
      new CustomEvent("corral:content-sync", { detail: { pageId: idRef.current, content } }),
    );
    api
      .updatePage(idRef.current, {
        content,
        body,
      })
      .then(() => {
        setSaveStatus("saved");
        idleTimer.current = window.setTimeout(() => setSaveStatus("idle"), 2000);
      })
      .catch(() => setSaveStatus("idle"));
  };

  const extensions = useMemo(
    () => [
      ...BASE_EXTENSIONS,
      SaveShortcut.configure({ onSave: (ed: any) => saveRef.current(ed) }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: cachedRaw !== undefined ? (parseDoc(cachedRaw) as never) : "",
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        event.preventDefault();
        files.forEach(async (f) => {
          const src = await optimizeAndSaveImage(f, 1600);
          view.dispatch(
            view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })),
          );
        });
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.from;
        files.forEach(async (f) => {
          const src = await optimizeAndSaveImage(f, 1600);
          view.dispatch(
            view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src })),
          );
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      pending.current = true;
      if (useStore.getState().saveStatus !== "idle") {
        setSaveStatus("idle");
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        saveRef.current(editor);
      }, 600);
    },
  });

  // Cargar gramáticas de resaltado en segundo plano sin bloquear el montaje del editor
  useEffect(() => {
    if (!editor) return;
    ensureGrammarsLoaded(() => {
      if (!editor.isDestroyed && editor.state.doc.textContent.length > 0) {
        editor.view.dispatch(editor.state.tr.setMeta("lowlight-loaded", true));
      }
    });
  }, [editor]);

  // Escuchar inserción de subpágina desde la barra de herramientas de PageView
  useEffect(() => {
    if (!editor) return;
    const onInsertSubpage = (ev: Event) => {
      const custom = ev as CustomEvent<InsertSubpageDetail>;
      if (!custom.detail || custom.detail.parentId !== pageId || editor.isDestroyed) return;
      custom.detail.handled = true;
      const endPos = editor.state.doc.content.size;
      editor
        .chain()
        .focus()
        .insertContentAt(endPos, [
          { type: "subpage", attrs: { pageId: custom.detail.subpageId } },
          { type: "paragraph" },
        ])
        .run();
      saveRef.current(editor);
      useStore.getState().open(custom.detail.subpageId);
    };
    window.addEventListener("corral:insert-subpage", onInsertSubpage);
    return () => window.removeEventListener("corral:insert-subpage", onInsertSubpage);
  }, [editor, pageId]);

  // Carga del contenido de la página (usa caché síncrona si ya está disponible)
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const hit = peekCachedContent(pageId);
    if (hit !== undefined) {
      setReady(true);
      window.dispatchEvent(
        new CustomEvent("corral:content-sync", { detail: { pageId, content: hit } }),
      );
    } else {
      setReady(false);
      api.getContent(pageId).then((raw) => {
        if (cancelled || editor.isDestroyed) return;
        editor.commands.setContent(parseDoc(raw) as never, { emitUpdate: false });
        setReady(true);
        window.dispatchEvent(
          new CustomEvent("corral:content-sync", { detail: { pageId, content: raw } }),
        );
      });
    }
    return () => {
      cancelled = true;
      window.clearTimeout(idleTimer.current);
      // Guardar al salir si quedaban cambios sin persistir
      if (pending.current) {
        window.clearTimeout(timer.current);
        pending.current = false;
        const content = JSON.stringify(editor.getJSON());
        api.updatePage(pageId, {
          content,
          body: editor.getText(),
        });
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
});
