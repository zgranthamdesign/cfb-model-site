"use client";

import { createContext, useContext, useEffect, useState, useMemo } from "react";

function fmt(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toFixed(digits);
}

function fmtSigned(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(digits);
}

// Final scores are whole numbers, no decimals.
function fmtInt(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Math.round(n).toString();
}

// Market lines (spread/total) trade in half-point increments.
function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

function fmtHalf(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const r = roundHalf(n);
  return Number.isInteger(r) ? r.toString() : r.toFixed(1);
}

function fmtHalfSigned(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const r = roundHalf(n);
  const s = Number.isInteger(r) ? Math.abs(r).toString() : Math.abs(r).toFixed(1);
  return (r > 0 ? "+" : r < 0 ? "-" : "") + s;
}

function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return Math.round(n * 100) + "%";
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateHeading(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const day = d.getDate();
  const suffix = (day % 10 === 1 && day !== 11) ? "st" :
                 (day % 10 === 2 && day !== 12) ? "nd" :
                 (day % 10 === 3 && day !== 13) ? "rd" : "th";
  return `${weekday}, ${month} ${day}${suffix}`;
}

// Phone-sized team names from the teams table, provided by Home once
// /api/lines answers: short names ("Southern Miss" -> "S Miss") and CFBD
// abbreviations ("Syracuse" -> "SYR").
const ShortNamesContext = createContext({ short: {}, abbr: {} });

// A team name that swaps to a shorter form on phones, where long names get
// cut off. `phone="abbr"` uses the abbreviation for the tightest spots.
// Falls back to the short name, then the full name.
function TeamName({ name, phone = "short" }) {
  const names = useContext(ShortNamesContext);
  const short = (phone === "abbr" && names.abbr[name]) || names.short[name];
  if (!short || short === name) return name;
  return (
    <>
      <span className="team-name-full">{name}</span>
      <span className="team-name-short">{short}</span>
    </>
  );
}

function fmtSyncTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateStr}, ${timeStr}`;
}

function dateKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Green (best) -> yellow (middle) -> red (worst), using hue interpolation.
// pct=0 -> hue 120 (green), pct=0.5 -> hue 60 (yellow), pct=1 -> hue 0 (red).
function rankColors(rank, total) {
  if (rank == null || !total || total <= 1) return null;
  const pct = (rank - 1) / (total - 1);
  const hue = 120 * (1 - pct);
  return {
    background: `hsl(${hue}, 70%, 90%)`,
    color: `hsl(${hue}, 70%, 28%)`,
  };
}

function TeamRow({ name, logo, rank, totalTeams, score, finalScore, completed, record, isFcs, onSelect }) {
  const rankStyle = rankColors(rank, totalTeams);
  return (
    <div className="game-card-team-row" onClick={() => onSelect && onSelect(name)}>
      <div className="game-card-team-info">
        {isFcs ? (
          <span className="game-card-rank rank-fcs" aria-label="Unranked">—</span>
        ) : (
          <span className="game-card-rank" style={rank != null ? (rankStyle || undefined) : undefined}>
            {rank != null ? `#${rank}` : ""}
          </span>
        )}
        <span className="team-logo-slot">
          {logo ? (
            <img src={logo} alt="" className="team-logo" />
          ) : isFcs ? (
            // FCS opponents have no logo in our data; a neutral placeholder
            // keeps their row aligned with the FBS team below it.
            <span className="team-logo-fcs">FCS</span>
          ) : null}
        </span>
        <span className="game-card-team-name-block">
          <span className="game-card-team-name"><TeamName name={name} /></span>
          {record && (
            <span className="game-card-team-record">{record.wins}-{record.losses}</span>
          )}
        </span>
      </div>
      {completed && finalScore != null ? (
        <span className="game-card-score">
          <span className="score-final">{fmtInt(finalScore)}</span>
          {score != null && <span className="score-proj">({fmt(score)})</span>}
        </span>
      ) : (
        score != null && <span className="game-card-score"><span className="score-final">{fmt(score)}</span></span>
      )}
    </div>
  );
}

function BookBreakdown({ team, books }) {
  if (!books) return null;
  const entries = Object.entries(books).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  return (
    <span className="market-hover">
      <span className="market-hover-icon">ⓘ</span>
      <div className="market-tooltip">
        <div className="market-tooltip-header">{team}</div>
        {entries.map(([book, spread]) => (
          <div className="market-tooltip-row" key={book}>
            <span>{book}</span>
            <span>{fmtHalfSigned(spread)}</span>
          </div>
        ))}
      </div>
    </span>
  );
}

// Win/loss marker for a graded pick. Uses Google Material Symbols (loaded in
// globals.css) rather than the ✓/✗ text glyphs, which rendered unevenly.
function ResultBadge({ result }) {
  if (!result) return null;
  if (result === "PUSH") {
    return <span className="ats-badge ats-push">Push</span>;
  }
  const won = result === "COVER";
  return (
    <span
      className={won ? "ats-badge ats-cover" : "ats-badge ats-miss"}
      role="img"
      aria-label={won ? "Won" : "Lost"}
    >
      <span className="material-symbols-rounded" aria-hidden="true">
        {won ? "check" : "close"}
      </span>
    </span>
  );
}

// A game is shown as LIVE from kickoff until it is marked final, capped at
// four hours so a game whose final never syncs doesn't stay live forever.
// Driven by the clock, not by a script run, so it can't go stale.
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

function isLive(row, now = Date.now()) {
  if (row.completed || !row.start_date) return false;
  const kickoff = new Date(row.start_date).getTime();
  return now >= kickoff && now < kickoff + LIVE_WINDOW_MS;
}

