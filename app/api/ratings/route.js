import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);

  const { data: ratings, error: ratingsError } = await supabase
    .from("composite_ratings")
    .select("team_id, composite_points, sources_used")
    .eq("season", season)
    .order("composite_points", { ascending: false });

  if (ratingsError) {
    return NextResponse.json({ error: ratingsError.message }, { status: 500 });
  }

  const teamIds = ratings.map(r => r.team_id);
  const { data: teams } = await supabase
    .from("teams")
    .select("team_id, school, conference, logo_url")
    .in("team_id", teamIds);
  const teamById = Object.fromEntries((teams || []).map(t => [t.team_id, t]));

  const rows = ratings.map((r, i) => ({
    rank: i + 1,
    school: teamById[r.team_id]?.school || "?",
    conference: teamById[r.team_id]?.conference || "",
    logo_url: teamById[r.team_id]?.logo_url || null,
    power_rating: r.composite_points,
    sources_used: r.sources_used,
  }));

  return NextResponse.json({ rows });
}
