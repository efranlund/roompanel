const TEAMUP_API_BASE = "https://api.teamup.com";

interface CreateEventParams {
  calendarKey: string;
  subcalendarId: number;
  title: string;
  startDt: string; // ISO 8601
  endDt: string;   // ISO 8601
}

interface TeamUpEventResponse {
  event: {
    id: string;
    subcalendar_ids: number[];
    title: string;
    start_dt: string;
    end_dt: string;
  };
}

export async function createEvent(params: CreateEventParams): Promise<TeamUpEventResponse> {
  const apiKey = process.env.TEAMUP_API_KEY;
  if (!apiKey) {
    throw new Error("TEAMUP_API_KEY environment variable is not set");
  }

  const response = await fetch(
    `${TEAMUP_API_BASE}/${params.calendarKey}/events`,
    {
      method: "POST",
      headers: {
        "Teamup-Token": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subcalendar_ids: [params.subcalendarId],
        title: params.title,
        start_dt: params.startDt,
        end_dt: params.endDt,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TeamUp API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}
