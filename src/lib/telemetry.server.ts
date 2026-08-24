/* eslint-disable @typescript-eslint/no-explicit-any */

export async function recordTelemetryBestEffort(
  supabase: any,
  event: string,
  route: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  try {
    await supabase.rpc("record_game_telemetry", {
      p_event: event,
      p_route: route,
      p_duration_ms: null,
      p_metadata: metadata,
    });
  } catch {
    // Telemetria nunca pode impedir uma ação do jogo.
  }
}
