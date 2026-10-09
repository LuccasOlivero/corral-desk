import { Extension, Editor, Range } from "@tiptap/core";
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

interface Item {
  title: string;
  desc: string;
  glyph: string;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
}

const chain = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);

export const ITEMS: Item[] = [
  { title: "Texto", desc: "Párrafo normal", glyph: "T", keywords: "texto parrafo text p", run: (e, r) => chain(e, r).setParagraph().run() },
  { title: "Título 1", desc: "Encabezado grande", glyph: "H1", keywords: "titulo h1 heading 1", run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { title: "Título 2", desc: "Encabezado mediano", glyph: "H2", keywords: "titulo h2 heading 2", run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { title: "Título 3", desc: "Encabezado pequeño", glyph: "H3", keywords: "titulo h3 heading 3", run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { title: "Lista", desc: "Lista con viñetas", glyph: "•", keywords: "lista viñetas bullet ul", run: (e, r) => chain(e, r).toggleBulletList().run() },
  { title: "Lista numerada", desc: "Lista ordenada", glyph: "1.", keywords: "numerada ordenada number ol", run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { title: "Tareas", desc: "Lista con casillas", glyph: "☐", keywords: "tareas todo check task", run: (e, r) => chain(e, r).toggleTaskList().run() },
  { title: "Desplegable", desc: "Sección colapsable", glyph: "▶", keywords: "desplegable colapsable toggle details", run: (e, r) => chain(e, r).setDetails().run() },
  { title: "Cita", desc: "Texto destacado", glyph: "❝", keywords: "cita quote blockquote", run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { title: "Código", desc: "Bloque de código", glyph: "</>", keywords: "codigo code pre", run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  { title: "Divisor", desc: "Línea horizontal", glyph: "—", keywords: "divisor linea hr separator", run: (e, r) => chain(e, r).setHorizontalRule().run() },
];

export function filterItems(q: string): Item[] {
  const s = q.trim().toLowerCase();
  if (!s) return ITEMS;
  return ITEMS.filter((i) => i.title.toLowerCase().includes(s) || i.keywords.includes(s));
}

function renderer() {
  let el: HTMLDivElement | null = null;
  let props: SuggestionProps<Item, Item> | null = null;
  let sel = 0;

  const paint = () => {
    if (!el || !props) return;
    el.innerHTML = "";
    if (!props.items.length) {
      const n = document.createElement("div");
      n.className = "none";
      n.textContent = "Sin resultados";
      el.appendChild(n);
    }
    props.items.forEach((it, i) => {
      const b = document.createElement("button");
      b.className = "item" + (i === sel ? " sel" : "");
      b.innerHTML = `<span class="g"></span><span><div class="t"></div><div class="d"></div></span>`;
      (b.querySelector(".g") as HTMLElement).textContent = it.glyph;
      (b.querySelector(".t") as HTMLElement).textContent = it.title;
      (b.querySelector(".d") as HTMLElement).textContent = it.desc;
      b.onmousedown = (ev) => {
        ev.preventDefault();
        props!.command(it);
      };
      el!.appendChild(b);
    });
    el.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
    const r = props.clientRect?.();
    if (r) {
      const h = el.offsetHeight;
      const below = r.bottom + 6 + h < window.innerHeight;
      el.style.left = `${Math.min(r.left, window.innerWidth - 270)}px`;
      el.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    }
  };

  return {
    onStart: (p: SuggestionProps<Item, Item>) => {
      props = p;
      sel = 0;
      el = document.createElement("div");
      el.className = "slash";
      document.body.appendChild(el);
      paint();
    },
    onUpdate: (p: SuggestionProps<Item, Item>) => {
      props = p;
      sel = 0;
      paint();
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!props || !props.items.length) return false;
      if (event.key === "ArrowDown") { sel = (sel + 1) % props.items.length; paint(); return true; }
      if (event.key === "ArrowUp") { sel = (sel - 1 + props.items.length) % props.items.length; paint(); return true; }
      if (event.key === "Enter") { props.command(props.items[sel]); return true; }
      if (event.key === "Escape") { el?.remove(); el = null; return true; }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
    },
  };
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<Item, Item>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowedPrefixes: [" "],
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: renderer,
      }),
    ];
  },
});
