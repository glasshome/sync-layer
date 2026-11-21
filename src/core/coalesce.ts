/**
 * Runs `work` once for every burst of calls: calls in the same tick share one run, and calls while
 * it runs share one more run after it.
 */
export function coalesce(work: () => Promise<void>): () => void {
  let phase: "idle" | "queued" | "running" | "again" = "idle";
  const done = () => {
    const again = phase === "again";
    phase = again ? "queued" : "idle";
    if (again) queueMicrotask(start);
  };
  const start = () => {
    phase = "running";
    work().then(done, (error: unknown) => {
      console.error("[@glasshome/sync-layer] refresh failed:", error);
      done();
    });
  };
  return () => {
    if (phase === "idle") {
      phase = "queued";
      queueMicrotask(start);
    } else if (phase === "running") phase = "again";
  };
}
