import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Dimensions compared head to head. Finishing and ball security are left out:
// both are mostly noise game to game, so an "edge" there isn't one.
const DIMS = [
  { key: "moving", label: "Moving the ball", off: "scoring-range offense", def: "scoring-range defense" },
  { key: "run", label: "Run game", off: "run game", def: "run defense" },
  { key: "pass", label: "Pass game", off: "passing game", def: "pass defense" },
  { key: "schedule", label: "Staying on schedule", off: "down-to-down offense", def: "down-to-down defense" },
];

// Percentile gap (offense minus defense) that counts as an edge.
const EDGE = 15;
const BIG_EDGE = 40;
// Both sides this good or better: a strength-vs-strength battle.
const STRONG = 70;
const CAUSE_PHRASE = {
  finishing: "red-zone finishing",
  turnovers: "turnover luck",
  other: "return and defensive scores",
};

// The biggest cause pushing the gap in its own direction.
function mainCause(l) {
  const dir = Math.sign(l.ahead) || 1;
  const best = Object.entries(l.parts || {})
    .filter(([, v]) => Math.sign(v) === dir)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  return best ? CAUSE_PHRASE[best[0]] : null;
}
// Below this many FBS games for either team, the screen is an early read.
const SETTLED_GAMES = 3;

function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${s}`;
}

function edgeLabel(edge) {
  const size = Math.abs(edge);
  if (size < EDGE) return "even";
  return size >= BIG_EDGE ? "big" : "edge";
}

// One possession: this offense against that defense, dimension by dimension.
function possession(offTeam, offProfile, defTeam, defProfile) {
  const byKey = p => Object.fromEntries(p.dimensions.map(d => [d.key, d]));
  const o = byKey(offProfile);
  const d = byKey(defProfile);
  return DIMS.map(dim => {
    const off = o[dim.key]?.off || {};
    const def = d[dim.key]?.def || {};
    const edge = off.pct != null && def.pct != null ? off.pct - def.pct : null;
    return {
      key: dim.key,
      label: dim.label,
      off,
      def,
      edge,
      size: edge == null ? null : edgeLabel(edge),
      // Which team the edge favors: the offense when positive.
      favors: edge == null || Math.abs(edge) < EDGE ? null : edge > 0 ? offTeam : defTeam,
      offPhrase: dim.off,
      defPhrase: dim.def,
      offTeam,
      defTeam,
    };
  });
}

function withValue(side) {
  return side.value ? `${side.value}, ${ordinal(side.rank)}` : ordinal(side.rank);
}

// Plain-sentence "things to look for", biggest edges first.
function lookFors(rows, profiles) {
  const notes = [];
  const bySize = list => list.filter(r => r.edge != null && Math.abs(r.edge) >= EDGE)
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  // Each possession's biggest edge first, so a lopsided game still shows
  // where the other side can hurt them; then the next biggest overall.
  const byPossession = [...new Set(rows.map(r => r.offTeam))].map(t => bySize(rows.filter(r => r.offTeam === t)));
  const picked = byPossession.map(list => list[0]).filter(Boolean);
  for (const r of bySize(rows)) {
    if (picked.length >= 3) break;
    if (!picked.includes(r)) picked.push(r);
  }
  picked.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

  for (const r of picked) {
    const tag = r.size === "big" ? "Big edge" : "Edge";
    const text = r.edge > 0
      ? `${r.offTeam}'s ${r.offPhrase} (${withValue(r.off)}) vs. ${r.defTeam}'s ${r.defPhrase} (${ordinal(r.def.rank)})`
      : `${r.defTeam}'s ${r.defPhrase} (${ordinal(r.def.rank)}) should slow ${r.offTeam}'s ${r.offPhrase} (${ordinal(r.off.rank)})`;
    notes.push({ tag, tone: "edge", text });
  }

  const battle = rows.find(r => r.off.pct >= STRONG && r.def.pct >= STRONG);
  if (battle) {
    notes.push({
      tag: "Strength vs. strength",
      tone: "watch",
      text: `${battle.offTeam}'s ${battle.offPhrase} (${ordinal(battle.off.rank)}) against ${battle.defTeam}'s ${battle.defPhrase} (${ordinal(battle.def.rank)})`,
    });
  }

  // Only when the gap is bigger than normal game-to-game noise.
  for (const [team, p] of profiles) {
    const l = p.ledger;
    if (!l?.significant) continue;
    const cause = mainCause(l);
    notes.push({
      tag: "Results vs. play",
      tone: l.ahead > 0 ? "warn" : "edge",
      text: `${team}'s results have run ${Math.abs(l.ahead).toFixed(1)} points per game ${l.ahead > 0 ? "ahead of" : "behind"} its play${cause ? `, mostly from ${cause}` : ""}`,
    });
  }

  for (const [team, p] of profiles) {
    const slip = (p.trend || []).find(t => t.direction !== "steady");
    if (slip) {
      notes.push({
        tag: "Trend",
        tone: slip.direction === "improving" ? "edge" : "warn",
        text: `${team}: ${slip.label.toLowerCase()} ${slip.direction} (${slip.season} season, ${slip.recent} last 2)`,
      });
      break;
    }
  }
  return notes.slice(0, 5);
}