// EXPECTED · HALFTIME row: the first half re-graded, from
// sync_live_expected.py, next to the score at the half. A frozen snapshot:
// nothing in it changes after halftime, so it reads the same whenever it's
// viewed. Replaced by the post-game EXPECTED row once the game is re-graded.
function HalftimeExpectedRow({ row, onOpen }) {
  const half = row.halftime;
  if (!half || half.away_expected == null || half.home_expected == null) return null;
  const open = () => onOpen && onOpen({ ...row, live_breakdown: true });
  return (
    <div
      className="game-card-footer-row game-card-expected-row is-clickable"
      role="button"
      tabIndex={0}
      aria-label={`See why the halftime expected score is ${row.away_team} ${fmtInt(half.away_expected)}, ${row.home_team} ${fmtInt(half.home_expected)}. Halftime score ${half.away_score} to ${half.home_score}.`}
      onClick={open}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <span className="stat-label-meta">
        <span className="label-full">Expected Halftime Score</span>
        <span className="label-short">Exp Half</span>
      </span>
      <span className="game-card-picks-value">
        <span className="team-score"><TeamName name={row.away_team} phone="abbr" /> <span className="num">{fmtInt(half.away_expected)}</span></span>
        <span className="team-score"><TeamName name={row.home_team} phone="abbr" /> <span className="num">{fmtInt(half.home_expected)}</span></span>
        {half.away_score != null && half.home_score != null && (
          <span className="halftime-actual num">({half.away_score}–{half.home_score})</span>
        )}
        <span className="market-hover expected-hover hide-on-phone">
          <span className="market-hover-icon">ⓘ</span>
          <div className="market-tooltip expected-tooltip">
            <div className="market-tooltip-header">Halftime expected score</div>
            <p>
              What the first half was worth based on how both teams played, built
              the same way as the post-game expected score. The score in
              parentheses is the actual score at the half.
            </p>
            <p>
              A first half is a small sample, roughly five drives each. Treat
              gaps under about 3 points per team as noise.
            </p>
          </div>
        </span>
        <span className="material-symbols-rounded expected-chevron" aria-hidden="true">chevron_right</span>
      </span>
    </div>
  );
}

// EXPECTED row: what each team's play was worth, from sync_expected_scores.py.
// Only rendered for completed games that have been re-graded.
function ExpectedRow({ row, onOpen }) {
  if (row.away_expected_score == null || row.home_expected_score == null) return null;
  return (
    <div
      className="game-card-footer-row game-card-expected-row is-clickable"
      role="button"
      tabIndex={0}
      aria-label={`See why the expected score is ${row.away_team} ${fmtInt(row.away_expected_score)}, ${row.home_team} ${fmtInt(row.home_expected_score)}`}
      onClick={() => onOpen && onOpen(row)}
      onKeyDown={e => {
        if ((e.key === "Enter" || e.key === " ") && onOpen) {
          e.preventDefault();
          onOpen(row);
        }
      }}
    >
      <span className="stat-label-meta">Expected</span>
      <span className="game-card-picks-value">
        <span className="team-score"><TeamName name={row.away_team} phone="abbr" /> <span className="num">{fmtInt(row.away_expected_score)}</span></span>
        <span className="team-score"><TeamName name={row.home_team} phone="abbr" /> <span className="num">{fmtInt(row.home_expected_score)}</span></span>
        {row.expected_garbage_time && (
          <span className="expected-flag" title="Garbage time excluded">GT</span>
        )}
        {row.expected_overtime && (
          <span className="expected-flag" title="Overtime excluded">OT</span>
        )}
        <span className="market-hover expected-hover">
          <span className="market-hover-icon">ⓘ</span>
          <div className="market-tooltip expected-tooltip">
            <div className="market-tooltip-header">Expected score</div>
            <p>
              What the score should have been based on how both teams actually
              played: efficiency, how often they reached scoring range, and field
              position. Turnover luck is evened out.
            </p>
            {row.expected_garbage_time && (
              <p>
                <strong>GT:</strong> this game reached garbage time, and those plays
                aren't counted. The winner's expected score will look lower than the
                final partly for that reason.
              </p>
            )}
            {row.expected_overtime && (
              <p><strong>OT:</strong> overtime isn't counted. This covers regulation only.</p>
            )}
            <p>Single games are noisy. Treat margin gaps under ~8 points as noise.</p>
          </div>
        </span>
        <span className="material-symbols-rounded expected-chevron" aria-hidden="true">chevron_right</span>
      </span>
    </div>
  );
}

