import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// A week stays current for two days after its last kickoff, so Sunday and
// Monday still open on the weekend's results before rolling to the next slate.
const HOLD_MS = 48 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

// The week the site should open on: the week of the next game to kick off,
// counting games that started within the hold window.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const since = new Date(Date.now() - HOLD_MS).toISOString();

  const { data: upcoming, error } = await supabase
    .from("games")
    .select("week")
    .eq("season", season)
    .gte("start_date", since)
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
