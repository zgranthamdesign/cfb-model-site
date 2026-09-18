import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Season-to-date team profile for the team panel's Summary tab, written by
// sync_team_profiles.py. Fetched when the tab opens.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get("season") || "2026", 10);
  const team = searchParams.get("team");
  if (!team) {
    return NextResponse.json({ error: "team is required" }, { status: 400 });
  }

  const { data: teams } = await supabase.from("teams").select("team_id").eq("school", team).limit(1);
  const teamId = teams?.[0]?.team_id;
  if (!teamId) {
    return NextResponse.json({ error: "No summary for this team yet" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("team_profiles")
    .select("through_week, data, updated_at")
    .eq("season", season)
    .eq("team_id", teamId)
    .limit(1);

  if (error || !data?.length) {
    return NextResponse.json({ error: "No summary for this team yet" }, { status: 404 });
  }
  return NextResponse.json(data[0]);
}