function GameCard({ row, totalTeams, onSelectTeam, onOpenBreakdown }) {
  // Games against FCS opponents have no market or model lines. Rendering the
  // grid anyway produced four columns of dashes that looked broken, so the
  // grid only shows when at least one value exists.
  const hasLines = [
    row.market_spread_open_favorite,
    row.market_spread_favorite,
    row.model_spread_vs_market_favorite,
    row.market_total_open,
    row.market_total,
    row.model_total,
  ].some(v => v != null);

  // "No Bet": the model and market were both available to compare, but they
  // agree too closely on the spread and the total for either to be a pick.
  // Distinct from a game with no lines at all, which shows no picks row.
  const hasPick = row.show_spread_bet || row.show_total_bet;
  const picksEvaluated =
    (row.market_spread != null && row.model_spread != null) ||
    (row.market_total != null && row.model_total != null);
  const noBet = picksEvaluated && !hasPick;

  return (
    <div className="game-card">
      <div className="game-card-header-row">
        <div className="game-card-meta">
          {isLive(row) && <span className="live-pill">Live</span>}
          {fmtTime(row.start_date)}
        </div>
        {row.venue_name && (
          <div className="game-card-venue">
            {row.venue_name}{row.venue_location ? ` · ${row.venue_location}` : ""}
          </div>
        )}
      </div>

      <div className="game-card-teams">
        <TeamRow name={row.away_team} logo={row.away_logo} rank={row.away_power_rank} totalTeams={totalTeams} score={row.away_projected_score} finalScore={row.away_final_score} completed={row.completed} record={row.away_record} isFcs={row.away_is_fcs} onSelect={onSelectTeam} />
        <TeamRow name={row.home_team} logo={row.home_logo} rank={row.home_power_rank} totalTeams={totalTeams} score={row.home_projected_score} finalScore={row.home_final_score} completed={row.completed} record={row.home_record} isFcs={row.home_is_fcs} onSelect={onSelectTeam} />
      </div>

      {hasLines && (
      <div className="game-card-lines-grid">
        {/* Header row */}
        <div className="line-cell line-corner" />
        <div className="line-cell line-col-label">Open</div>
        <div className="line-cell line-col-label">Current</div>
        <div className="line-cell line-col-label">Proj.</div>

        {/* Spread row. Every number is relative to the market favorite,
            named once in the row label: "-6" means that team favored by 6,
            and a "+" in Proj. means the model has them losing. Naming the
            team in each cell left Proj. ambiguous and wrapped on phones. */}
        <div className="line-cell line-row-label line-row-label-stack">
          <span>Spread</span>
          {row.market_favorite_team && (
            <span className="line-row-team"><TeamName name={row.market_favorite_team} /></span>
          )}
        </div>
        <div className="line-cell line-col-value">{fmtHalf(row.market_spread_open_favorite)}</div>
        <div className="line-cell line-col-value">
          <span className="line-num">
            {fmtHalf(row.market_spread_favorite)}
            <BookBreakdown
              team={row.market_favorite_team}
              books={row.market_favorite_team === row.home_team ? row.home_books : row.away_books}
            />
          </span>
        </div>
        <div className="line-cell line-col-value">{fmtHalfSigned(row.model_spread_vs_market_favorite)}</div>

        {/* Total row */}
        <div className="line-cell line-row-label">Total</div>
        <div className="line-cell line-col-value">{fmtHalf(row.market_total_open)}</div>
        <div className="line-cell line-col-value">{fmtHalf(row.market_total)}</div>
        <div className="line-cell line-col-value">{fmt(row.model_total)}</div>
      </div>
      )}

      {(hasPick || noBet || row.home_expected_score != null) && (
      <div className="game-card-footer">
      {(hasPick || noBet) && (
        <div className="game-card-footer-row game-card-picks-row">
          <span className="stat-label-meta">Model Picks</span>
          <span className="game-card-picks-value">
            {noBet && <span className="picks-no-bet">No Bet</span>}
            {/* Each pick is kept on one line; on narrow screens the row wraps
                between picks rather than splitting "Under" from "55". */}
            {row.show_spread_bet && row.bet_team && (
              <span className="pick-item">
                <strong><TeamName name={row.bet_team} /></strong> <span className="num">{fmtHalfSigned(row.bet_spread)}</span>
                <ResultBadge result={row.ats_result} />
              </span>
            )}
            {row.show_spread_bet && row.show_total_bet && <span className="pick-sep">/</span>}
            {row.show_total_bet && row.total_pick && (
              <span className="pick-item">
                <strong>{row.total_pick === "OVER" ? "Over" : "Under"}</strong> <span className="num">{fmtHalf(row.market_total)}</span>
                <ResultBadge result={row.total_result} />
              </span>
            )}
          </span>
        </div>
      )}
      <ExpectedRow row={row} onOpen={onOpenBreakdown} />
      <HalftimeExpectedRow row={row} onOpen={onOpenBreakdown} />
      </div>
      )}
    </div>
  );
}

// Green (great) -> yellow (average) -> red (poor), based on rank
// position within the field. pct is 0-1, 1 always means "better".
function rankColor(rank, total) {
  if (rank == null || total == null || total < 2) return null;
  const pct = 1 - (rank - 1) / (total - 1);
  const hue = 120 * pct;
  return {
    background: `hsl(${hue}, 70%, 90%)`,
    color: `hsl(${hue}, 70%, 28%)`,
  };
}

