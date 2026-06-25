"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, ArrowUp, Square, X, FileText } from "lucide-react";
import clsx from "clsx";
import { parseFile } from "@/lib/fileParser";
import { formatBytes } from "@/lib/formatters";

interface Props {
  onSend: (text: string, attachedText?: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
}

interface Attachment {
  file: File;
  text: string;
}

export function ChatInputBar({ onSend, onAbort, isStreaming }: Props) {
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [parseStatus, setParseStatus] = useState<"idle" | "parsing" | "error">("idle");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // listen for prefill events from the empty-state suggestion chips
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setValue(detail);
      taRef.current?.focus();
    };
    window.addEventListener("forge:prefill", onPrefill);
    return () => window.removeEventListener("forge:prefill", onPrefill);
  }, []);

  // autosize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [value]);

  const handleFile = async (f: File) => {
    setParseStatus("parsing");
    try {
      const text = await parseFile(f);
      setAttachment({ file: f, text });
      setParseStatus("idle");
    } catch (err) {
      console.error(err);
      setParseStatus("error");
      setTimeout(() => setParseStatus("idle"), 2400);
    }
  };

  const submit = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value, attachment?.text);
    setValue("");
    setAttachment(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-edge px-6 pb-5 pt-4">
      <div
        className={clsx(
          "mx-auto max-w-2xl rounded-md border bg-surface-raised/70 transition focus-within:border-ember/50 focus-within:bg-surface-raised",
          parseStatus === "error" ? "border-red-500/50" : "border-edge",
        )}
      >
        {attachment && (
          <div className="flex items-center gap-2 border-b border-edge/60 px-3 py-2">
            <FileText className="h-3.5 w-3.5 text-ember" strokeWidth={1.6} />
            <span className="truncate text-sm text-parchment">
              {attachment.file.name}
            </span>
            <span className="text-xs text-parchment-mute">
              {formatBytes(attachment.file.size)}
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="ml-auto rounded-xs p-1 text-parchment-mute transition hover:bg-edge hover:text-parchment"
              aria-label="Remove attachment"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            isStreaming
              ? "Generating…"
              : "Reply, refine, or describe a new draft…"
          }
          rows={1}
          disabled={isStreaming}
          className="block max-h-[220px] w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed text-parchment placeholder:text-parchment-mute focus:outline-none disabled:opacity-60"
        />

        <div className="flex items-center gap-1.5 px-2.5 pb-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isStreaming || parseStatus === "parsing"}
            className="rounded-xs p-1.5 text-parchment-mute transition hover:bg-edge hover:text-parchment disabled:opacity-50"
            title="Attach .pdf, .docx, .txt"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" strokeWidth={1.6} />
          </button>

          <span className="text-xs text-parchment-mute">
            {parseStatus === "parsing"
              ? "Parsing…"
              : parseStatus === "error"
                ? "Parse failed — try .pdf .docx .txt"
                : "PDF · DOCX · TXT"}
          </span>

          <span className="ml-auto text-xs text-parchment-mute">
            <kbd className="rounded-xs border border-edge px-1 py-px font-mono text-xs">
              ↩
            </kbd>{" "}
            send ·{" "}
            <kbd className="rounded-xs border border-edge px-1 py-px font-mono text-xs">
              ⇧↩
            </kbd>{" "}
            new line
          </span>

          {isStreaming ? (
            <button
              type="button"
              onClick={onAbort}
              className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-xs border border-edge bg-surface text-parchment-dim transition hover:border-ember/40 hover:text-parchment"
              aria-label="Stop generating"
            >
              <Square className="h-3 w-3 fill-current" strokeWidth={0} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim()}
              className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-xs bg-ember text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface disabled:text-parchment-mute"
              aria-label="Send"
            >
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
