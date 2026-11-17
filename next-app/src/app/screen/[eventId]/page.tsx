import { Suspense } from "react";
import ScreenInner from "./ScreenInner";

export default function ScreenPage() {
  return (
    <Suspense
      fallback={
        <div className="shell-hall flex items-center justify-center">
          <p className="text-xl" style={{ color: "var(--mute)" }}>
            Подключаем экран зала…
          </p>
        </div>
      }
    >
      <ScreenInner />
    </Suspense>
  );
}
