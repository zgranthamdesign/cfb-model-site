// Shared grading logic for a single game: which side/total the model
// likes, and (once final) whether that pick actually won ATS/O-U.
// Used by both /api/lines and /api/record so the math only lives once.

export function gradeGame({ home, away, line, game }) {
  // The side the MODEL likes, not just whoever the market favors.
  // If the model thinks the market's favorite wins by less than the
  // market says (or even prefers the other team outright), the value
  // is on the underdog getting those points, e.g. "SJSU +39"
  // instead of always showing "USC -39".
  let bet_team = null;
  let bet_spread = null;
  let bet_spread_open = null;
  if (line.market_spread != null && line.model_spread != null && home && away) {
    const home_is_favorite = line.market_spread < 0;
    const market_favorite_spread = Math.abs(line.market_spread);
    const model_favorite_spread = home_is_favorite ? -line.model_spread : line.model_spread;

    const modelLikesUnderdog = model_favorite_spread < market_favorite_spread;
    if (modelLikesUnderdog) {
      bet_team = home_is_favorite ? away.school : home.school;
      bet_spread = market_favorite_spread;
      if (line.market_spread_open != null) bet_spread_open = Math.abs(line.market_spread_open);
    } else {
      bet_team = home_is_favorite ? home.school : away.school;
      bet_spread = -market_favorite_spread;
      if (line.market_spread_open != null) bet_spread_open = -Math.abs(line.market_spread_open);
    }
  }

  // Grade the model's pick against the spread (ATS), once the game
  // has a final score. adjusted_margin = bet_team's actual scoring
  // margin + bet_spread (already signed for that team): positive
  // means the bet covered, negative means it didn't, zero is a push.
  let ats_result = null;
  if (game.completed && game.home_points != null && game.away_points != null && bet_team && bet_spread != null && home && away) {
    const bet_team_is_home = bet_team === home.school;
    const actual_margin = bet_team_is_home
      ? game.home_points - game.away_points
      : game.away_points - game.home_points;
    const adjusted_margin = actual_margin + bet_spread;
    ats_result = adjusted_margin > 0 ? "COVER" : adjusted_margin < 0 ? "NO_COVER" : "PUSH";
  }

  // Which side of the total the model likes: OVER if model_total is
  // higher than the market number, UNDER if lower.
  let total_pick = null;
  if (line.model_total != null && line.market_total != null) {
    total_pick = line.model_total > line.market_total ? "OVER" : line.model_total < line.market_total ? "UNDER" : null;
  }

  // Grade the total pick once the game is final.
  let total_result = null;
  if (game.completed && game.home_points != null && game.away_points != null && total_pick && line.market_total != null) {
    const actual_total = game.home_points + game.away_points;
    const diff = actual_total - line.market_total;
    if (total_pick === "OVER") {
      total_result = diff > 0 ? "COVER" : diff < 0 ? "NO_COVER" : "PUSH";
    } else {
      total_result = diff < 0 ? "COVER" : diff > 0 ? "NO_COVER" : "PUSH";
    }
  }

  return { bet_team, bet_spread, bet_spread_open, ats_result, total_pick, total_result };
}
