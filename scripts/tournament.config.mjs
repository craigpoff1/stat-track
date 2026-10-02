// One-off tournament area (Challenge Cup). Opponent data comes from other leagues via adapters.
export const tournament = {
  key: 'challenge-cup',
  name: 'Challenge Cup',
  approxDate: '2026-10-20', // exact dates TBC
  // Teams we expect to face; listed first and compared side by side. Ids are source-league team ids.
  focus: ['hpl:148550', 'hpl:148552', 'hpl:148548'], // Beavers, Lumberjacks, Flyers
  sources: [
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
  ],
};
