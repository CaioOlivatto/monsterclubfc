import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { recordGameTelemetry } from "@/lib/telemetry.functions";

export function GameTelemetry() {
  const location = useLocation();
  const record = useServerFn(recordGameTelemetry);
  const navigationStarted = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const previousRoute = useRef<string | null>(null);
  const sessionRecorded = useRef(false);

  useEffect(() => {
    const duration = Math.max(0, Math.round(performance.now() - navigationStarted.current));
    const route = location.pathname;
    if (route === "/" || route.startsWith("/auth")) {
      navigationStarted.current = performance.now();
      return;
    }
    record({ data: { event: "page_view", route, duration_ms: duration } }).catch(() => undefined);
    if (duration >= 1000)
      record({ data: { event: "slow_page", route, duration_ms: duration } }).catch(() => undefined);
    if (!sessionRecorded.current) {
      record({ data: { event: "session_started", route } }).catch(() => undefined);
      sessionRecorded.current = true;
    }
    if (route === "/onboarding")
      record({ data: { event: "onboarding_started", route } }).catch(() => undefined);
    if (route === "/club") record({ data: { event: "club_viewed", route } }).catch(() => undefined);
    if (previousRoute.current === "/onboarding" && route === "/dashboard") {
      record({ data: { event: "onboarding_completed", route } }).catch(() => undefined);
    }
    previousRoute.current = route;
    navigationStarted.current = performance.now();
  }, [location.pathname, record]);
  return null;
}
