import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useStore } from "../store";

function SubpageView({ node }: NodeViewProps) {
  const pageId = node.attrs.pageId as string | null;
  const page = useStore((s) =>
    pageId ? s.pages.find((p) => p.id === pageId && p.deletedAt == null) : undefined,
  );

  if (!page) {
    return <NodeViewWrapper style={{ display: "none" }} />;
  }

  return (
    <NodeViewWrapper className="subpage-block-wrapper" data-drag-handle>
      <div
        className="subpage-block"
        onClick={() => useStore.getState().open(page.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            useStore.getState().open(page.id);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span className="subpage-ico">{page.icon || "📄"}</span>
        <span className="subpage-title">{page.title || "Sin título"}</span>
        <span className="subpage-actions">
          <button
            title="Mover a papelera"
            onClick={(e) => {
              e.stopPropagation();
              void useStore.getState().trash(page.id);
            }}
          >
            ✕
          </button>
          <span className="subpage-arrow">→</span>
        </span>
      </div>
    </NodeViewWrapper>
  );
}

export const SubpageNode = Node.create({
  name: "subpage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="subpage"]',
        getAttrs: (el) => ({
          pageId: (el as HTMLElement).getAttribute("data-page-id"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "subpage",
        "data-page-id": HTMLAttributes.pageId,
      }),
    ];
  },

  renderText({ node }) {
    const p = useStore.getState().pages.find((x) => x.id === node.attrs.pageId);
    return p ? p.title || "Sin título" : "";
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpageView);
  },
});
