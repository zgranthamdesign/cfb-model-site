import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Stat lines and per-stat point contributions behind one game's expected
// score, written by sync_expected_scores.py. Fetched on demand when the
// breakdown modal opens, so /api/lines stays light.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const gameId = parseInt(searchParams.get("game_id") || "", 10);
  if (!gameId) {
    return NextResponse.json({ error: "game_id is required" }, { status: 400 });
  }

  // live=1: the in-game (halftime) breakdown from sync_live_expected.py,
  // which has the same details shape.
  const live = searchParams.get("live") === "1";
  const { data, error } = live
    ? await supabase
        .from("live_expected_scores")
        .select("game_id, away_expected, home_expected, as_of_period, details")
        .eq("game_id", gameId)
        .limit(1)
    : await supabase
        .from("expected_scores")
        .select("game_id, away_expected, home_expected, garbage_time, overtime, details")
        .eq("game_id", gameId)
        .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.length || !data[0].details) {
    return NextResponse.json({ error: "No breakdown for this game yet" }, { status: 404 });
  }
  return NextResponse.json(data[0]);
}
