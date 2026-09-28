# stat-track: ideas beyond the MVP

Opinionated. Grounded in what the data actually contains as of 2026-09-27 (20 of 160 games,
235 goals, 16 rinks across Alberta). Effort: **S** = an evening, **M** = a weekend, **L** = several weekends.

Two principles shape everything below:

1. **This is 7-year-old hockey.** Outcomes are driven by who showed up, line deployment and
   blowouts (median margin is 7; the largest is 16). Most "advanced" stats are noise at this level.
   The stuff that's actually valuable is logistics, celebrating moments, and story.
2. **Named minors on a public URL.** `noindex` is already set, which is good. Every feature
   should pass one test: would a parent of a kid on *another* team be fine seeing this? That rules out
   penalty leaderboards, goalie "worst SV%" rankings, and any negative framing, in LLM text or not.

---

## 0. Fix first: a live data bug

**The "Goals by period" numbers are wrong right now.** `scripts/parse.mjs:139` matches every table
with a `Team | 1 | 2 | 3 | T` header. The game page has **two** of them: goals by period and
**shots by period**. Both get pushed into `game.periods`, so 16 of the 20 games have 6 "periods".
Stars show `gfByPeriod` summing to 135 on 38 actual goals. It also shows up in the game page box
score, which renders six columns.

- Fix: take only the first matching table as `periods`, and store the second as `shotsByPeriod`.
- **This is also a win.** The shots table is far more complete than the goalie lines. Game 2019923:
  goalie-derived shots are 0 for both teams, but the shots table has 39 to 16. Rebuild team SF/SA
  (and SV%) from it. Riggers currently show SF 0 / SA 0 over 4 games.
- It's noisy too. Game 2019944 has away shots 6 and away goals 7, which is impossible. So add it to the
  warnings check (below).
- Effort **S**. Should land before anything else, including the charts that would chart this field.

---

## 1. Charts and analytics, ranked by real value

| # | Idea | Why parents/coach care | Effort | Honest verdict |
|---|---|---|---|---|
| 1 | **Game flow chart** (running score over the 45 min, goal dots with scorer on hover, penalty shading) on each game page | Turns a box score into the story of the game ("we were down 2-0 and came back"). Also good for grandparents who weren't there. | S | **Build it.** Uses only the timeline, which is the most reliable data we have. Clock counts *down* (e.g. `04:42` before `04:23`), so elapsed = period*15min - time. Skip events with an invalid clock (`06:86`). |
| 2 | **Season progression for my team**: cumulative GF/GA line and a W/L strip by weekend | "How are we doing" at a glance, and it shows improvement across the season. | S | Build it. Team-level, 32 games, enough to be real. |
| 3 | **Weekend/tournament view**: group games by Fri to Sun, record for the weekend, top moments | Games happen 4 per weekend, and that's how parents experience them. | S | Build it (pairs with the weekend summary in section 3). |
| 4 | **Goal timing heatmap** (by period and 3-minute bucket), division-wide and per team | Coach-relevant. Do we fade in the 3rd? Do we start slow? | S | Fine at team/division level (roughly 1,900 goals by season end). **Not per player**, where it's meaningless. |
| 5 | **Assist network** ("who sets up whom") for my team, as a chord or force graph | Parents love seeing their kid connected to teammates. At U8 the graph mostly reveals **the coach's line combinations**, which is interesting in itself. | M | Worth it **after the midpoint**. Only 49% of goals have an assist, so it's sparse now. By season end Stars will have ~300 goals, which is enough. Frame it as "linemates", not a ranking. |
| 6 | **"My season" player view**: a kid's own points by weekend and firsts, compared only to themselves | This is the page a parent actually opens. Growth over time is the right frame for a 7-year-old. | S | Build it. Deliberately **not** player-vs-player comparison. |
| 7 | Player comparison (A vs B side by side) | Tempting | S | **Skip or keep it hidden.** It invites "my kid vs your kid" and says nothing a coach doesn't already know. |
| 8 | Strength of schedule | Seems fair | S | **Low value.** With 10 teams and 32 games everyone plays everyone about 3 to 4 times, so SOS converges to near-identical. Maybe one line on the standings page mid-season. |
| 9 | Pythagorean expectation / "luck" | Stats-nerd appeal | S | **Skip.** The exponent is calibrated for NHL scoring. With 38-3 goal differentials over 4 games it just restates the differential. |
| 10 | "Clutch" stats: GWG, 3rd-period goals, tie-breakers | Sounds exciting | S | **Skip, and de-emphasize the existing GWG column.** In an 8-1 game the league tags the *second* goal as the GWG (game 2019918). At this age GWG is a fact about the final margin, not about the kid. Actual comeback and tying goals (from the game-flow data) are better "moment" stats. Surface them as moments, not a leaderboard. |
| 11 | Shot share (Corsi-lite) per team from the shots table | Coach-relevant ("we outshot them 40-8") | S | OK *after* fixing section 0, team level only, and with the noise caveat shown. |
| 12 | Rolling form / Elo-style power ranking | Standings already say it | S | Meh. A simple "last 2 weekends" record is enough. |

