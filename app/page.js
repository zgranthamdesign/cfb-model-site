"use client";

import { useEffect, useState, useMemo, Fragment } from "react";

function DiffCell({ diff, rowSpan }) {
  if (diff === null || diff === undefined || isNaN(diff)) return <td rowSpan={rowSpan}>—</td>;

  if (diff === 0) {
    return (
      <td rowSpan={rowSpan}>
        <span className="diff-badge diff-neutral">0.0</span>
      </td>
    );
  }

  const isPos = diff > 0;
  const magnitude = Math.min(Math.abs(diff) / 15, 1); // 15+ points = full intensity
  const rgb = isPos ? "74, 222, 128" : "248, 113, 113";
  const bg = `rgba(${rgb}, ${(0.10 + magnitude * 0.35).toFixed(2)})`;
  const textColor = isPos ? "var(--positive)" : "var(--negative)";
  const sign = isPos ? "+" : "";

  return (
    <td rowSpan={rowSpan}>
      <span className="diff-badge" style={{ backgroundColor: bg, color: textColor }}>
        {sign}{diff.toFixed(1)}
      </span>
    </td>
  );
}

function TeamCell({ name, logo }) {
  return (
    <td>
      <div className="team-cell">
        {logo && <img src={logo} alt="" className="team-logo" />}
        {name}
      </div>
    </td>
  );
}

const TAG_COLORS = {
  GREEN: "#16a34a",
  YELLOW: "#86efac",
  RED: "#f87171",
  SIGN_FLIP: "#a78bfa",
  NONE: "#52525b",
};

