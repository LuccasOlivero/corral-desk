import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import Editor from "../editor/Editor";
import { api } from "../api";
import { convertFileSrc } from "@tauri-apps/api/core";

const EMOJIS = "📄 📝 📒 📚 📌 📎 ✅ ⭐ 💡 🔥 🚀 🎯 🧠 💻 🛠️ 🧪 🎨 🎵 🎬 📷 🏠 🌱 🌍 ☕ 🍎 ✈️ 💰 📅 ❤️ 🐏 🐑 🧩 🔖 📊 🗂️ 🔒 🔑 🎓 🏋️ 🍳".split(" ");

const COVERS = [
  "linear-gradient(135deg,#cba6f7,#89b4fa)",
  "linear-gradient(135deg,#f38ba8,#fab387)",
  "linear-gradient(135deg,#a6e3a1,#89dceb)",
  "linear-gradient(135deg,#f9e2af,#f5c2e7)",
  "linear-gradient(135deg,#313244,#585b70)",
  "linear-gradient(135deg,#8839ef,#1e66f5)",
];

export default function PageView({ id }: { id: string }) {
  const page = useStore((s) => s.pages.find((p) => p.id === id));
  const patch = useStore((s) => s.patch);
  const [title, setTitle] = useState(page?.title ?? "");
  const [picker, setPicker] = useState(false);
  const t = useRef<number | undefined>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(page?.title ?? "");
    setPicker(false);
    if (page && !page.title) titleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!page) return null;

  const onTitle = (v: string) => {
    setTitle(v);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => patch(id, { title: v }), 250);
  };
  const cycleCover = () => {
    const i = COVERS.indexOf(page.cover ?? "");
    patch(id, { cover: COVERS[(i + 1) % COVERS.length] });
  };
  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
    const path = await api.saveImage(Array.from(buf), ext);
    const src = convertFileSrc(path);
    patch(id, { cover: `url('${src}')` });
  };

  return (
    <>
      {page.cover && (
        <div className="cover" style={{ backgroundImage: page.cover }}>
          <div className="cover-actions">
            <button className="btn" onClick={() => fileInputRef.current?.click()}>Cambiar</button>
            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }} onChange={handleUploadCover} />
            <button className="btn" onClick={() => patch(id, { cover: "" })}>Quitar</button>
          </div>
        </div>
      )}
      <div className={"page" + (page.cover ? " has-cover" : "")} style={{ position: "relative" }}>
        {page.icon && <div className="page-ico" onClick={() => setPicker(!picker)}>{page.icon}</div>}
        <div className="page-tools">
          {!page.icon && <button className="btn" onClick={() => setPicker(!picker)}>＋ Ícono</button>}
          {!page.cover && <button className="btn" onClick={cycleCover}>＋ Portada</button>}
          <button className="btn" onClick={() => patch(id, { favorite: !page.favorite })}>
            {page.favorite ? "★ Favorita" : "☆ Favorito"}
          </button>
        </div>
        {picker && (
          <div className="emoji-pop">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { patch(id, { icon: e }); setPicker(false); }}>{e}</button>
            ))}
            {page.icon && <button className="rm" onClick={() => { patch(id, { icon: "" }); setPicker(false); }}>Quitar ícono</button>}
          </div>
        )}
        <input
          ref={titleRef}
          className="title"
          placeholder="Sin título"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onBlur={() => {
            window.clearTimeout(t.current);
            patch(id, { title });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.querySelector<HTMLElement>(".tiptap")?.focus(); } }}
        />
        <Editor key={id} pageId={id} />
      </div>
    </>
  );
}
