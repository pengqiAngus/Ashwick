"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Loader2Icon, PencilIcon, StickyNoteIcon } from "lucide-react";
import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export function NoteDialog({
  symbol,
  title,
  note,
  onSave,
}: {
  symbol: string;
  title: string;
  note: string;
  onSave: (note: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState(note);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setMode("view");
    setDraft(note);
  }, [open, note]);

  const save = () => {
    const next = draft.trim();
    startSaving(async () => {
      const ok = await onSave(next);
      if (ok) setMode("view");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className={cn("gap-1.5", note && "text-primary")} />}>
        <StickyNoteIcon data-icon="inline-start" aria-hidden />
        备注
      </DialogTrigger>
      <DialogContent className="flex h-[min(44rem,calc(100vh-2rem))] max-w-[calc(100%-2rem)] flex-col sm:max-w-4xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{title} 备注</DialogTitle>
          <DialogDescription>{mode === "view" ? "Markdown 预览" : "Markdown 编辑，保存后回到预览"}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-background/50 ring-1 ring-foreground/6">
          {mode === "view" ? (
            <div className="h-full overflow-auto p-4" aria-label={`${symbol} 备注预览`}>
              {note.trim() ? (
                <Streamdown className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" plugins={plugins}>
                  {note}
                </Streamdown>
              ) : (
                <p className="text-sm text-muted-foreground">还没有备注。</p>
              )}
            </div>
          ) : (
            <NoteEditor value={draft} onChange={setDraft} />
          )}
        </div>
        <DialogFooter>
          {mode === "edit" ? <span className="mr-auto self-center text-xs text-muted-foreground tabular-nums">{draft.length}/2000</span> : null}
          {mode === "view" ? (
            <>
              <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
              <Button
                type="button"
                onClick={() => {
                  setDraft(note);
                  setMode("edit");
                }}
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
                onClick={() => {
                  setDraft(note);
                  setMode("view");
                }}
              >
                取消
              </Button>
              <Button type="button" disabled={saving} onClick={save}>
                {saving ? <Loader2Icon className="animate-spin" data-icon="inline-start" aria-hidden /> : null}
                {saving ? "保存中" : "保存"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
