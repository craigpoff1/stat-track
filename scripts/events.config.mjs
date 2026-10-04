// Non-season tournaments ("events"). Add an event here when Craig names one to track.
//   platform 'ramp'  → full game sheets scraped from the event's RAMP site (same parser as HSL)
//   platform null    → not published yet; the event page shows opponent scouting only
// External leagues are opponent background data shared across events (e.g. HPL for BC teams).
export const externalLeagues = [
  {
    id: 'hpl',
    adapter: 'kreezee',
    league: 'HPL Winter League',
    region: 'BC · Lower Mainland',
    base: 'https://hpl-winter-league.kreezee-sports.com',
    solutionId: 20968,
    seasonId: 15610,
    divisionId: 19880,
    divisionName: '2019 AAA Division',
    seasonStart: '2026-09-01',
    seasonEnd: '2027-04-30',
  },
];

export const events = [
  {
    id: 'pacific-duel-2026',
    name: 'Pacific Duel',
    season: '2026-27',
    dates: ['2026-10-02', '2026-10-04'],
    platform: 'ramp',
    base: 'https://pacificduel.com',
    calendar: 'https://pacificduel.com/calendar/master-schedule/3477.ics?SID=14795&DID=39834&TournamentAID=3477&TZ=America%2FEdmonton',
    divisionId: 39834,
    divisionName: '2019 Pacific Duel',
    leagues: ['hpl'],
  },
  {
    id: 'challenge-cup-2026',
    name: 'Challenge Cup',
    season: '2026-27',
    dates: ['2026-10-20', '2026-10-20'], // approximate — exact dates TBC
    datesApprox: true,
    platform: null, // likely pacificduel.com (RAMP) once published
    leagues: ['hpl'],
    focus: ['hpl:148550', 'hpl:148552', 'hpl:148548'], // Beavers, Lumberjacks, Flyers
  },
];