**Also: soften a few things that already exist.** Hide the **PIM** column on the public skater
leaderboards. There are 29 "Body Check" minors in 20 games, which is normal as kids learn, but a
PIM leaderboard of named 7-year-olds is not a good look. Consider replacing the goalie leaderboard
(SV%/GAA are admittedly unreliable, and goalies rotate. Stars have two skaters taking turns) with a
friendly **"games in net"** list.

---

## 2. LLM game recaps and weekly summaries

### The cautionary tale is the spec

The league's own auto-recaps contradict their box scores. Our whole value proposition is being the
*accurate* source, so a hallucinated recap is worse than no recap. That leads to three rules:

1. **The LLM never computes anything.** Code builds a fact sheet containing every claim that's
   allowed to appear: running score, lead changes, comebacks, hat tricks, firsts. The model only
   turns facts into sentences.
2. **Code validates every number and every name in the output** against the fact sheet. If
   validation fails, retry once with the errors. If it fails again, publish a **deterministic
   template recap** instead. Something correct always ships.
3. **Tone rules are enforced by code as well as the prompt**, using a banned-phrase list and
   mention-coverage checks.

### Where it runs: recommendation is a hosted API from the Action

| | Local Ollama on the Windows PC | Hosted API from the GitHub Action |
|---|---|---|
| Cost | $0 plus electricity | **Under ~$2 per season** (see below) |
| Availability | PC has to be on and awake. Games finish while you're at a rink in Conklin. | Runs every 2h with the scraper, no babysitting |
| Plumbing | Needs a local scheduled task: pull, generate, commit, push. It races the bot's commits. Also note `update.yml` only redeploys on pushes to `site/**`, `scripts/**` or the workflow, so recaps committed under `data/` wouldn't redeploy. | One more step in the existing workflow, plus an `ANTHROPIC_API_KEY` secret |
| Quality | 7 to 12B models (Qwen3 8B, Llama 3.1 8B, Gemma 3 12B are the realistic options on a consumer GPU) are decent at prose but noticeably worse at number fidelity and at following "mention everyone fairly" rules. The validator would catch those errors, but you'd fall back to the template more often. | Small hosted models follow structured, grounded prompts reliably |
| Privacy | Kids' names never leave your PC | Names go to the API provider. They're already public on the league site, so this is a minor delta. |

