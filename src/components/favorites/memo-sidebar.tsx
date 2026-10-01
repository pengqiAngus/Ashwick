"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { ChevronsUpIcon, Loader2Icon, PencilIcon, PlusIcon, StickyNoteIcon, Trash2Icon } from "lucide-react";
import { code } from "@streamdown/code";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { MemoDto } from "@/lib/types";
import { cn } from "@/lib/utils";

const NoteEditor = dynamic(() => import("./note-editor").then((m) => m.NoteEditor), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="加载中" className="flex flex-col gap-2 p-3">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  ),
});

const plugins = { code };
const STORAGE_KEY = "memo-panel-open";

type DialogState = {
  mode: "view" | "edit";
  memo: MemoDto | null;
  draft: string;
};

function snippet(md: string) {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || "（无文字内容）";
}

function sortMemos(list: MemoDto[]) {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function MemoSidebar({ initialMemos, loadError }: { initialMemos: MemoDto[]; loadError: string | null }) {
  const [collapsed, setCollapsed] = useState(true);
  const [memos, setMemos] = useState(initialMemos);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const shownRef = useRef<DialogState | null>(null);
  const [saving, startSaving] = useTransition();
  if (dialog) shownRef.current = dialog;
  const shown = dialog ?? shownRef.current;

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(false);
  }, []);

  const persist = (next: boolean) => {
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
  };

  const openCreate = () => setDialog({ mode: "edit", memo: null, draft: "" });
  const openMemo = (memo: MemoDto) => setDialog({ mode: "view", memo, draft: memo.body });

  const save = () => {
    if (!dialog) return;
    const { memo, draft } = dialog;
    startSaving(async () => {
      try {
        if (memo) {
          const res = await apiFetch<{ memo: MemoDto }>(`/api/memos/${encodeURIComponent(memo.id)}`, {
            method: "PUT",
            body: JSON.stringify({ body: draft }),
          });
          setMemos((list) => sortMemos([res.memo, ...list.filter((m) => m.id !== res.memo.id)]));
          setDialog((cur) => (cur?.memo?.id === res.memo.id ? { mode: "view", memo: res.memo, draft: res.memo.body } : cur));
          toast.success("已保存备注");
        } else {
          const res = await apiFetch<{ memo: MemoDto }>("/api/memos", {
            method: "POST",
            body: JSON.stringify({ body: draft }),
          });
          setMemos((list) => sortMemos([res.memo, ...list]));
          setDialog((cur) => (cur && cur.memo == null ? null : cur));
          toast.success("已添加备注");
        }
      } catch (err) {
        toast.error(errorMessage(err, "保存备注失败"));
      }
    });
  };

  const remove = () => {
    if (!dialog?.memo || saving) return;
    if (!window.confirm("删除这条备注？")) return;
    const id = dialog.memo.id;
    startSaving(async () => {
      try {
        await apiFetch(`/api/memos/${encodeURIComponent(id)}`, { method: "DELETE" });
        setMemos((list) => list.filter((m) => m.id !== id));
        setDialog(null);
        toast.success("已删除备注");
      } catch (err) {
        toast.error(errorMessage(err, "删除备注失败"));
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => persist(!collapsed)}
        aria-expanded={!collapsed}
        aria-controls="memo-sidebar"
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs shadow-panel outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <StickyNoteIcon className="size-3.5" aria-hidden />
        备注
        <span className="text-muted-foreground tabular-nums">{memos.length}</span>
      </button>
      {collapsed ? null : (
        <aside
          id="memo-sidebar"
          aria-label="全局备注"
          className="absolute top-full right-0 z-30 mt-5 flex max-h-[min(36rem,calc(100dvh-8rem))] w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-border bg-popover p-3 text-foreground shadow-panel"
        >
          <div className="flex items-center gap-1">
            <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
              <StickyNoteIcon className="size-3.5 text-muted-foreground" aria-hidden />
              备注
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{memos.length}</span>
            </h2>
            <Button type="button" size="sm" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" aria-hidden />
              新增
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="收起备注" className="text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => persist(true)}>
              <ChevronsUpIcon aria-hidden />
            </Button>
          </div>
          {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
          {memos.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">还没有备注。点「新增」写一条，会保存在这里。</p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto" aria-label="全局备注列表">
              {memos.map((memo) => (
                <li key={memo.id}>
                  <button
                    type="button"
                    onClick={() => openMemo(memo)}
                    className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-muted p-2.5 text-left text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="line-clamp-3 text-xs leading-relaxed">{snippet(memo.body)}</span>
                    <time dateTime={memo.updatedAt} className="text-[11px] text-muted-foreground tabular-nums">
                      修改于 {formatDateTime(memo.updatedAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      <Dialog open={dialog != null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="flex h-[min(44rem,calc(100vh-2rem))] max-w-[calc(100%-2rem)] flex-col sm:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle>{shown?.memo ? "备注" : "新备注"}</DialogTitle>
            <DialogDescription>
              {shown?.memo
                ? `修改于 ${formatDateTime(shown.memo.updatedAt)}${shown.mode === "edit" ? " · 保存后更新修改时间" : ""}`
                : "Markdown 编辑，保存后出现在侧边栏"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-background/50 ring-1 ring-foreground/6">
            {shown?.mode === "edit" ? (
              <NoteEditor value={shown.draft} onChange={(draft) => setDialog((cur) => (cur ? { ...cur, draft } : cur))} />
            ) : (
              <div className="h-full overflow-auto p-4" aria-label="备注预览">
                {shown?.memo?.body.trim() ? (
                  <Streamdown className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" plugins={plugins}>
                    {shown.memo.body}
                  </Streamdown>
                ) : (
                  <p className="text-sm text-muted-foreground">还没有备注。</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className={cn(shown?.mode === "view" && shown.memo && "sm:justify-between")}>
            {shown?.mode === "edit" ? (
              <span className="mr-auto self-center text-xs text-muted-foreground tabular-nums">{shown.draft.length}/2000</span>
            ) : null}
            {shown?.mode === "view" && shown.memo ? (
              <Button type="button" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={saving} onClick={remove}>
                <Trash2Icon data-icon="inline-start" aria-hidden />
                删除
              </Button>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {shown?.mode === "view" ? (
                <>
                  <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
                  <Button
                    type="button"
                    onClick={() => setDialog((cur) => (cur ? { ...cur, mode: "edit", draft: cur.memo?.body ?? "" } : cur))}
                  >
                    <PencilIcon data-icon="inline-start" aria-hidden />
                    编辑
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                      setDialog((cur) => {
                        if (!cur?.memo) return null;
                        return { ...cur, mode: "view", draft: cur.memo.body };
                      })
                    }
                  >
                    取消
                  </Button>
                  <Button type="button" disabled={saving} onClick={save}>
                    {saving ? <Loader2Icon className="animate-spin" data-icon="inline-start" aria-hidden /> : null}
                    {saving ? "保存中" : "保存"}
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
