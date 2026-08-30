import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Whether a HIGHER raw value is better for each stat. Defensive rate
// stats (points/success/explosiveness allowed) are better when LOWER,
// so those get inverted when turned into a percentile.
const HIGHER_IS_BETTER = {
  off_epa_per_play: true,
  def_epa_per_play: false,
  off_success_rate: true,
  def_success_rate: false,
  off_explosiveness: true,
  def_explosiveness: false,
  off_ppa: true,
  def_ppa: false,
  off_epa_rush: true,
  off_epa_pass: true,
  def_epa_rush: false,
  def_epa_pass: false,
  def_havoc_rate: true,
  sp_plus_rating: true,
  sp_plus_offense: true,
  sp_plus_defense: false,
  talent_composite: true,
};

// Percentile of `value` among `allValues`, direction-adjusted so a
// higher percentile always means "better", regardless of whether the
// underlying stat is a higher-is-better or lower-is-better one.
function percentileOf(value, allValues, higherIsBetter) {
  if (value == null || !allValues || allValues.length < 2) return null;
  const values = allValues.filter(v => v != null);
  if (values.length < 2) return null;
  const below = values.filter(v => v < value).length;
  const equal = values.filter(v => v === value).length;
  let pct = (below + equal / 2) / values.length;
  if (!higherIsBetter) pct = 1 - pct;
  return pct;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const team = searchParams.get("team");

  if (!team) {
    return NextResponse.json({ error: "team is required" }, { status: 400 });
  }

  const { data: teamRow, error: teamError } = await supabase
    .from("teams")
    .select("team_id, school, conference, logo_url")
    .eq("school", team)
    .single();

  if (teamError || !teamRow) {
    return NextResponse.json({ error: "team not found" }, { status: 404 });
  }

  const { data: noteRow } = await supabase
    .from("team_notes")
    .select("note")
    .eq("team_id", teamRow.team_id)
    .eq("season", season)
    .maybeSingle();
  const note = noteRow?.note || null;

  const { data: stats, error: statsError } = await supabase
    .from("team_weekly_stats")
    .select("*")
    .eq("season", season)
    .eq("team_id", teamRow.team_id)
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 500 });
  }

  if (!stats) {
    return NextResponse.json({ team: teamRow.school, stats: null, note });
  }

  // Pull every team's stats for that same week so we can rank this
  // team's numbers against the field.
  const { data: allStats } = await supabase
    .from("team_weekly_stats")
    .select("*")
    .eq("season", season)
    .eq("week", stats.week);

  const percentiles = {};
  for (const field of Object.keys(HIGHER_IS_BETTER)) {
    const allValues = (allStats || []).map(r => r[field]);
    percentiles[field] = percentileOf(stats[field], allValues, HIGHER_IS_BETTER[field]);
  }

  return NextResponse.json({
    team: teamRow.school,
    conference: teamRow.conference,
    logo_url: teamRow.logo_url,
    week: stats.week,
    games_played: stats.games_played,
    efficiency: {
      off_epa_per_play: stats.off_epa_per_play,
      def_epa_per_play: stats.def_epa_per_play,
      off_success_rate: stats.off_success_rate,
      def_success_rate: stats.def_success_rate,
      off_explosiveness: stats.off_explosiveness,
      def_explosiveness: stats.def_explosiveness,
      off_ppa: stats.off_ppa,
      def_ppa: stats.def_ppa,
      off_epa_rush: stats.off_epa_rush,
      off_epa_pass: stats.off_epa_pass,
      def_epa_rush: stats.def_epa_rush,
      def_epa_pass: stats.def_epa_pass,
      plays_per_game: stats.plays_per_game,
      def_havoc_rate: stats.def_havoc_rate,
    },
    sp_plus: {
      rating: stats.sp_plus_rating,
      offense: stats.sp_plus_offense,
      defense: stats.sp_plus_defense,
    },
    talent: {
      composite: stats.talent_composite,
    },
    percentiles,
    note,
  });
}
