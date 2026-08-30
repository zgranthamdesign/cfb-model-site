import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { gradeGame } from "../../../lib/grading";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function emptyRecord() {
  return { wins: 0, losses: 0, pushes: 0 };
}

function tally(record, result) {
  if (result === "COVER") record.wins += 1;
  else if (result === "NO_COVER") record.losses += 1;
  else if (result === "PUSH") record.pushes += 1;
}

function withPct(record) {
  const decided = record.wins + record.losses;
  const pct = decided > 0 ? record.wins / decided : null;
  return { ...record, pct };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);

  const { data: versionRows, error: versionError } = await supabase
    .from("model_versions")
    .select("version_id")
    .eq("version_name", "v1_preseason")
    .limit(1);

  if (versionError || !versionRows?.length) {
    return NextResponse.json({ error: "Model version not found" }, { status: 500 });
  }
  const versionId = versionRows[0].version_id;

  // Only completed games have a result to grade.
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("game_id, week, home_team_id, away_team_id, completed, home_points, away_points")
    .eq("season", season)
    .eq("completed", true);

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  const teamIds = [...new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]))];
  const { data: teams } = await supabase
    .from("teams")
    .select("team_id, school")
    .in("team_id", teamIds);
  const teamById = Object.fromEntries((teams || []).map(t => [t.team_id, t]));

  const gameIds = games.map(g => g.game_id);
  const { data: lines } = await supabase
    .from("lines")
    .select("game_id, model_spread, market_spread, market_spread_open, model_total, market_total")
    .eq("version_id", versionId)
    .in("game_id", gameIds);
  const lineByGame = Object.fromEntries((lines || []).map(l => [l.game_id, l]));

  const seasonAts = emptyRecord();
  const seasonTotal = emptyRecord();
  const byWeekMap = {};

  for (const g of games) {
    const home = teamById[g.home_team_id];
    const away = teamById[g.away_team_id];
    const line = lineByGame[g.game_id];
    if (!line) continue;

    const { ats_result, total_result } = gradeGame({ home, away, line, game: g });
    if (!ats_result && !total_result) continue;

    if (!byWeekMap[g.week]) {
      byWeekMap[g.week] = { week: g.week, ats: emptyRecord(), total: emptyRecord() };
    }

    if (ats_result) {
      tally(seasonAts, ats_result);
      tally(byWeekMap[g.week].ats, ats_result);
    }
    if (total_result) {
      tally(seasonTotal, total_result);
      tally(byWeekMap[g.week].total, total_result);
    }
  }

  const byWeek = Object.values(byWeekMap)
    .sort((a, b) => a.week - b.week)
    .map(w => ({ week: w.week, ats: withPct(w.ats), total: withPct(w.total) }));

  return NextResponse.json({
    season: {
      ats: withPct(seasonAts),
      total: withPct(seasonTotal),
    },
    byWeek,
  });
}
