import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// A game still counts as "not finished" for a few hours after kickoff even
// once it's flagged completed, so a slate in progress doesn't roll forward
// mid-Saturday if the results sync runs early.
const IN_PROGRESS_MS = 6 * 60 * 60 * 1000;

// How far back to look at all. Without this, a cancelled game that never gets
// marked completed would pin the site to its week for the rest of the season.
const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

// The week the site should open on: the week of the earliest game that hasn't
// finished yet. That keeps the current week up while its games are still being
// played, then rolls to the next one as soon as they're all final - so the
// week advances on its own, with no date math to keep in sync each season.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const now = Date.now();
  const floor = new Date(now - STALE_MS).toISOString();
  const recent = new Date(now - IN_PROGRESS_MS).toISOString();

  const { data: upcoming, error } = await supabase
    .from("games")
    .select("week")
    .eq("season", season)
    .gte("start_date", floor)
    .or(`completed.eq.false,start_date.gte.${recent}`)
    .order("start_date", { ascending: true })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (upcoming?.length) {
    return NextResponse.json({ week: upcoming[0].week });
  }

  // Season over: open on the final week played.
  const { data: last } = await supabase
    .from("games")
    .select("week")
    .eq("season", season)
    .order("week", { ascending: false })
    .limit(1);

  return NextResponse.json({ week: last?.[0]?.week ?? 1 });
}
