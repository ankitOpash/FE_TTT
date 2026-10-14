import { Suspense } from "react";
import Scheduler from "@/components/scheduler";
import { QueueBoundary } from "@/components/queue-boundary";

export default function Home() {
  return (
    <Suspense fallback={<div className="app"><p className="boot">Loading posts…</p></div>}>
      <QueueBoundary>
        <Scheduler />
      </QueueBoundary>
    </Suspense>
  );
}