function TagDot({ tag, note }) {
  if (!tag) return <td>—</td>;
  const color = TAG_COLORS[tag] || TAG_COLORS.NONE;
  return (
    <td title={note || tag}>
      <span
        style={{
          display: "inline-block",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
    </td>
  );
}

function BestBetCell({ bet, note, rowSpan }) {
  if (!bet) return <td rowSpan={rowSpan}>—</td>;
  const bg = bet.tag === "GREEN" ? "rgba(22, 163, 74, 0.18)" : "rgba(134, 239, 172, 0.18)";
  const color = bet.tag === "GREEN" ? "#16a34a" : "#86efac";
  return (
    <td rowSpan={rowSpan} title={note || bet.tag}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "6px",
          backgroundColor: bg,
          color: color,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {bet.logo && <img src={bet.logo} alt="" style={{ width: "16px", height: "16px" }} />}
        <span>{bet.team}</span>
        <span>{fmtSigned(bet.line)}</span>
      </div>
    </td>
  );
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1);
}

function fmtSigned(n) {
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtSyncTime(isoString) {
  if (!isoString) return null;
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  return `Updated ${diffDay}d ago`;
}

function booksTooltip(books) {
  if (!books || Object.keys(books).length === 0) return null;
  return Object.entries(books).sort((a, b) => a[0].localeCompare(b[0]));
}

function BookTooltip({ entries, children }) {
  if (!entries) return children;
  return (
    <span className="book-tooltip-wrapper">
      {children}
      <span className="book-tooltip-content">
        {entries.map(([book, spread]) => (
          <span key={book} className="book-tooltip-row">
            <span>{book}</span>
            <span>{fmtSigned(spread)}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

export default function Home() {
  const [tab, setTab] = useState("spreads");
  const [week, setWeek] = useState(1);
  const [conference, setConference] = useState("All");
  const [linesData, setLinesData] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [ratingsData, setRatingsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState(null); // 'spreadDiff' | 'totalDiff'
  const [sortDir, setSortDir] = useState("desc"); // 'desc' | 'asc'
  const [hoveredGame, setHoveredGame] = useState(null);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  useEffect(() => {
    if (tab !== "spreads" && tab !== "totals") return;
    setLoading(true);
    fetch(`/api/lines?season=2026&week=${week}`)
      .then(r => r.json())
      .then(d => {
        setLinesData(d.rows || []);
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

  const conferences = useMemo(() => {
    const source = tab === "ratings" ? ratingsData : linesData;
    const set = new Set(source.map(r => r.conference).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [tab, linesData, ratingsData]);

  const filteredLines = useMemo(() => {
    const base = conference === "All" ? linesData : linesData.filter(r => r.conference === conference);
    const withDiffs = base.map(r => ({
      ...r,
      spreadDiff: r.model_spread != null && r.market_spread != null ? r.model_spread - r.market_spread : null,
      totalDiff: r.model_total != null && r.market_total != null ? r.model_total - r.market_total : null,
    }));

    if (!sortKey) return withDiffs;

    const sorted = [...withDiffs].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return sorted;
  }, [linesData, conference, sortKey, sortDir]);

  const filteredRatings = useMemo(() => {
    if (conference === "All") return ratingsData;
    return ratingsData.filter(r => r.conference === conference);
  }, [ratingsData, conference]);

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <h1>CFB Model</h1>
          <p className="subtitle">Model vs market lines, and full power ratings</p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${tab === "spreads" ? "active" : ""}`}
          onClick={() => setTab("spreads")}
        >
          Spreads
        </button>
        <button
          className={`tab ${tab === "totals" ? "active" : ""}`}
          onClick={() => setTab("totals")}
        >
          Totals
        </button>
        <button
          className={`tab ${tab === "ratings" ? "active" : ""}`}
          onClick={() => setTab("ratings")}
        >
          Power Ratings
        </button>
      </div>

      <div className="filters" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          {(tab === "spreads" || tab === "totals") && (
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
        {(tab === "spreads" || tab === "totals") && lastSynced && (
          <span style={{ fontSize: "12px", color: "#71717a", alignSelf: "center" }}>
            {fmtSyncTime(lastSynced)}
          </span>
        )}
      </div>

      {loading && <div className="loading">Loading...</div>}

      {!loading && tab === "spreads" && (
        filteredLines.length === 0 ? (
          <div className="empty">No games found for this week/conference.</div>
        ) : (
          <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Team</th>
                <th>Model</th>
                <th>Market</th>
                <th>Open</th>
                <th className="sortable" onClick={() => toggleSort("spreadDiff")}>
                  Diff {sortKey === "spreadDiff" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th>Key</th>
                <th>Best Bet</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.map(row => {
                const awayModel = row.model_spread != null ? -row.model_spread : null;
                const homeModel = row.model_spread;
                const awayMarket = row.market_spread != null ? -row.market_spread : null;
                const homeMarket = row.market_spread;
                const awayOpen = row.market_spread_open != null ? -row.market_spread_open : null;
                const homeOpen = row.market_spread_open;
                const awayDiff = row.spreadDiff != null ? -row.spreadDiff : null;
                const homeDiff = row.spreadDiff;

                let bestBet = null;
                if (row.away_tag === "GREEN" || row.away_tag === "YELLOW") {
                  bestBet = { team: row.away_team, logo: row.away_logo, line: awayMarket, tag: row.away_tag };
                } else if (row.home_tag === "GREEN" || row.home_tag === "YELLOW") {
                  bestBet = { team: row.home_team, logo: row.home_logo, line: homeMarket, tag: row.home_tag };
                }

                return (
                  <Fragment key={row.game_id}>
                    <tr
                      className={`group-start ${hoveredGame === row.game_id ? "row-hover" : ""}`}
                      onMouseEnter={() => setHoveredGame(row.game_id)}
                      onMouseLeave={() => setHoveredGame(null)}
                    >
                      <td className="date-cell" rowSpan={2}>{fmtDate(row.start_date)}</td>
                      <TeamCell name={row.away_team} logo={row.away_logo} />
                      <td>{fmtSigned(awayModel)}</td>
                      <td>
                        <BookTooltip entries={booksTooltip(row.away_books)}>{fmtSigned(awayMarket)}</BookTooltip>
                      </td>
                      <td className="open-cell">{fmtSigned(awayOpen)}</td>
                      <DiffCell diff={awayDiff} />
                      <TagDot tag={row.away_tag} note={row.key_number_note} />
                      <BestBetCell bet={bestBet} note={row.key_number_note} rowSpan={2} />
                    </tr>
                    <tr
                      className={hoveredGame === row.game_id ? "row-hover" : ""}
                      onMouseEnter={() => setHoveredGame(row.game_id)}
                      onMouseLeave={() => setHoveredGame(null)}
                    >
                      <TeamCell name={row.home_team} logo={row.home_logo} />
                      <td>{fmtSigned(homeModel)}</td>
                      <td>
                        <BookTooltip entries={booksTooltip(row.home_books)}>{fmtSigned(homeMarket)}</BookTooltip>
                      </td>
                      <td className="open-cell">{fmtSigned(homeOpen)}</td>
                      <DiffCell diff={homeDiff} />
                      <TagDot tag={row.home_tag} note={row.key_number_note} />
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )
      )}

      {!loading && tab === "totals" && (
        filteredLines.length === 0 ? (
          <div className="empty">No games found for this week/conference.</div>
        ) : (
          <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Away</th>
                <th>Home</th>
                <th>Model Total</th>
                <th>Market Total</th>
                <th>Open Total</th>
                <th className="sortable" onClick={() => toggleSort("totalDiff")}>
                  Diff {sortKey === "totalDiff" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.map(row => (
                <tr key={row.game_id}>
                  <td className="date-cell">{fmtDate(row.start_date)}</td>
                  <TeamCell name={row.away_team} logo={row.away_logo} />
                  <TeamCell name={row.home_team} logo={row.home_logo} />
                  <td>{fmt(row.model_total)}</td>
                  <td>{fmt(row.market_total)}</td>
                  <td className="open-cell">{fmt(row.market_total_open)}</td>
                  <DiffCell diff={row.totalDiff} />
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
                <th>Sources</th>
              </tr>
            </thead>
            <tbody>
              {filteredRatings.map(row => (
                <tr key={row.school}>
                  <td className="rank">{row.rank}</td>
                  <TeamCell name={row.school} logo={row.logo_url} />
                  <td><span className="conf-badge">{row.conference}</span></td>
                  <td>{fmt(row.power_rating)}</td>
                  <td className="open-cell">{row.sources_used ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )
      )}
      <style jsx global>{`
        .book-tooltip-wrapper {
          position: relative;
          display: inline-block;
          cursor: default;
        }
        .book-tooltip-content {
          display: none;
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 6px;
          background: #18181b;
          border: 1px solid #3f3f46;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          white-space: nowrap;
          z-index: 50;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
        }
        .book-tooltip-wrapper:hover .book-tooltip-content {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .book-tooltip-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          color: #d4d4d8;
        }
        .book-tooltip-row span:first-child {
          color: #a1a1aa;
        }
      `}</style>
    </div>
  );
}
