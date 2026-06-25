import { SessionView } from "./SessionView";

interface PageProps {
  params: { sessionId: string };
}

export default function SessionPage({ params }: PageProps) {
  return <SessionView sessionId={params.sessionId} />;
}
