import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const week = parseInt(searchParams.get("week") || "1", 10);

  const { data: ratings, error: ratingsError } = await supabase
    .from("composite_ratings")
    .select("team_id, composite_points, sources_used")
    .eq("season", season)
    .eq("week", week)
    .order("composite_points", { ascending: false });

  if (ratingsError) {
    return NextResponse.json({ error: ratingsError.message }, { status: 500 });
  }

  // Previous week's ranks, so we can show how far each team moved.
  // If this is week 1 (or the prior week has no data yet), movement
  // just comes back null for everyone.
  let previousRankByTeam = {};
  if (week > 1) {
    const { data: prevRatings } = await supabase
      .from("composite_ratings")
      .select("team_id, composite_points")
      .eq("season", season)
      .eq("week", week - 1)
      .order("composite_points", { ascending: false });
    previousRankByTeam = Object.fromEntries(
      (prevRatings || []).map((r, i) => [r.team_id, i + 1])
    );
  }

  const teamIds = ratings.map(r => r.team_id);
  const { data: teams } = await supabase
    .from("teams")
    .select("team_id, school, conference, logo_url")
    .in("team_id", teamIds);
  const teamById = Object.fromEntries((teams || []).map(t => [t.team_id, t]));

  const rows = ratings.map((r, i) => {
    const rank = i + 1;
    const previousRank = previousRankByTeam[r.team_id];
    const movement = previousRank != null ? previousRank - rank : null;
    return {
      rank,
      school: teamById[r.team_id]?.school || "?",
      conference: teamById[r.team_id]?.conference || "",
      logo_url: teamById[r.team_id]?.logo_url || null,
      power_rating: r.composite_points,
      sources_used: r.sources_used,
      movement,
    };
  });

  return NextResponse.json({ rows });
}
