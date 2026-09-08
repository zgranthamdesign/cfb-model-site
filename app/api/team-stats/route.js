import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

// Rank of `value` among `allValues`, direction-adjusted so rank 1 is
// always "best" regardless of whether the underlying stat is a
// higher-is-better or lower-is-better one.
function rankOf(value, allValues, higherIsBetter) {
  if (value == null || !allValues) return null;
  const values = allValues.filter(v => v != null);
  if (values.length < 2) return null;
  const better = higherIsBetter
    ? values.filter(v => v > value).length
    : values.filter(v => v < value).length;
  return { rank: better + 1, total: values.length };
}

const SOURCE_FIELDS = {
  our_model: "our_model_z",
  elo: "elo_z",
  srs: "srs_z",
};

function computeSourceRanks(allRatings, teamId) {
  const result = {};
  for (const [label, field] of Object.entries(SOURCE_FIELDS)) {
    const valid = allRatings.filter(r => r[field] != null);
    valid.sort((a, b) => b[field] - a[field]);
    const idx = valid.findIndex(r => r.team_id === teamId);
    result[label] = idx === -1 ? null : { rank: idx + 1, total: valid.length };
  }
  return result;
}

async function getSchedule(season, teamId) {
  const { data: games } = await supabase
    .from("games")
    .select("game_id, week, home_team_id, away_team_id, home_points, away_points, completed")
    .eq("season", season)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("week", { ascending: true });

  if (!games || games.length === 0) return [];

  const opponentIds = [...new Set(
    games.map(g => (g.home_team_id === teamId ? g.away_team_id : g.home_team_id))
  )];
  const { data: opponents } = await supabase
    .from("teams")
    .select("team_id, school, logo_url")
    .in("team_id", opponentIds);
  const opponentById = Object.fromEntries((opponents || []).map(t => [t.team_id, t]));

  return games.map(g => {
    const isHome = g.home_team_id === teamId;
    const opponentId = isHome ? g.away_team_id : g.home_team_id;
    const opponent = opponentById[opponentId];
    const teamScore = isHome ? g.home_points : g.away_points;
    const oppScore = isHome ? g.away_points : g.home_points;
    let result = null;
    if (g.completed && teamScore != null && oppScore != null) {
      result = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "T";
    }
    return {
      week: g.week,
      opponent: opponent?.school || "?",
      opponent_logo: opponent?.logo_url || null,
      home_away: isHome ? "home" : "away",
      team_score: teamScore,
      opp_score: oppScore,
      completed: g.completed,
      result,
    };
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const week = parseInt(searchParams.get("week") || "1", 10);
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

  const schedule = await getSchedule(season, teamRow.team_id);

  const { data: allRatings } = await supabase
    .from("composite_ratings")
    .select("team_id, our_model_z, elo_z, srs_z")
    .eq("season", season)
    .eq("week", week);
  const source_rankings = computeSourceRanks(allRatings || [], teamRow.team_id);

  const { data: fpiRows, count: fpiTotal } = await supabase
    .from("external_ratings")
    .select("team_id, rank", { count: "exact" })
    .eq("season", season)
    .eq("source", "fpi")
    .not("rank", "is", null);
  const fpiRow = (fpiRows || []).find(r => r.team_id === teamRow.team_id);
  source_rankings.fpi = fpiRow ? { rank: fpiRow.rank, total: fpiTotal || (fpiRows || []).length } : null;

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
    return NextResponse.json({ team: teamRow.school, stats: null, note, source_rankings, schedule });
  }

  const { data: allStats } = await supabase
    .from("team_weekly_stats")
    .select("*")
    .eq("season", season)
    .eq("week", stats.week);

  const spPlusTotal = (allStats || []).filter(r => r.sp_plus_rank != null).length;
  source_rankings.sp_plus = stats.sp_plus_rank != null
    ? { rank: stats.sp_plus_rank, total: spPlusTotal }
    : null;

  const ranks = {};
  for (const field of Object.keys(HIGHER_IS_BETTER)) {
    const allValues = (allStats || []).map(r => r[field]);
    ranks[field] = rankOf(stats[field], allValues, HIGHER_IS_BETTER[field]);
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
    ranks,
    note,
    source_rankings,
    schedule,
  });
}
