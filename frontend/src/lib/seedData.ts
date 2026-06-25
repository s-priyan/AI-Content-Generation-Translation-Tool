import type { Session } from "@/api/types.gen";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const empty = (
  partial: Pick<Session, "id" | "title" | "createdAt" | "contentType" | "language">,
): Session => ({
  ...partial,
  artifact: null,
  messages: [],
  versions: [],
});

export const SEED_SESSIONS: Session[] = [
  empty({
    id: "seed-1",
    title: "Quarterly newsletter — spring product update",
    createdAt: hoursAgo(2),
    contentType: "crm_email",
    language: "en",
  }),
  empty({
    id: "seed-2",
    title: "Push for re-engagement on dormant accounts",
    createdAt: hoursAgo(7),
    contentType: "push",
    language: "en",
  }),
  empty({
    id: "seed-3",
    title: "Article — translation as a first-class workflow concern",
    createdAt: hoursAgo(26),
    contentType: "article",
    language: "en",
  }),
  empty({
    id: "seed-4",
    title: "Social — how we shipped the editor rebuild",
    createdAt: hoursAgo(50),
    contentType: "social",
    language: "en",
  }),
  empty({
    id: "seed-5",
    title: "CRM — onboarding day-3 nudge (FR variant)",
    createdAt: hoursAgo(72),
    contentType: "crm_email",
    language: "fr",
  }),
  empty({
    id: "seed-6",
    title: "Push notification — Greek market launch",
    createdAt: hoursAgo(120),
    contentType: "push",
    language: "el",
  }),
  empty({
    id: "seed-7",
    title: "Article — Romanian SMB content strategy",
    createdAt: hoursAgo(168),
    contentType: "article",
    language: "ro",
  }),
];