// Head-to-head matchup for one game, built from both teams' profiles
// (sync_team_profiles.py). Profiles are season to date, so for a completed
// game they include that game.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const gameId = parseInt(searchParams.get("game_id") || "", 10);
  if (!gameId) return NextResponse.json({ error: "game_id is required" }, { status: 400 });

  const { data: games } = await supabase.from("games")
    .select("game_id, season, week, home_team_id, away_team_id, completed")
    .eq("game_id", gameId).limit(1);
  const game = games?.[0];
  if (!game?.home_team_id || !game?.away_team_id) {
    return NextResponse.json({ error: "No matchup for this game" }, { status: 404 });
  }

  const { data: teams } = await supabase.from("teams").select("team_id, school")
    .in("team_id", [game.home_team_id, game.away_team_id]);
  const name = Object.fromEntries((teams || []).map(t => [t.team_id, t.school]));

  const { data: profileRows } = await supabase.from("team_profiles").select("team_id, through_week, data")
    .eq("season", game.season).in("team_id", [game.home_team_id, game.away_team_id]);
  const profileOf = Object.fromEntries((profileRows || []).map(r => [r.team_id, r]));
  const home = profileOf[game.home_team_id];
  const away = profileOf[game.away_team_id];
  if (!home || !away) {
    return NextResponse.json({ error: "No matchup for this game yet" }, { status: 404 });
  }

  const homeName = name[game.home_team_id];
  const awayName = name[game.away_team_id];
  const homeHasBall = possession(homeName, home.data, awayName, away.data);
  const awayHasBall = possession(awayName, away.data, homeName, home.data);

  const { data: lines } = await supabase.from("lines")
    .select("model_spread, market_spread, model_total, market_total")
    .eq("game_id", gameId).limit(1);

  return NextResponse.json({
    home: homeName,
    away: awayName,
    through_week: Math.min(home.through_week, away.through_week),
    completed: game.completed,
    early: Math.min(home.data.fbs_games, away.data.fbs_games) < SETTLED_GAMES,
    fbs_games: { home: home.data.fbs_games, away: away.data.fbs_games },
    possessions: [
      { offense: awayName, defense: homeName, rows: awayHasBall },
      { offense: homeName, defense: awayName, rows: homeHasBall },
    ],
    look_fors: lookFors([...homeHasBall, ...awayHasBall], [[awayName, away.data], [homeName, home.data]]),
    ledger: { home: home.data.ledger, away: away.data.ledger },
    line: lines?.[0] || null,
  });
}
