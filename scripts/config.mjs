// League + division this site tracks. IDs come from hockeysuperleague.ca URLs.
export const config = {
  baseUrl: 'https://hockeysuperleague.ca',
  leagueName: 'Hockey Super League',
  assocId: 481,           // the "481" in /calendar/master-schedule/481.ics
  seasonId: 13952,        // 2026-27
  seasonName: '2026-27',
  divisionId: 37783,
  divisionName: '2019 Major',
  myTeamId: 402384,       // Stars Hockey Academy — highlighted throughout the site
  regulationMinutes: 45,  // 3 x 15; used to normalize goalie GAA
  timezone: 'America/Edmonton',
};

export const scheduleIcsUrl = (c = config) =>
  `${c.baseUrl}/calendar/master-schedule/${c.assocId}.ics?SID=${c.seasonId}&DID=${c.divisionId}&TZ=${encodeURIComponent(c.timezone)}`;

export const gameUrl = (id, c = config) => `${c.baseUrl}/division/0/${c.divisionId}/game/view/${id}`;