**Cost math.** A recap needs a fact sheet plus instructions of about 2.5K input tokens and about
350 output tokens. With **Claude Haiku 4.5** ($1 input / $5 output per MTok) that's about $0.004 per
recap. **Claude Sonnet 5** ($2 / $10) is about $0.009. A season is 32 Stars games plus about 9
weekend summaries plus retries, so roughly 50 calls: **$0.20 with Haiku, $0.45 with Sonnet 5**.
Recapping all 160 division games is still under $2. The Batch API halves it again, but that's not
worth the async complexity at this volume. **Recommendation: Sonnet 5.** Tone about named kids *is*
the product, and the difference between the two is pocket change.

**Keep Ollama as a pluggable provider** (`RECAP_PROVIDER=ollama|anthropic`) for local dev and
prompt iteration: `ollama run qwen3:8b` against the same fact sheets, for free, while you tune tone.
Because the fact sheet, validator and cache are identical either way, switching is one env var.

### Concrete design

```
update.yml:  scrape -> build -> recaps -> build(again, merges recaps) -> commit data/ -> deploy
                                   |
scripts/recaps.mjs
  for each final game involving myTeam (config: recapScope = 'myTeam' | 'all'):
    facts = buildFacts(game)                  # deterministic, scripts/facts.mjs
    key   = sha256(facts + PROMPT_VERSION + model)
    if data/recaps/<id>.json has the same key -> skip   (cache: never regenerate unchanged games)
    if game final < 3h ago -> skip this run   (let stat corrections settle; scraper re-fetches for 2 days)
    text = llm(facts)  -> validate -> retry once -> else template(facts)
    write data/recaps/<id>.json { key, model, promptVersion, source: 'llm'|'template',
                                  headline, body, generatedAt, validation: [...] , hidden: false }
  weekly: after the last game of a Fri-Sun block -> data/recaps/weekend-<date>.json (same flow)
  MAX_CALLS_PER_RUN = 12                      # cost/runaway guard
```

- **The cache key includes the facts hash**, so a league stat correction automatically regenerates
  that recap and nothing else. Bumping `PROMPT_VERSION` regenerates everything on purpose.
- **Kill switch:** `hidden: true` in any recap file, which you can set by editing it in the GitHub web
  UI, plus a global `recaps.enabled` in `config.mjs`.
- **Commit path:** the bot already commits `data/`. Recaps ride along, and `build.mjs` merges them
  into `stats.json` (or a separate lazily-loaded `recaps.json`).

**Fact sheet** (what the model sees, in full, and nothing else). The score and periods are from game
2019931. The moments and scoring lines are illustrative only.

```json
{
  "perspective": "Stars Hockey Academy",
  "opponent": "Capital City Knights",
  "result": "win", "score": {"us": 10, "them": 0}, "margin_band": "lopsided",
  "date": "Saturday, Sept 26", "rink": "Viking Carena Complex",
  "periods": [{"p":1,"us":5,"them":0},{"p":2,"us":2,"them":0},{"p":3,"us":3,"them":0}],
  "moments": [
    {"type":"first_goal_of_game","player":"Elias P.","period":1},
    {"type":"hat_trick","player":"Tucker D."},
    {"type":"first_goal_of_season","player":"George T."},
    {"type":"shutout_team","goalie":"Owen M."}
  ],
  "scoring": [{"player":"Tucker D.","g":3,"a":0},{"player":"Elias P.","g":1,"a":2}, "..."],
  "in_net": ["Owen M."],
  "roster_count": 15,
  "allowed_numbers": [10,0,5,2,3,1,26,15],
  "allowed_names": ["Tucker D.","Elias P.","George T.","Owen M.", "..."]
}
```

Use first name plus last initial. The model then *can't* leak a full name it wasn't given. Opponents are
referred to by **team only**: no other-team kids named in our recaps.

**Prompt structure**

