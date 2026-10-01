"use client";

import MDEditor from "@uiw/react-md-editor";
import { getCommands } from "@uiw/react-md-editor/commands-cn";
import "@uiw/react-md-editor/markdown-editor.css";

const commands = getCommands();

/** 仅编辑区。预览由弹窗的查看态负责，所以关掉自带的分屏/全屏按钮。 */
export function NoteEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      data-color-mode="dark"
      className="h-full text-foreground [--color-accent-fg:var(--primary)] [--color-border-default:var(--border)] [--color-canvas-default:var(--background)] [--color-danger-fg:var(--destructive)] [--color-fg-default:var(--foreground)] [--color-neutral-muted:var(--muted)] [--md-editor-background-color:var(--background)] [--md-editor-box-shadow-color:var(--border)] [--md-editor-font-family:inherit]"
    >
      <MDEditor
        value={value}
        preview="edit"
        height="100%"
        visibleDragbar={false}
        commands={commands}
        extraCommands={[]}
        textareaProps={{
          maxLength: 2000,
          placeholder: "支持 Markdown，例如 **加粗**、- 列表、- [ ] 待办",
          "aria-label": "备注 Markdown",
        }}
        onChange={(next) => onChange(next ?? "")}
      />
    </div>
  );
}
