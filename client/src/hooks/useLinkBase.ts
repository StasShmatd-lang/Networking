import { useEffect, useState } from "react";

export function useLinkBase() {
  const [base, setBase] = useState(
    () => import.meta.env.VITE_PUBLIC_ORIGIN || window.location.origin,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/link-base")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.linkBase) setBase(String(data.linkBase).replace(/\/$/, ""));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return base;
}