- *System (frozen, cacheable):* You write short, warm recaps for parents of a 7-year-old hockey
  team. Use only facts in the provided JSON. Never invent plays, saves, effort or emotions. Never
  compute or state a number that isn't in `allowed_numbers`. Rules: celebrate effort and moments,
  not dominance. Never describe the opponent negatively. In lopsided games, don't dwell on the score:
  mention it once, then focus on moments. In losses, lead with a positive team moment. Never
  mention goals against in connection with a goalie by name; the goalie is always thanked, never
  graded. No penalties by player name. Mention **every** player listed in `scoring`, and the goalie(s).
  Headline of 8 words or fewer. Body of 80 to 140 words. Plain text, no emoji.
- *User:* the fact sheet JSON.
- *Output:* structured output `{ headline, body, mentioned: [names] }`, so the validator doesn't have to parse prose
  to check coverage (it still double-checks the prose).

**Validator (code, not vibes)**

- Every integer and number-word in `headline + body` is in `allowed_numbers`.
- Every capitalized name-like token is either in `allowed_names`, is a team name, or is on a small allowlist
  (rink, month names).
- `mentioned` ⊇ everyone in `scoring` ∪ `in_net`, and each of them actually appears in `body`.
- Banned phrases (regex): blowout, crushed, destroyed, humiliat*, embarrass*, weak, terrible,
  "let in", "gave up", "should have", "mistake", "sloppy".
- Length limits. A failure list gets fed back into the one retry.

**Weekend summary:** same pipeline, but the facts are aggregated across the weekend's games, with a
fixed structure: record, a highlights list (firsts and hat tricks), "everyone who scored this
weekend", and next weekend's rinks and times (from the schedule, deterministic). This one is the
most shareable thing on the site: parents will paste it into the team group chat.

Effort: **M** (facts + template + validator is most of it; the LLM call is ~30 lines).

---

## 3. Parent/coach features

