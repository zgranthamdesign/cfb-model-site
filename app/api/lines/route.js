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
    .select("game_id, home_team_id, away_team_id, start_date")
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

  const gameIds = games.map(g => g.game_id);
  const { data: lines } = await supabase
    .from("lines")
    .select("game_id, model_spread, market_spread, market_spread_open, model_total, market_total, market_total_open, favorite_tag, underdog_tag, home_is_favorite, key_number_note, market_spread_books")
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

    return {
      game_id: g.game_id,
      home_team: home?.school || "?",
      away_team: away?.school || "?",
      home_logo: home?.logo_url || null,
      away_logo: away?.logo_url || null,
      conference: home?.conference || "",
      start_date: g.start_date || null,
      model_spread: line.model_spread ?? null,
      market_spread: line.market_spread ?? null,
      market_spread_open: line.market_spread_open ?? null,
      model_total: line.model_total ?? null,
      market_total: line.market_total ?? null,
      market_total_open: line.market_total_open ?? null,
      home_tag,
      away_tag,
      key_number_note: line.key_number_note ?? null,
      home_books,
      away_books,
    };
  });

  return NextResponse.json({ rows, lastSynced });
}
