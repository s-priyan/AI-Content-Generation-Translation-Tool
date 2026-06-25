/**
 * In-process mock of the FastAPI backend so the frontend is fully interactive
 * while backend/ is being built. Implements the same contract as
 * api/endpoints.ts → api.generate / api.parseFile.
 *
 * Behaviour:
 *  - Streams `chat_delta` chunks for ~600ms preamble.
 *  - Streams `artifact_delta` chunks for the body of the draft, wrapped in
 *    <artifact>...</artifact> conceptually (but emitted as separate events,
 *    matching the typed contract in types.gen.ts).
 *  - Sends a final `chat_delta` ("Draft ready — see the Artifact panel →") and
 *    a `done` event.
 */
import type {
  ContentType,
  GenerateChunk,
  GenerateRequest,
  Language,
  ParseFileResponse,
} from "@/api/types.gen";

const FAKE_FILE: ParseFileResponse = {
  filename: "",
  text: "",
  wordCount: 0,
  pageCount: null,
  mimeType: "application/octet-stream",
};

export async function* mockGenerate(
  req: GenerateRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateChunk> {
  const messageId = `m_${Date.now().toString(36)}`;
  const preamble =
    req.currentArtifact === null
      ? `Drafting a ${labelFor(req.contentType)} in ${labelFor(req.language)}…\n`
      : `Refining the ${labelFor(req.contentType)} based on your note…\n`;

  for (const chunk of stream(preamble, 14)) {
    if (signal?.aborted) return;
    await delay(22);
    yield { type: "chat_delta", text: chunk };
  }

  const body = composeArtifact(req);
  for (const chunk of stream(body, 24)) {
    if (signal?.aborted) return;
    await delay(28);
    yield { type: "artifact_delta", text: chunk };
  }

  yield { type: "artifact_done" };

  // Synthesize a "version created" event so the mock matches the real backend
  // contract — the next version number is one more than the artifact-derived
  // version count we keep in this fake stream's closure (always 1 here since
  // the mock has no session history).
  yield {
    type: "version_created",
    versionId: `mockver_${Date.now().toString(36)}`,
    version: req.currentArtifact ? 2 : 1,
    messageId,
  };

  const closer = "\nDraft ready — see the Artifact panel →";
  for (const chunk of stream(closer, 10)) {
    if (signal?.aborted) return;
    await delay(20);
    yield { type: "chat_delta", text: chunk };
  }

  yield { type: "done", messageId };
}

export async function mockParseFile(file: File): Promise<ParseFileResponse> {
  // The real client-side parser handles extraction; this exists only for
  // contract parity. We return the file metadata + a placeholder note.
  return {
    ...FAKE_FILE,
    filename: file.name,
    text: `(parsed locally — ${file.name}, ${file.size} bytes)`,
    wordCount: 0,
    mimeType: file.type || "application/octet-stream",
  };
}

/* ─────────── helpers ─────────── */

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function* stream(text: string, chunkSize: number): Generator<string> {
  let i = 0;
  while (i < text.length) {
    const next = Math.min(text.length, i + chunkSize);
    yield text.slice(i, next);
    i = next;
  }
}

function labelFor(v: ContentType | Language): string {
  const map: Record<string, string> = {
    article: "long-form article",
    crm_email: "CRM email",
    push: "push notification",
    social: "social post",
    en: "English",
    fr: "French",
    ro: "Romanian",
    el: "Greek",
  };
  return map[v] ?? v;
}

function composeArtifact(req: GenerateRequest): string {
  const last = req.messages[req.messages.length - 1]?.content ?? "your topic";
  const topic = last.replace(/\s+/g, " ").slice(0, 80);

  if (req.currentArtifact) {
    // Refinement: pretend to lightly edit existing artifact.
    return `${req.currentArtifact}\n\n*Revision note:* polished phrasing per your last instruction (“${topic}”).`;
  }

  switch (req.contentType) {
    case "article":
      return [
        `# A working draft on ${topic}`,
        ``,
        `*An opening paragraph that sets the stakes — clear, unhurried, and grounded in a single observation. The reader should feel oriented within two sentences.*`,
        ``,
        `## What's actually changing`,
        ``,
        `Three forces are at work. First, the incumbents have stopped pretending the old workflow was fine. Second, the tooling has caught up — finally — to the way teams actually operate. Third, expectations from buyers have shifted; what felt premium two years ago now reads as table-stakes.`,
        ``,
        `## What it means in practice`,
        ``,
        `- **Distribution beats raw quality** when the audience already trusts the channel.`,
        `- **Iteration speed** is now the single most predictive factor for which drafts ship.`,
        `- **Translation** is a first-class concern, not a final-mile chore.`,
        ``,
        `> The teams winning here aren't the ones with the best first drafts — they're the ones who treat every paragraph as a hypothesis.`,
        ``,
        `## Closing`,
        ``,
        `Ship the next version. Refine in public. Translate without ceremony.`,
      ].join("\n");

    case "crm_email":
      return [
        `**Subject:** A small upgrade we thought you'd appreciate`,
        ``,
        `Hi {{first_name}},`,
        ``,
        `Quick note: we've made the workflow you use most a little less painful. Specifically — drafting in your second language no longer requires a round-trip through a separate tool. It's now a single chip on the toolbar.`,
        ``,
        `If you've got two minutes, I'd love your read. The team has been refining this all month, and your feedback last quarter is most of why we shipped it.`,
        ``,
        `**[Try it now →]**`,
        ``,
        `Best,`,
        `The Forge team`,
      ].join("\n");

    case "push":
      return [
        `**Title:** Your draft, in three languages.`,
        ``,
        `**Body:** Translate the article you started yesterday — no copy-paste, no separate tool. Tap to open.`,
      ].join("\n");

    case "social":
      return [
        `Most teams treat translation as the last step.`,
        ``,
        `That's the bug.`,
        ``,
        `When language is a first-class concern from the first draft, the whole workflow gets faster — and the writing gets better, because every phrase has to survive the round-trip.`,
        ``,
        `We rebuilt our editor around that idea. Quietly.`,
      ].join("\n");
  }
}
