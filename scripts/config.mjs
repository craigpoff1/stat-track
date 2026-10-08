// League + divisions this site tracks. IDs come from hockeysuperleague.ca URLs.
// The main site is 2019 Major. Extra divisions (e.g. 2018 Major) get a simpler stat gallery under
// site/<slug>/ — pick one with DIVISION=<slug> for scrape.mjs / build.mjs (default: the main site).
const league = {
  baseUrl: 'https://hockeysuperleague.ca',
  leagueName: 'Hockey Super League',
  assocId: 481,           // the "481" in /calendar/master-schedule/481.ics
  seasonId: 13952,        // 2026-27
  seasonName: '2026-27',
  regulationMinutes: 45,  // 3 x 15; used to normalize goalie GAA
  timezone: 'America/Edmonton',
};

export const divisions = {
  2019: {
    ...league, slug: '2019', primary: true,
    divisionId: 37783,
    divisionName: '2019 Major',
    myTeamId: 402384,       // Stars Hockey Academy — highlighted throughout the site
    dataDir: 'data', outDir: 'site/data',
  },
  2018: {
    ...league, slug: '2018', primary: false, // gallery only: no tournaments / identity / my team
    divisionId: 32765,      // not 32764 — that "2018" division is a different (Bow Valley, YYC Jays…) group
    divisionName: '2018 Major',
    myTeamId: null,
    regulationMinutes: 55,  // 15 + 20 + 20 (P1 clocks top out at 15:00, P2/P3 at 20:00; goalie lines say 55) — not 2019's 3 x 15
    dataDir: 'data/divisions/2018', outDir: 'site/2018/data',
  },
};

const pick = process.env.DIVISION || '2019';
if (!divisions[pick]) throw new Error(`Unknown DIVISION "${pick}" — expected one of ${Object.keys(divisions).join(', ')}`);
export const config = divisions[pick];

export const scheduleIcsUrl = (c = config) =>
  `${c.baseUrl}/calendar/master-schedule/${c.assocId}.ics?SID=${c.seasonId}&DID=${c.divisionId}&TZ=${encodeURIComponent(c.timezone)}`;

export const gameUrl = (id, c = config) => `${c.baseUrl}/division/0/${c.divisionId}/game/view/${id}`;
