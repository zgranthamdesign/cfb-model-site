import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { gradeGame } from "../../../lib/grading";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const week = parseInt(searchParams.get("week") || "1", 10);

  // Pull the model_versions id for our active model
  const { data: versionRows, error: versionError } = await supabase
    .from("model_versions")
    .select("version_id")
    .eq("version_name", "v1_preseason")
    .limit(1);

  if (versionError || !versionRows?.length) {
    return NextResponse.json({ error: "Model version not found" }, { status: 500 });
  }
  const versionId = versionRows[0].version_id;

  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("game_id, home_team_id, away_team_id, start_date, completed, home_points, away_points")
    .eq("season", season)
    .eq("week", week);

  if (gamesError) {
    return NextResponse.json({ error: gamesError.message }, { status: 500 });
  }

  const teamIds = [...new Set(games.flatMap(g => [g.home_team_id, g.away_team_id]))];
  const { data: teams } = await supabase
    .from("teams")
    .select("team_id, school, conference, logo_url")
    .in("team_id", teamIds);
  const teamById = Object.fromEntries((teams || []).map(t => [t.team_id, t]));

  // Power ratings and rank, computed league-wide (not just this week's
  // teams) so the rank number reflects the full 130+ team field.
  const { data: allRatings } = await supabase
    .from("composite_ratings")
    .select("team_id, composite_points")
    .eq("season", season)
    .order("composite_points", { ascending: false });
  const ratingByTeam = Object.fromEntries((allRatings || []).map(r => [r.team_id, r.composite_points]));
  const rankByTeam = Object.fromEntries((allRatings || []).map((r, i) => [r.team_id, i + 1]));

  const gameIds = games.map(g => g.game_id);
  const { data: lines } = await supabase
    .from("lines")
    .select(`
      game_id, model_spread, market_spread, market_spread_open,
      model_total, market_total, market_total_open,
      favorite_tag, underdog_tag, home_is_favorite,
      key_number_note, key_number_margin, key_number_tier,
      home_win_prob, market_spread_books
    `)
    .eq("version_id", versionId)
    .in("game_id", gameIds);
  const lineByGame = Object.fromEntries((lines || []).map(l => [l.game_id, l]));

  const { data: syncRows } = await supabase
    .from("sync_status")
    .select("last_synced_at")
    .eq("job_name", "market_lines")
    .limit(1);
  const lastSynced = syncRows?.[0]?.last_synced_at || null;

  const rows = games.map(g => {
    const home = teamById[g.home_team_id];
    const away = teamById[g.away_team_id];
    const line = lineByGame[g.game_id] || {};

    // favorite_tag/underdog_tag are stored relative to who the MARKET
    // favors (home_is_favorite), not relative to home/away directly.
    // Map them onto home/away here so the frontend doesn't need to know
    // that convention.
    let home_tag = null;
    let away_tag = null;
    if (line.favorite_tag != null && line.home_is_favorite != null) {
      home_tag = line.home_is_favorite ? line.favorite_tag : line.underdog_tag;
      away_tag = line.home_is_favorite ? line.underdog_tag : line.favorite_tag;
    }

    // market_spread_books is stored as {book_name: home_relative_spread}.
    // Derive the away-relative version by flipping the sign, so the
    // frontend can show each side's own breakdown without doing math.
    let home_books = null;
    let away_books = null;
    if (line.market_spread_books) {
      home_books = line.market_spread_books;
      away_books = Object.fromEntries(
        Object.entries(line.market_spread_books).map(([book, spread]) => [book, -spread])
      );
    }

    // Individual projected score per team, derived from the model's
    // spread (home-relative) and total: H+A=total, H-A=-spread.
    let home_projected_score = null;
    let away_projected_score = null;
    if (line.model_spread != null && line.model_total != null) {
      home_projected_score = (line.model_total - line.model_spread) / 2;
      away_projected_score = (line.model_total + line.model_spread) / 2;
    }

    // Plain market line, relative to whoever the MARKET favors (for the
    // "Spread:" row), e.g. "USC -39".
    let market_favorite_team = null;
    let market_spread_favorite = null;
    let market_spread_open_favorite = null;
    if (line.market_spread != null && home && away) {
      const home_is_favorite = line.market_spread < 0;
      market_favorite_team = home_is_favorite ? home.school : away.school;
      market_spread_favorite = -Math.abs(line.market_spread);
      if (line.market_spread_open != null) {
        market_spread_open_favorite = home_is_favorite ? line.market_spread_open : -line.market_spread_open;
      }
    }

    const { bet_team, bet_spread, bet_spread_open, ats_result, total_pick, total_result } = gradeGame({ home, away, line, game: g });

    // Only surface the "Model Bet" line when the edge is real, not just
    // rounding noise. Below ~1 point of disagreement isn't worth a bet.
    const EDGE_THRESHOLD = 1;
    let show_spread_bet = false;
    if (line.market_spread != null && line.model_spread != null && home && away) {
      const home_is_favorite = line.market_spread < 0;
      const market_favorite_spread = Math.abs(line.market_spread);
      const model_favorite_spread = home_is_favorite ? -line.model_spread : line.model_spread;
      show_spread_bet = Math.abs(model_favorite_spread - market_favorite_spread) >= EDGE_THRESHOLD;
    }
    let show_total_bet = false;
    if (line.model_total != null && line.market_total != null) {
      show_total_bet = Math.abs(line.model_total - line.market_total) >= EDGE_THRESHOLD;
    }

    // Only surface a key number badge for the highest tier (KEY++),
    // per how the site should display it.
    const key_number_margin = line.key_number_tier === "KEY++" ? line.key_number_margin : null;
    const key_number_tier = line.key_number_tier === "KEY++" ? line.key_number_tier : null;

    // Who does the model favor, and by how much / what win probability.
    let projected_winner = null;
    let projected_margin = null;
    if (line.model_spread != null) {
      projected_winner = line.model_spread < 0 ? home?.school : away?.school;
      projected_margin = Math.abs(line.model_spread);
    }
    let projected_win_pct = null;
    if (line.home_win_prob != null) {
      const homeFavored = line.model_spread != null ? line.model_spread < 0 : true;
      projected_win_pct = homeFavored ? line.home_win_prob : 1 - line.home_win_prob;
    }

    return {
      game_id: g.game_id,
      home_team: home?.school || "?",
      away_team: away?.school || "?",
      home_logo: home?.logo_url || null,
      away_logo: away?.logo_url || null,
      home_power_rating: ratingByTeam[g.home_team_id] ?? null,
      away_power_rating: ratingByTeam[g.away_team_id] ?? null,
      home_power_rank: rankByTeam[g.home_team_id] ?? null,
      away_power_rank: rankByTeam[g.away_team_id] ?? null,
      home_projected_score,
      away_projected_score,
      completed: g.completed ?? false,
      home_final_score: g.home_points ?? null,
      away_final_score: g.away_points ?? null,
      ats_result,
      total_pick,
      total_result,
      conference: home?.conference || "",
      start_date: g.start_date || null,
      model_spread: line.model_spread ?? null,
      market_spread: line.market_spread ?? null,
      market_spread_open: line.market_spread_open ?? null,
      market_favorite_team,
      market_spread_favorite,
      market_spread_open_favorite,
      bet_team,
      bet_spread,
      bet_spread_open,
      show_spread_bet,
      show_total_bet,
      model_total: line.model_total ?? null,
      market_total: line.market_total ?? null,
      market_total_open: line.market_total_open ?? null,
      home_tag,
      away_tag,
      key_number_note: line.key_number_note ?? null,
      key_number_margin,
      key_number_tier,
      projected_winner,
      projected_margin,
      projected_win_pct,
      home_books,
      away_books,
    };
  });

  return NextResponse.json({ rows, lastSynced, totalTeams: allRatings?.length || null });
}
