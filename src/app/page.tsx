import { Suspense } from "react";
import Scheduler, { QueueBoundary } from "@/components/scheduler";

export default function Home() {
  return (
    <Suspense fallback={<div className="app"><p className="boot">Loading posts…</p></div>}>
      <QueueBoundary>
        <Scheduler />
      </QueueBoundary>
    </Suspense>
  );
}
