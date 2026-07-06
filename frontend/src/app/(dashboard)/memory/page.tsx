"use client";

import { Header } from "@/components/dashboard/Header";
import { MemoryExplorer } from "@/components/memory/MemoryExplorer";

export default function MemoryPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Memory"
        subtitle="Persistent knowledge and preferences"
      />
      <div className="flex-1 overflow-y-auto p-6">
        <MemoryExplorer />
      </div>
    </div>
  );
}