function StatRow({ label, value, rank }) {
  const style = rank ? rankColor(rank.rank, rank.total) : null;
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-row-right">
        <span className="stat-value">{value}</span>
        {rank != null && (
          <span className="percentile-badge" style={style}>
            #{rank.rank} of {rank.total}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expected score breakdown modal
// ---------------------------------------------------------------------------

function fmtPoints(n) {
  if (n == null || isNaN(n)) return "—";
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0.0";
  return (r > 0 ? "+" : "−") + Math.abs(r).toFixed(1);
}

function fieldPosition(yardsToGoal) {
  if (yardsToGoal == null) return "—";
  const y = Math.round(yardsToGoal);
  if (y === 50) return "50";
  return y > 50 ? `Own ${100 - y}` : `Opp ${y}`;
}

const pct = n => (n == null ? "—" : `${Math.round(n * 100)}%`);
const one = n => (n == null ? "—" : n.toFixed(1));

// Stats as played, alongside the FBS average for the same measure. Each
// `team` formatter takes a stat block and drive count, so the same formatting
// serves the competitive-time line and the full-game line (garbage time in).
const BREAKDOWN_STATS = [
  { label: "Drives", team: (s, drives) => drives, avg: () => "—" },
  { label: "Success Rate", team: s => pct(s.sr), avg: l => pct(l.sr) },
  { label: "Yards Per Carry", team: s => one(s.ypc), avg: l => one(l.ypc) },
  { label: "Yards Per Attempt", team: s => one(s.ypa), avg: l => one(l.ypa) },
  {
    label: "Scoring Chances",
    hint: "Reached opp. 40",
    team: (s, drives) => `${s.opportunities} of ${drives}`,
    // Just the rate: "52% of drives" overflowed the column on phones, and
    // the hint above already says what is being counted. The hint itself is
    // kept short enough to stay on one line in the phone label column.
    avg: l => pct(l.opps_per_drive),
  },
  { label: "Points Per Chance", team: s => one(s.pts_per_opp), avg: l => one(l.pts_per_opp) },
  { label: "Avg. Drive Start", team: s => fieldPosition(s.start_to_goal), avg: l => fieldPosition(l.start_to_goal) },
  { label: "Plays Per Drive", team: s => one(s.plays_per_drive), avg: l => one(l.plays_per_drive) },
  {
    label: "Turnovers (Exp.)",
    team: s => (s.expected_turnovers == null
      ? `${s.turnovers}`
      : `${s.turnovers} (${one(s.expected_turnovers)})`),
    // Compared on the count alone; expected turnovers is a model figure.
    compare: s => `${s.turnovers}`,
    avg: () => "—",
  },
];

// A team's stat cell: the competitive-time value the expected score uses, and
// underneath it, marked, the full-game value when garbage time changed it.
function StatCell({ stat, team }) {
  const value = stat.team(team.stats, team.drives);
  const full = team.full_game;
  const compare = stat.compare || stat.team;
  const fullValue = full ? compare(full, full.drives) : null;
  const differs = fullValue != null && fullValue !== compare(team.stats, team.drives);
  return (
    <span className="bd-stat">
      {value}
      {differs && <span className="bd-gt-value">{fullValue}*</span>}
    </span>
  );
}

function garbageTimeNote(start) {
  if (!start) return null;
  const quarter = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" }[start.period] || `Q${start.period}`;
  return `Garbage time began with ${start.clock} left in the ${quarter} quarter, ` +
    `${start.leader} leading ${start.leader_score}–${start.trailer_score}.`;
}

// How many points each piece added or took away from an average offense
// over the same number of drives. These sum to the expected score.
//
// `info` is the explainer behind the row's (i) button: what the stat is, how
// it turns into points, and how to read it. Takes the FBS averages so the
// numbers quoted match the model the page was built from.
const pctText = n => `${Math.round(n * 100)}%`;

const BREAKDOWN_POINTS = [
  {
    label: "Average Offense",
    value: t => t.breakdown.baseline,
    neutral: true,
    info: l => [
      `The starting point for every team. An average FBS offense scores about ${one(l.pts_per_drive)} points per drive, so this is ${one(l.pts_per_drive)} × the number of drives the team had before garbage time.`,
      "Every line below adds or subtracts points based on how the team compared with that average offense over the same drives. Drive counts are usually close in a game, so both teams tend to start near the same number.",
    ],
  },
  {
    label: "Scoring Chances",
    value: t => t.breakdown.contributions.opps_per_drive,
    info: l => [
      `The share of drives that reached the opponent's 40-yard line. An average offense gets there on about ${pctText(l.opps_per_drive)} of its drives.`,
      "This is usually the biggest line. It measures moving the ball into range, which is the most repeatable part of scoring. It doesn't care what happened after crossing the 40; that's Points Per Chance.",
    ],
  },
  {
    label: "Points Per Chance",
    // finish_per_drive since the model change; older rows only have pts_per_opp.
    value: t => t.breakdown.contributions.finish_per_drive ?? t.breakdown.contributions.pts_per_opp,
    info: l => [
      `Average points on drives that reached the opponent's 40. The FBS average is about ${one(l.pts_per_opp)}, a mix of touchdowns, field goals and trips that came away empty.`,
      "Finishing is mostly luck from one game to the next. A missed field goal, a drop in the end zone or a fourth-down stop swings it, and how well a team finished one game barely predicts how it finishes the next. So the model pulls it hard toward average: a game with six chances keeps about a tenth of its own rate, and the rest is treated as average finishing.",
      "It only counts on the chances a team actually had. A team that scored 8 points on its only chance gets credit for that one chance, not for every drive, which keeps this line small unless a team finished unusually well or poorly on a lot of chances.",
    ],
  },
  {
    label: "Success Rate",
    value: t => t.breakdown.contributions.sr,
    info: l => [
      `The share of plays that kept the offense on schedule: at least half the yards needed on 1st down, 70% on 2nd, and all of them on 3rd or 4th. Touchdowns always count. The FBS average is about ${pctText(l.sr)}.`,
      "It rewards steady, play-after-play offense rather than a few big gains. Most of what it captures already shows up in Scoring Chances, so its point value is usually small.",
    ],
  },
  { label: "Field Position", value: t => t.breakdown.contributions.start_to_goal },
  { label: "Yards Per Carry", value: t => t.breakdown.contributions.ypc },
  { label: "Yards Per Attempt", value: t => t.breakdown.contributions.ypa },
  { label: "Plays Per Drive", value: t => t.breakdown.contributions.plays_per_drive },
  {
    // The turnover stat and the turnover-luck correction are one idea to a
    // reader, so they are shown as a single net line.
    label: "Turnovers & Luck",
    value: t => t.breakdown.contributions.tov_per_drive + t.breakdown.turnover_luck,
    info: () => [
      "Two things in one line. Turnovers cost points, since each one ends a drive. But whether a loose ball bounces your way is mostly luck, so the model evens that part out.",
      "Each team gets an expected number of turnovers from how often it put the ball at risk: about half a turnover per fumble, since the defense recovers roughly 52% of them, and about 0.024 per pass attempt, the FBS interception rate. Both rates come from every FBS game from 2022 to 2025.",
      "A team that turned it over more than expected gets points back here. A team that got away with fumbles or risky throws gives some back. Interceptions are partly skill, so a team whose quarterback forces throws may get back a little more than it deserves.",
    ],
  },
];

function pointsClass(n) {
  if (n == null || Math.abs(n) < 0.5) return "bd-pts";
  return n > 0 ? "bd-pts bd-pos" : "bd-pts bd-neg";
}

// True when any shown stat changes once garbage time is included, so the
// footnote only appears when an asterisk does.
function hasGarbageTimeStats(details) {
  return [details.away, details.home].some(t => t.full_game && BREAKDOWN_STATS.some(s => {
    const compare = s.compare || s.team;
    return compare(t.full_game, t.full_game.drives) !== compare(t.stats, t.drives);
  }));
}

function GameBreakdownPanel({ row, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Label of the row whose explainer is open; one at a time.
  const [openInfo, setOpenInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/game-breakdown?game_id=${row.game_id}${row.live_breakdown ? "&live=1" : ""}`)
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Could not load breakdown");
        return body;
      })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [row.game_id, row.live_breakdown]);

  const d = data?.details;
  const away = d?.away;
  const home = d?.home;
  const league = d?.league;

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-panel breakdown-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-panel-header">
          <div className="breakdown-title">
            <h2>Expected Score</h2>
            <div className="breakdown-subtitle">
              {row.away_team} @ {row.home_team}
              {row.live_breakdown && " · first half"}
            </div>
          </div>
          <button className="stats-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!data && !error && <div className="loading">Loading breakdown...</div>}
        {error && <div className="empty">{error}</div>}

        {d && (
          <>
            <div className="bd-summary">
              {/* Live: the halftime score the expected score is measured
                  against, not the current one. */}
              {[["away", away, row.away_logo, row.live_breakdown ? away.competitive_points : row.away_final_score],
                ["home", home, row.home_logo, row.live_breakdown ? home.competitive_points : row.home_final_score]].map(([side, t, logo, final]) => (
                <div className="bd-summary-team" key={side}>
                  <div className="bd-summary-name">
                    {logo && <img src={logo} alt="" className="team-logo bd-logo" />}
                    <span><TeamName name={t.team} /></span>
                  </div>
                  <div className="bd-summary-scores">
                    <div>
                      <span className="stat-label-meta">{row.live_breakdown ? "Half" : "Final"}</span>
                      <span className="bd-summary-value">{fmtInt(final)}</span>
                    </div>
                    <div>
                      <span className="stat-label-meta">Expected</span>
                      <span className="bd-summary-value bd-expected">{fmtInt(t.expected)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bd-section-heading stat-label-meta">The stats</div>
            <div className="bd-table bd-table-stats">
              <div className="bd-row bd-head">
                <span />
                <span><TeamName name={row.away_team} /></span>
                <span><TeamName name={row.home_team} /></span>
                <span>Avg</span>
              </div>
              {BREAKDOWN_STATS.map(s => (
                <div className="bd-row" key={s.label}>
                  <span className="bd-label">
                    {s.label}
                    {s.hint && <span className="bd-hint">{s.hint}</span>}
                  </span>
                  <StatCell stat={s} team={away} />
                  <StatCell stat={s} team={home} />
                  <span className="bd-avg">{s.avg(league)}</span>
                </div>
              ))}
            </div>
            {hasGarbageTimeStats(d) && (
              <p className="bd-footnote">
                * Full game, including garbage time. Shown for reference; the expected
                score doesn't use it. {garbageTimeNote(d.garbage_time_start)}
              </p>
            )}

            <div className="bd-section-heading stat-label-meta">How the expected score adds up</div>
            <div className="bd-table bd-table-points">
              <div className="bd-row bd-head">
                <span />
                <span><TeamName name={row.away_team} /></span>
                <span><TeamName name={row.home_team} /></span>
              </div>
              {BREAKDOWN_POINTS.map(p => {
                const open = openInfo === p.label;
                return (
                  <div className="bd-row" key={p.label}>
                    <span className="bd-label">
                      <span className="bd-label-line">
                        {p.label}
                        {p.info && (
                          <button
                            type="button"
                            className={`bd-info-toggle${open ? " is-open" : ""}`}
                            aria-expanded={open}
                            aria-label={`What is ${p.label}?`}
                            onClick={() => setOpenInfo(open ? null : p.label)}
                          >
                            ⓘ
                          </button>
                        )}
                      </span>
                    </span>
                    <span className={p.neutral ? "bd-pts" : pointsClass(p.value(away))}>
                      {p.neutral ? one(p.value(away)) : fmtPoints(p.value(away))}
                    </span>
                    <span className={p.neutral ? "bd-pts" : pointsClass(p.value(home))}>
                      {p.neutral ? one(p.value(home)) : fmtPoints(p.value(home))}
                    </span>
                    {open && (
                      <div className="bd-info-text">
                        {p.info(league).map((para, i) => <p key={i}>{para}</p>)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="bd-row bd-total">
                <span className="bd-label">Expected Score</span>
                <span>{one(away.expected)}</span>
                <span>{one(home.expected)}</span>
              </div>
            </div>

            <p className="bd-note">
              Garbage time and overtime aren't counted. Point values compare each stat
              with an average FBS offense over the same number of drives. Turnover
              luck is evened out, so a team that avoided turnovers it would usually
              commit gives some points back.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function TeamStatsPanel({ team, data, loading, onClose, onOpenBreakdown }) {
  // Schedule rows only know "this team vs opponent"; the breakdown modal wants
  // the game-card shape (away/home), so rebuild it from the row's orientation.
  function breakdownRowFor(g) {
    const us = { team, logo: data?.logo_url || null, score: g.team_score };
    const them = { team: g.opponent, logo: g.opponent_logo, score: g.opp_score };
    const [away, home] = g.home_away === "home" ? [them, us] : [us, them];
    return {
      game_id: g.game_id,
      away_team: away.team,
      home_team: home.team,
      away_logo: away.logo,
      home_logo: home.logo,
      away_final_score: away.score,
      home_final_score: home.score,
    };
  }

  const [modalTab, setModalTab] = useState("overview");

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-panel-header">
          {data?.logo_url && <img src={data.logo_url} alt="" className="team-logo" />}
          <h2>{team}</h2>
          <button className="stats-panel-close" onClick={onClose}>×</button>
        </div>

        {!loading && (
          <div className="modal-tabs">
            <button
              className={`modal-tab ${modalTab === "overview" ? "active" : ""}`}
              onClick={() => setModalTab("overview")}
            >
              Overview
            </button>
            <button
              className={`modal-tab ${modalTab === "schedule" ? "active" : ""}`}
              onClick={() => setModalTab("schedule")}
            >
              Schedule
            </button>
          </div>
        )}

        {loading && <div className="loading">Loading stats...</div>}

        {!loading && modalTab === "overview" && (
          <>
            {data?.note && (
              <div className="team-note">
                <ul>
                  {data.note.split("\n").map(line => line.trim()).filter(Boolean).map((line, i) => (
                    <li key={i}>{line.replace(/^[-•]\s*/, "")}</li>
                  ))}
                </ul>
              </div>
            )}

            {data?.source_rankings && Object.values(data.source_rankings).some(Boolean) && (
              <div className="stats-section">
                <h3>Source Rankings</h3>
                {[
                  ["sp_plus", "SP+"],
                  ["fpi", "FPI"],
                  ["elo", "Elo"],
                  ["srs", "SRS"],
                ].map(([key, label]) => {
                  const r = data.source_rankings[key];
                  return (
                    <div className="stat-row" key={key}>
                      <span className="stat-label">{label}</span>
                      <span className="stat-row-right">
                        {r ? (
                          <>
                            <span className="rank-badge" style={rankColors(r.rank, r.total) || undefined}>#{r.rank}</span>
                            <span className="source-rank-total">of {r.total}</span>
                          </>
                        ) : (
                          <span className="stat-value">—</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {data && !data.efficiency && (
              <div className="empty">No stats available yet for {team}.</div>
            )}

            {data && data.efficiency && (
              <div className="stats-panel-body">
                <div className="stats-meta">
                  {data.conference && <span className="conf-badge">{data.conference}</span>}
                  {data.week != null && <span>Through Week {data.week} ({data.games_played} game{data.games_played === 1 ? "" : "s"})</span>}
                </div>

                <div className="stats-col-header">
                  <span></span>
                  <span className="stats-col-header-right">
                    <span className="stats-col-label-value">Value</span>
                    <span className="stats-col-label-pct">Pctl</span>
                  </span>
                </div>

                <div className="stats-section">
                  <h3>Efficiency</h3>
                  <StatRow label="Off. EPA/play" value={fmt(data.efficiency.off_epa_per_play, 2)} rank={data.ranks?.off_epa_per_play} />
                  <StatRow label="Def. EPA/play" value={fmt(data.efficiency.def_epa_per_play, 2)} rank={data.ranks?.def_epa_per_play} />
                  <StatRow label="Off. Success Rate" value={fmtPct(data.efficiency.off_success_rate)} rank={data.ranks?.off_success_rate} />
                  <StatRow label="Def. Success Rate" value={fmtPct(data.efficiency.def_success_rate)} rank={data.ranks?.def_success_rate} />
                  <StatRow label="Off. Explosiveness" value={fmt(data.efficiency.off_explosiveness, 2)} rank={data.ranks?.off_explosiveness} />
                  <StatRow label="Def. Explosiveness" value={fmt(data.efficiency.def_explosiveness, 2)} rank={data.ranks?.def_explosiveness} />
                  <StatRow label="Off. PPA" value={fmt(data.efficiency.off_ppa)} rank={data.ranks?.off_ppa} />
                  <StatRow label="Def. PPA" value={fmt(data.efficiency.def_ppa)} rank={data.ranks?.def_ppa} />
                  <StatRow label="Off. EPA (Rush)" value={fmt(data.efficiency.off_epa_rush, 2)} rank={data.ranks?.off_epa_rush} />
                  <StatRow label="Off. EPA (Pass)" value={fmt(data.efficiency.off_epa_pass, 2)} rank={data.ranks?.off_epa_pass} />
                  <StatRow label="Def. EPA (Rush)" value={fmt(data.efficiency.def_epa_rush, 2)} rank={data.ranks?.def_epa_rush} />
                  <StatRow label="Def. EPA (Pass)" value={fmt(data.efficiency.def_epa_pass, 2)} rank={data.ranks?.def_epa_pass} />
                  <StatRow label="Plays/Game" value={fmt(data.efficiency.plays_per_game)} />
                  <StatRow label="Def. Havoc Rate" value={fmtPct(data.efficiency.def_havoc_rate)} rank={data.ranks?.def_havoc_rate} />
                </div>

                <div className="stats-section">
                  <h3>SP+</h3>
                  <StatRow label="Overall" value={fmt(data.sp_plus?.rating)} rank={data.ranks?.sp_plus_rating} />
                  <StatRow label="Offense" value={fmt(data.sp_plus?.offense)} rank={data.ranks?.sp_plus_offense} />
                  <StatRow label="Defense" value={fmt(data.sp_plus?.defense)} rank={data.ranks?.sp_plus_defense} />
                </div>

                <div className="stats-section">
                  <h3>Talent</h3>
                  <StatRow label="Composite" value={fmt(data.talent?.composite)} rank={data.ranks?.talent_composite} />
                </div>
              </div>
            )}
          </>
        )}

        {!loading && modalTab === "schedule" && (
          <div className="stats-section">
            {(!data?.schedule || data.schedule.length === 0) ? (
              <div className="empty">No schedule available yet for {team}.</div>
            ) : (
              data.schedule.map(g => (
                <div
                  className={`schedule-row ${g.team_expected != null ? "is-clickable" : ""}`}
                  key={g.week}
                  {...(g.team_expected != null && onOpenBreakdown ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": `See the expected score breakdown vs ${g.opponent}`,
                    onClick: () => onOpenBreakdown(breakdownRowFor(g)),
                    onKeyDown: e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenBreakdown(breakdownRowFor(g));
                      }
                    },
                  } : {})}
                >
                  <span className="schedule-week">Wk {g.week}</span>
                  <span className="schedule-opponent">
                    {g.home_away === "away" ? "@ " : "vs "}
                    {g.opponent_logo && <img src={g.opponent_logo} alt="" className="team-logo" />}
                    <TeamName name={g.opponent} />
                  </span>
                  <span className="schedule-result">
                    {g.completed ? (
                      <>
                        <span className={`schedule-result-badge ${g.result === "W" ? "win" : g.result === "L" ? "loss" : ""}`}>
                          {g.result}
                        </span>
                        <span className="schedule-score">{g.team_score}-{g.opp_score}</span>
                        {/* Always rendered on completed games so scores line up
                            even where no expected score exists (FCS games). */}
                        <span className="schedule-expected">
                          {g.team_expected != null && g.opp_expected != null
                            ? `(${fmtInt(g.team_expected)}-${fmtInt(g.opp_expected)})`
                            : ""}
                        </span>
                        <span className="material-symbols-rounded schedule-chevron" aria-hidden="true">
                          {g.team_expected != null ? "chevron_right" : ""}
                        </span>
                      </>
                    ) : (
                      <span className="stat-value">—</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordCard({ label, record }) {
  if (!record) return null;
  const { wins, losses, pushes, pct } = record;
  return (
    <div className="record-card">
      <div className="record-label">{label}</div>
      <div className="record-line">
        {wins}-{losses}{pushes > 0 ? `-${pushes}` : ""}
      </div>
      {pct != null && <div className="record-pct">{fmtPct(pct)}</div>}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState("lines");
  // Null until /api/current-week answers, so the page never flashes week 1.
  const [week, setWeek] = useState(null);
  const [conference, setConference] = useState("All");
  const [linesData, setLinesData] = useState([]);
  const [totalTeams, setTotalTeams] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [search, setSearch] = useState("");
  const [ratingsData, setRatingsData] = useState([]);
  // Starts true: the first load waits on the current-week lookup.
  const [loading, setLoading] = useState(true);
  const [statsTeam, setStatsTeam] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [recordData, setRecordData] = useState(null);
  const [breakdownRow, setBreakdownRow] = useState(null);
  const [shortNames, setShortNames] = useState({ short: {}, abbr: {} });

  function openTeamStats(name) {
    setStatsTeam(name);
    setStatsData(null);
    setStatsLoading(true);
    fetch(`/api/team-stats?season=2026&week=${week}&team=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => setStatsData(d))
      .finally(() => setStatsLoading(false));
  }

  function closeTeamStats() {
    setStatsTeam(null);
    setStatsData(null);
  }

  useEffect(() => {
    fetch(`/api/current-week?season=2026`)
      .then(r => r.json())
      .then(d => setWeek(d.week || 1))
      .catch(() => setWeek(1));
  }, []);

  useEffect(() => {
    if (tab !== "lines" || week == null) return;
    setLoading(true);
    fetch(`/api/lines?season=2026&week=${week}`)
      .then(r => r.json())
      .then(d => {
        setLinesData(d.rows || []);
        setShortNames({ short: d.shortNames || {}, abbr: d.abbreviations || {} });
        setTotalTeams(d.totalTeams || null);
        setLastSynced(d.lastSynced || null);
      })
      .finally(() => setLoading(false));
  }, [tab, week]);

  useEffect(() => {
    if (tab !== "ratings" || week == null) return;
    setLoading(true);
    fetch(`/api/ratings?season=2026&week=${week}`)
      .then(r => r.json())
      .then(d => setRatingsData(d.rows || []))
      .finally(() => setLoading(false));
  }, [tab, week]);

  useEffect(() => {
    if (tab !== "record") return;
    setLoading(true);
    fetch(`/api/record?season=2026`)
      .then(r => r.json())
      .then(d => setRecordData(d))
      .finally(() => setLoading(false));
  }, [tab]);

  const conferences = useMemo(() => {
    const source = tab === "lines" ? linesData : ratingsData;
    const set = new Set(source.map(r => r.conference).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [tab, linesData, ratingsData]);

  const filteredLines = useMemo(() => {
    let rows = conference === "All" ? linesData : linesData.filter(r => r.conference === conference);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        r.home_team?.toLowerCase().includes(q) || r.away_team?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [linesData, conference, search]);

  const filteredRatings = useMemo(() => {
    if (conference === "All") return ratingsData;
    return ratingsData.filter(r => r.conference === conference);
  }, [ratingsData, conference]);

  const gamesByDate = useMemo(() => {
    const groups = {};
    for (const row of filteredLines) {
      const key = dateKey(row.start_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return Object.entries(groups).sort(([, rowsA], [, rowsB]) => {
      return new Date(rowsA[0].start_date) - new Date(rowsB[0].start_date);
    });
  }, [filteredLines]);

  return (
    <ShortNamesContext.Provider value={shortNames}>
    <div className="container">
      <header className="page-header">
        <div>
          <h1>CFB Model</h1>
          <p className="subtitle">Model vs market lines, and full power ratings</p>
        </div>
      </header>

      <div className="tabs-row">
        <div className="tabs">
          <button
            className={`tab ${tab === "lines" ? "active" : ""}`}
            onClick={() => setTab("lines")}
          >
            Games
          </button>
          <button
            className={`tab ${tab === "ratings" ? "active" : ""}`}
            onClick={() => setTab("ratings")}
          >
            Power Ratings
          </button>
          <button
            className={`tab ${tab === "record" ? "active" : ""}`}
            onClick={() => setTab("record")}
          >
            Record
          </button>
        </div>

        {tab === "lines" && (
          <div className="search-block">
            <div className="search-input-wrapper">
              <svg className="search-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                <line x1="13.6" y1="13.6" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Search Games"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {lastSynced && (
              <div className="last-synced">Lines updated {fmtSyncTime(lastSynced)}</div>
            )}
          </div>
        )}
      </div>

      {tab !== "record" && (
        <div className="filters">
          <select value={week ?? ""} onChange={e => setWeek(Number(e.target.value))}>
            {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
          <select value={conference} onChange={e => setConference(e.target.value)}>
            {conferences.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}

      {!loading && tab === "lines" && (
        filteredLines.length === 0 ? (
          <div className="empty">No games found for this week/conference/search.</div>
        ) : (
          gamesByDate.map(([key, rows]) => (
            <div key={key} className="date-group">
              <h2 className="date-heading">{fmtDateHeading(rows[0].start_date)}</h2>
              <div className="game-grid">
                {rows.map(row => (
                  <GameCard key={row.game_id} row={row} totalTeams={totalTeams} onSelectTeam={openTeamStats} onOpenBreakdown={setBreakdownRow} />
                ))}
              </div>
            </div>
          ))
        )
      )}

      {!loading && tab === "ratings" && (
        filteredRatings.length === 0 ? (
          <div className="empty">No teams found for this conference.</div>
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>School</th>
                  <th>Conference</th>
                  <th>Power Rating</th>
                  <th>Movement</th>
                </tr>
              </thead>
              <tbody>
                {filteredRatings.map(row => (
                  <tr key={row.school}>
                    <td className="rank">
                      <span className="rank-badge" style={rankColors(row.rank, ratingsData.length) || undefined}>{row.rank}</span>
                    </td>
                    <td>
                      <div className="team-cell team-cell-clickable" onClick={() => openTeamStats(row.school)}>
                        {row.logo_url && <img src={row.logo_url} alt="" className="team-logo" />}
                        {row.school}
                      </div>
                    </td>
                    <td><span className="conf-badge">{row.conference}</span></td>
                    <td>{fmt(row.power_rating)}</td>
                    <td>
                      {row.movement == null ? (
                        <span className="movement-none">—</span>
                      ) : row.movement > 0 ? (
                        <span className="movement-up">▲ {row.movement}</span>
                      ) : row.movement < 0 ? (
                        <span className="movement-down">▼ {Math.abs(row.movement)}</span>
                      ) : (
                        <span className="movement-none">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && tab === "record" && (
        !recordData || (recordData.season.ats.wins + recordData.season.ats.losses + recordData.season.ats.pushes === 0) ? (
          <div className="empty">No graded games yet this season.</div>
        ) : (
          <div>
            <div className="record-summary">
              <RecordCard label="Season ATS" record={recordData.season.ats} />
              <RecordCard label="Season O/U" record={recordData.season.total} />
            </div>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>ATS</th>
                    <th>ATS %</th>
                    <th>O/U</th>
                    <th>O/U %</th>
                  </tr>
                </thead>
                <tbody>
                  {recordData.byWeek.map(w => (
                    <tr key={w.week}>
                      <td>Week {w.week}</td>
                      <td>{w.ats.wins}-{w.ats.losses}{w.ats.pushes > 0 ? `-${w.ats.pushes}` : ""}</td>
                      <td>{w.ats.pct != null ? fmtPct(w.ats.pct) : "—"}</td>
                      <td>{w.total.wins}-{w.total.losses}{w.total.pushes > 0 ? `-${w.total.pushes}` : ""}</td>
                      <td>{w.total.pct != null ? fmtPct(w.total.pct) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {statsTeam && (
        <TeamStatsPanel
          team={statsTeam}
          data={statsData}
          loading={statsLoading}
          onClose={closeTeamStats}
          onOpenBreakdown={setBreakdownRow}
        />
      )}

      {/* Rendered after the team panel so it stacks on top when opened from a
          team's schedule; closing it returns to that schedule. */}
      {breakdownRow && (
        <GameBreakdownPanel row={breakdownRow} onClose={() => setBreakdownRow(null)} />
      )}
    </div>
    </ShortNamesContext.Provider>
  );
}
