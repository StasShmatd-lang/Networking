import { Suspense } from "react";
import JoinInner from "./JoinInner";

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="shell flex items-center justify-center">
          <p style={{ color: "var(--mute)" }}>Загрузка…</p>
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
