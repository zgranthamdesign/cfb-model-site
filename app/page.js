"use client";

import { useEffect, useState, useMemo } from "react";

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

function TeamRow({ name, logo, rank, totalTeams, score, finalScore, completed, onSelect }) {
  const rankStyle = rankColors(rank, totalTeams);
  return (
    <div className="game-card-team-row" onClick={() => onSelect && onSelect(name)}>
      <div className="game-card-team-info">
        <span className="game-card-rank" style={rank != null ? (rankStyle || undefined) : undefined}>
          {rank != null ? `#${rank}` : ""}
        </span>
        <span className="team-logo-slot">
          {logo && <img src={logo} alt="" className="team-logo" />}
        </span>
        <span className="game-card-team-name">{name}</span>
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

function GameCard({ row, totalTeams, onSelectTeam }) {
  return (
    <div className="game-card">
      <div className="game-card-header-row">
        <div className="game-card-meta">{fmtTime(row.start_date)}</div>
        <div className="game-card-score-label">{row.completed ? "Final" : "Proj"}</div>
      </div>

      <div className="game-card-teams">
        <TeamRow name={row.away_team} logo={row.away_logo} rank={row.away_power_rank} totalTeams={totalTeams} score={row.away_projected_score} finalScore={row.away_final_score} completed={row.completed} onSelect={onSelectTeam} />
        <TeamRow name={row.home_team} logo={row.home_logo} rank={row.home_power_rank} totalTeams={totalTeams} score={row.home_projected_score} finalScore={row.home_final_score} completed={row.completed} onSelect={onSelectTeam} />
      </div>

      <div className="game-card-divider" />

      {row.projected_winner && (
        <div className="game-card-projection">
          <span className="stat-label-meta">Model:</span> <strong>{row.projected_winner}</strong> -{fmt(row.projected_margin)}
          {row.model_total != null && (
            <> / <strong>Total:</strong> {fmt(row.model_total)}</>
          )}
        </div>
      )}

      <div className="game-card-divider" />

      <div className="game-card-stat-row">
        <span>
          <span className="stat-label-meta">Market Spread:</span> <span className="game-card-stat-value">{row.market_favorite_team} {fmtHalf(row.market_spread_favorite)}</span>
          {row.market_spread_open_favorite != null && (
            <span className="open-cell"> (Open {fmtHalf(row.market_spread_open_favorite)})</span>
          )}
          <BookBreakdown
            team={row.market_favorite_team}
            books={row.market_favorite_team === row.home_team ? row.home_books : row.away_books}
          />
        </span>
      </div>

      <div className="game-card-stat-row">
        <span>
          <span className="stat-label-meta">Market Total:</span> <span className="game-card-stat-value">{fmtHalf(row.market_total)}</span>
          {row.market_total_open != null && (
            <span className="open-cell"> (Open {fmtHalf(row.market_total_open)})</span>
          )}
        </span>
      </div>

      {(row.show_spread_bet || row.show_total_bet) && (
        <div className="game-card-projection model-bet-line">
          <span className="stat-label-meta">Model Bet:</span>{" "}
          {row.show_spread_bet && row.bet_team && (
            <>
              <strong>{row.bet_team}</strong> {fmtHalfSigned(row.bet_spread)}
              {row.ats_result && (
                <span className={
                  row.ats_result === "COVER" ? "ats-badge ats-cover" :
                  row.ats_result === "NO_COVER" ? "ats-badge ats-miss" :
                  "ats-badge ats-push"
                }>
                  {row.ats_result === "COVER" ? "✓" : row.ats_result === "NO_COVER" ? "✗" : "Push"}
                </span>
              )}
            </>
          )}
          {row.show_spread_bet && row.show_total_bet && " / "}
          {row.show_total_bet && row.total_pick && (
            <>
              <strong>{row.total_pick === "OVER" ? "Over" : "Under"}</strong> {fmtHalf(row.market_total)}
              {row.total_result && (
                <span className={
                  row.total_result === "COVER" ? "ats-badge ats-cover" :
                  row.total_result === "NO_COVER" ? "ats-badge ats-miss" :
                  "ats-badge ats-push"
                }>
                  {row.total_result === "COVER" ? "✓" : row.total_result === "NO_COVER" ? "✗" : "Push"}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {!row.completed && row.key_number_tier === "KEY++" && row.key_number_margin != null && (
        <div className="key-badge">Key Number Crossed: {row.key_number_margin}</div>
      )}
    </div>
  );
}

// Green (great) -> yellow (average) -> red (poor), for stat percentiles.
// pct is 0-1, already direction-adjusted so 1 always means "better".
function percentileColor(pct) {
  if (pct == null) return null;
  const hue = 120 * pct;
  return {
    background: `hsl(${hue}, 70%, 90%)`,
    color: `hsl(${hue}, 70%, 28%)`,
  };
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function StatRow({ label, value, percentile }) {
  const style = percentileColor(percentile);
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-row-right">
        <span className="stat-value">{value}</span>
        {percentile != null && (
          <span className="percentile-badge" style={style}>
            {ordinal(Math.round(percentile * 100))}
          </span>
        )}
      </span>
    </div>
  );
}

function TeamStatsPanel({ team, data, loading, onClose }) {
  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-panel-header">
          {data?.logo_url && <img src={data.logo_url} alt="" className="team-logo" />}
          <h2>{team}</h2>
          <button className="stats-panel-close" onClick={onClose}>×</button>
        </div>

        {loading && <div className="loading">Loading stats...</div>}

        {!loading && data?.note && (
          <div className="team-note">
            <ul>
              {data.note.split("\n").map(line => line.trim()).filter(Boolean).map((line, i) => (
                <li key={i}>{line.replace(/^[-•]\s*/, "")}</li>
              ))}
            </ul>
          </div>
        )}

        {!loading && data?.source_rankings && Object.values(data.source_rankings).some(Boolean) && (
          <div className="stats-section">
            <h3>Source Rankings</h3>
            {[
              ["our_model", "Our Model"],
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

        {!loading && data && !data.efficiency && (
          <div className="empty">No stats available yet for {team}.</div>
        )}

        {!loading && data && data.efficiency && (
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
              <StatRow label="Off. EPA/play" value={fmt(data.efficiency.off_epa_per_play, 2)} percentile={data.percentiles?.off_epa_per_play} />
              <StatRow label="Def. EPA/play" value={fmt(data.efficiency.def_epa_per_play, 2)} percentile={data.percentiles?.def_epa_per_play} />
              <StatRow label="Off. Success Rate" value={fmtPct(data.efficiency.off_success_rate)} percentile={data.percentiles?.off_success_rate} />
              <StatRow label="Def. Success Rate" value={fmtPct(data.efficiency.def_success_rate)} percentile={data.percentiles?.def_success_rate} />
              <StatRow label="Off. Explosiveness" value={fmt(data.efficiency.off_explosiveness, 2)} percentile={data.percentiles?.off_explosiveness} />
              <StatRow label="Def. Explosiveness" value={fmt(data.efficiency.def_explosiveness, 2)} percentile={data.percentiles?.def_explosiveness} />
              <StatRow label="Off. PPA" value={fmt(data.efficiency.off_ppa)} percentile={data.percentiles?.off_ppa} />
              <StatRow label="Def. PPA" value={fmt(data.efficiency.def_ppa)} percentile={data.percentiles?.def_ppa} />
              <StatRow label="Off. EPA (Rush)" value={fmt(data.efficiency.off_epa_rush, 2)} percentile={data.percentiles?.off_epa_rush} />
              <StatRow label="Off. EPA (Pass)" value={fmt(data.efficiency.off_epa_pass, 2)} percentile={data.percentiles?.off_epa_pass} />
              <StatRow label="Def. EPA (Rush)" value={fmt(data.efficiency.def_epa_rush, 2)} percentile={data.percentiles?.def_epa_rush} />
              <StatRow label="Def. EPA (Pass)" value={fmt(data.efficiency.def_epa_pass, 2)} percentile={data.percentiles?.def_epa_pass} />
              <StatRow label="Plays/Game" value={fmt(data.efficiency.plays_per_game)} />
              <StatRow label="Def. Havoc Rate" value={fmtPct(data.efficiency.def_havoc_rate)} percentile={data.percentiles?.def_havoc_rate} />
            </div>

            <div className="stats-section">
              <h3>SP+</h3>
              <StatRow label="Overall" value={fmt(data.sp_plus?.rating)} percentile={data.percentiles?.sp_plus_rating} />
              <StatRow label="Offense" value={fmt(data.sp_plus?.offense)} percentile={data.percentiles?.sp_plus_offense} />
              <StatRow label="Defense" value={fmt(data.sp_plus?.defense)} percentile={data.percentiles?.sp_plus_defense} />
            </div>

            <div className="stats-section">
              <h3>Talent</h3>
              <StatRow label="Composite" value={fmt(data.talent?.composite)} percentile={data.percentiles?.talent_composite} />
            </div>
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
  const [week, setWeek] = useState(1);
  const [conference, setConference] = useState("All");
  const [linesData, setLinesData] = useState([]);
  const [totalTeams, setTotalTeams] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [search, setSearch] = useState("");
  const [ratingsData, setRatingsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statsTeam, setStatsTeam] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [recordData, setRecordData] = useState(null);

  function openTeamStats(name) {
    setStatsTeam(name);
    setStatsData(null);
    setStatsLoading(true);
    fetch(`/api/team-stats?season=2026&team=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(d => setStatsData(d))
      .finally(() => setStatsLoading(false));
  }

  function closeTeamStats() {
    setStatsTeam(null);
    setStatsData(null);
  }

  useEffect(() => {
    if (tab !== "lines") return;
    setLoading(true);
    fetch(`/api/lines?season=2026&week=${week}`)
      .then(r => r.json())
      .then(d => {
        setLinesData(d.rows || []);
        setTotalTeams(d.totalTeams || null);
        setLastSynced(d.lastSynced || null);
      })
      .finally(() => setLoading(false));
  }, [tab, week]);

  useEffect(() => {
    if (tab !== "ratings") return;
    setLoading(true);
    fetch(`/api/ratings?season=2026`)
      .then(r => r.json())
      .then(d => setRatingsData(d.rows || []))
      .finally(() => setLoading(false));
  }, [tab]);

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
          {tab === "lines" && (
            <select value={week} onChange={e => setWeek(Number(e.target.value))}>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          )}
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
                  <GameCard key={row.game_id} row={row} totalTeams={totalTeams} onSelectTeam={openTeamStats} />
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
        />
      )}
    </div>
  );
}
