"use client";

import { useState } from "react";
import { Copy, Check, Download, X, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { ContentType, Language } from "@/api/types.gen";

const TYPE_LABEL: Record<ContentType, string> = {
  article: "Article",
  crm_email: "CRM Email",
  push: "Push Notification",
  social: "Social Post",
};

const LANG_LABEL: Record<Language, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  ro: "Română",
  el: "Ελληνικά",
};

interface Props {
  contentType: ContentType;
  language: Language;
  artifact: string;
  onClose: () => void;
}

export function ArtifactToolbar({ contentType, language, artifact, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const download = (kind: "txt" | "docx") => {
    const slug = TYPE_LABEL[contentType].toLowerCase().replace(/\s+/g, "-");
    const filename = `${slug}-${language}-${stamp()}.${kind}`;
    if (kind === "txt") {
      triggerDownload(filename, new Blob([artifact], { type: "text/plain;charset=utf-8" }));
    } else {
      // simple .docx fallback — wrap text in a minimal Word XML envelope.
      // Good enough for hand-off; backend will produce real .docx later.
      const xml = wrapMinimalDocx(artifact);
      triggerDownload(
        filename,
        new Blob([xml], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      );
    }
    setMenuOpen(false);
  };

  return (
    <div className="flex h-14 items-center gap-2 border-b border-edge px-5">
      <div className="flex items-center gap-1.5">
        <span className="rounded-xs border border-edge bg-surface-raised px-2 py-1 text-xs uppercase tracking-[0.12em] text-parchment-dim">
          {TYPE_LABEL[contentType]}
        </span>
        <span className="rounded-xs border border-ember/30 bg-ember/10 px-2 py-1 text-xs uppercase tracking-[0.14em] text-ember">
          {language} · {LANG_LABEL[language]}
        </span>
      </div>

      <span className="ml-auto" />

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-xs border border-edge bg-surface px-2.5 py-1.5 text-sm text-parchment-dim transition hover:border-ember/40 hover:text-parchment"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-ember" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xs border border-edge bg-surface px-2.5 py-1.5 text-sm text-parchment-dim transition hover:border-ember/40 hover:text-parchment"
        >
          <Download className="h-3.5 w-3.5" />
          Download
          <ChevronDown className={clsx("h-3 w-3 transition", menuOpen && "rotate-180")} />
        </button>
        {menuOpen && (
          <ul className="absolute right-0 z-30 mt-1.5 w-32 origin-top-right animate-fade-up rounded-xs border border-edge bg-surface-raised py-1 shadow-soft">
            <li>
              <button
                type="button"
                onClick={() => download("txt")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-parchment-dim hover:bg-surface hover:text-parchment"
              >
                <span className="font-mono text-xs text-ember">.txt</span>
                Plain text
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => download("docx")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-parchment-dim hover:bg-surface hover:text-parchment"
              >
                <span className="font-mono text-xs text-ember">.docx</span>
                Word document
              </button>
            </li>
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="rounded-xs p-1.5 text-parchment-mute transition hover:bg-edge hover:text-parchment"
        aria-label="Close artifact panel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Tiny .docx fallback. Real backend will replace this. Wraps the artifact text
 * in a minimal WordprocessingML document — most readers (Word, Pages, Google
 * Docs) accept this, but it has no formatting beyond paragraphs.
 */
function wrapMinimalDocx(text: string): string {
  const paragraphs = text
    .split(/\n+/)
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}</w:body>
</w:document>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
