import { SessionSidebar } from "@/components/sidebar/SessionSidebar";
import { SeedHydrator } from "./SeedHydrator";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SeedHydrator />
      <SessionSidebar />
      <main className="flex flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