| Idea | Pitch | Why it matters | Effort | Risks |
|---|---|---|---|---|
| **Weekend planner** | Next weekend's games, rinks, times, map links, gap between games, and a "you'll be driving to Conklin" heads-up | Stars play at 16 rinks across Alberta, often 4 games in 3 days. For parents this is the most-used page, more than any stat. | S | Needs a hand-maintained `rinks.json` (address/lat-long for 16 rinks, one time). |
| **Calendar subscribe** | Build a Stars-only `.ics` into `site/` that includes rink addresses | One tap and every game is in the family calendar, updated when the league changes times | S | The league's feed covers the whole division, so filtering is the value add. Calendar apps poll slowly (hours), which is fine. |
| **Milestones / "firsts" feed** | "First goal of the season!", first assist, first hat trick, first game in net, 10th point | Pure positive, and every kid eventually gets one. It's what parents screenshot. | S | Naming clash: `firstGoals` in `build.mjs` means "first goal of *the game*", so name the new one clearly. "First ever" is only "first *tracked*", so word it as "first this season". |
| **Shareable player card** | Client-side canvas renders a PNG: logo, number, season line, latest milestone. Download or share. | Grandparents, fridge, end-of-season | M | Card design matters more than code. Don't include rankings. Consider making it opt-in per player (only favorites). |
| **Notifications** | Action POSTs to a private [ntfy.sh](https://ntfy.sh) topic when a Stars game goes final or a recap is published | "Final: Stars 6-2, recap here" on your phone | S | Free, no backend. Topic name is effectively a password, so keep it in a secret. Web Push is out: it needs a server. |
| **End-of-season yearbook** | A printable page (print CSS): team record, every player's season line and firsts, the best recaps, one award per kid | The end-of-season party handout. High emotional value. | M | **Awards must be one per kid and non-ranking** ("Most Assists" is fine only if every kid gets *a* category). LLM can draft award blurbs from facts with the same validator. |
| **Coach's corner** | `data/notes/<gameId>.md` the coach or you can add via GitHub web edit, shown on the game page | Human context the data can't capture ("first game with new lines") | S | Needs the coach to have a GitHub login, or you relay. |
| **"Since you last visited"** | localStorage timestamp, then a banner: "3 new games, Elias +2 points" | Makes the site feel alive | S | None. |

---

## 4. Data quality, multi-division, multi-season

| Idea | Pitch | Effort | Notes |
|---|---|---|---|
| **Automated consistency checks** (extend `warnings`) | Timeline goals == final score (all 20 pass today); shots ≥ goals; goalie minutes ≈ 45; period sums == final; duplicate jersey numbers | S | Cheap and catches parser regressions like section 0 automatically. Fail the build loudly if more than X% of games warn. |
| **Parser fixture tests** | Save 3 or 4 raw game HTML pages to `test/fixtures`, snapshot `parseGame` output | S | The league site will change markup mid-season. This is how you find out on day one and not week six. |
| **Data health page** | `#/data`: warnings per game, last scrape time, games final-but-missing-detail | S | Builds trust. Shows parents you know the goalie numbers are shaky. |
| **Multi-division** | `config.divisions = [...]`, output `site/<slug>/data/stats.json`, division picker | M | Only if other parents ask. Scrape cost scales linearly (800ms politeness delay per game). |
| **Multi-season archive** | At season end, freeze `stats.json` to `site/archive/2026-27/`. Player pages link across seasons by `playerId` | S–M | Real value appears in year 2 ("Elias at 7 vs at 8"). Worth designing the path now so URLs don't break. |
| **Roster identity** | Map players who change jersey number or team (the code already keeps "most recent number") | S | Low priority. |

---

## 5. Other ideas worth considering

- **"Every kid" leaderboard alternative:** instead of Top-N scorers, a **team wall** where every Stars
  player gets a tile with their season line and latest milestone, in alphabetical order. The same
  data, framed as a team rather than a ranking. **S**.
- **Recap in the group chat format:** a "copy for WhatsApp" button on the weekend summary that produces
  plain text with the site link. That's where the audience actually is. **S**.
- **Pre-weekend preview** (deterministic, or LLM with the same guardrails): who we play, head-to-head so
  far, rinks. **S**. Keep it to schedule facts, with no "we should crush them".

---

## Top 5: do next, in order

1. **Fix the period/shots parse bug** and add consistency checks plus one parser fixture test (S).
   The site is currently publishing wrong period numbers, and the fix unlocks usable shots data.
2. **Weekend planner + Stars `.ics` subscribe** (S). This is the highest-utility feature for parents, is
   independent of stat quality, and covers 16 rinks over roughly 9 more weekends.
3. **Milestones feed + game flow chart** (S + S). Positive, story-shaped, and uses the most reliable
   data (the timeline). Milestones also become the `moments` input for recaps, so this is groundwork for #4.
4. **LLM game recaps + weekend summary for Stars games** (M), with the design above: facts, then the LLM,
   then the validator, then a template fallback, all cached by facts hash.
5. **Tone pass on what exists** (S): hide public PIM, swap the goalie leaderboard for "games in net",
   de-emphasize GWG, add the team wall.

Deliberately *not* in the top 5: assist network (wait for data), shareable cards and yearbook (do
them in February for the season-end push), multi-division (wait for demand).

## LLM recap recommendation, in one paragraph

Generate recaps **inside the existing GitHub Action with a hosted API** (Claude Sonnet 5, about $0.50
per season for Stars games, under $2 for the whole division). Don't use local Ollama as the production
path: it ties publishing to your PC being on during tournament weekends, and small local models fail
number-fidelity checks more often. Keep Ollama as a free, pluggable provider for iterating on
prompts. The part that matters isn't the model; it's the pipeline around it. A **deterministic fact
sheet** carries every allowed claim (the model computes nothing). **Code validates** every number and name,
enforces mention coverage and banned phrases, and falls back to a **template** on failure. Output is
**cached by a hash of facts + prompt version**, so only new or corrected games regenerate. Recaps
**name only our players (first name + last initial)** and never grade a goalie. That's the direct
answer to the league's own recaps contradicting their box scores: ours can't, by construction.
