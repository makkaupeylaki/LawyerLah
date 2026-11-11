# lawyerlah

*Your kaki for Singapore law basics.*

A person describes an everyday situation in Singapore (tenancy, employment or traffic for v1) and gets a plain-English
pointer to which Act and section seems relevant, what it says simply, what is unclear or depends, and a link to that
section on Singapore Statutes Online. It never says whether something is legal or illegal and never gives a verdict or
advice. Every answer carries: "Not legal advice. For general understanding only. Ask a lawyer for your situation."

One Cloudflare Worker serves both the static site and the API, so they share an origin:

```
browser ──► GET  /, /about, /style.css …  ──► worker/index.js ──► ASSETS (web/, Workers static assets)
        ──► POST /api/ask                 ──►                 ──► askModel() ──► Workers AI (binding AI)
        ──► POST /api/feedback            ──►                 ──► KV FEEDBACK
            caps: 10/visitor/day (IP hash) + 300/day overall  ──► KV LIMITS
```

| Path | What |
| --- | --- |
| `web/index.html`, `web/about.html` | Pages. Plain HTML/CSS/JS, no build step. Logo is inline SVG (header + favicon). |
| `web/app.js` | Ask form, example chips, topic list, loading / limit / offline / error states, feedback buttons, demo-data banner, official routes. Calls `/api/*` on the same origin. |
| `web/og.png` | 1200×630 social preview image. |
| `worker/index.js` | The API, plus serving `web/` as static assets. All model calls go through `askModel(prompt, env)`. |
| `worker/wrangler.toml` | Worker config, bindings and vars. |
| `data/laws.json` | Fallback law data, used only when the `LAWS` KV namespace is missing or empty. **Currently PLACEHOLDER**: 3 entries per topic. |
| `data/routes.json` | Official routes per topic (MOM, TADM, ECT, HDB, Small Claims Tribunals, Pro Bono SG, police) with eligibility, limits and links. Fixed text, never generated. |

## Bindings needed

| Binding | Type | Used for |
| --- | --- | --- |
| `ASSETS` | Workers static assets (`[assets]`, directory `../web`) | The site itself |
| `AI` | Workers AI | The model, while `PROVIDER = "cloudflare"` |
| `LAWS` | KV namespace | The law entries the answers use (see [Law data](#law-data)). Read by the Worker and cached in memory for 60 s. |
| `LIMITS` | KV namespace | Daily counters: `ask:<date>:<hash>` (10 questions per visitor), `global:<date>` (all visitors, `GLOBAL_DAILY_CAP`) and `fb:<date>:<hash>`. Keys expire after 2 days. The IP itself is never stored, only a SHA-256 of date + IP. |
| `FEEDBACK` | KV namespace | Helpful / Wrong votes: `{ at, vote, question, act, section }` |

Vars in `wrangler.toml`: `GLOBAL_DAILY_CAP` (default `300` model calls/day across all visitors) and `SITE_URL`
(optional absolute base for canonical/OG URLs; empty = the origin the page was requested on). The HTML keeps those
URLs relative and the Worker makes them absolute, so no domain is hard-coded.

Only if you switch to DeepSeek: a secret `DEEPSEEK_API_KEY` (`npx wrangler secret put DEEPSEEK_API_KEY`). It is never
in the repo. For local dev put it in `worker/.dev.vars` (git-ignored).

## API

- `POST /api/ask` `{ "question": "..." }` →
  `{ notCovered, shortAnswer, figuresNote, howItApplies, depends[], sources[], demo, demoNotice, routes }`.
  - `shortAnswer`: 2–4 sentences stating the rule with its real numbers, no section numbers. `howItApplies`: 1–2
    neutral sentences on which part of the rule matches. `depends`: up to 5 facts that would change the answer.
  - `sources`: up to 3 `{ act, section, title, sourceUrl }`, shown as a small "Source" footnote.
  - `figuresNote`: "The exact figures are not in the text I have. Check the source below." when the short answer
    fell back to the stored summary or a matched entry has no figures in `keyNumbers`; otherwise `null`.
  - `demo: true` and `demoNotice: "DEMO DATA, not real law"` when any matched entry is PLACEHOLDER
    (`"placeholder": true` or "PLACEHOLDER" in its text); that entry's `sourceUrl` is `null`. The page shows a banner
    on every such answer.
  - `routes`: `[{ name, what, eligibility, limits, url }]` from `data/routes.json` for the matched topics.
  - Not covered → `notCovered: true`, `sources` and `routes` are empty, and `shortAnswer` starts with "Not covered".
  - Errors are `{ error, message }`: 400 `empty` / `too_long` (over 500 chars) / `rejected` (abusive words or prompt
    injection) / `bad_request`, 429 `limit` (visitor's 10/day) or `global_limit` (overall cap), 502 `model`.
  - A visitor's question counts only after the model answers, so a failed model call doesn't use one up. The global
    counter counts every model call, failed or not, since it guards the AI budget. KV has no atomic increment, so a
    burst of parallel requests can overshoot either cap slightly.
- `POST /api/feedback` `{ "vote": "helpful" | "wrong", question, act, section }` → `{ ok: true }`.

## Model

In `worker/index.js`:

- `PROVIDER` — `"cloudflare"` (default) or `"deepseek"`.
- `MODELS` — the model name per provider (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `deepseek-chat`).
- `SYSTEM_PROMPT` — answer only from the provided law text, copy numbers exactly, say what's missing instead of
  guessing, cite up to 3 entries by id, answer "not covered" if nothing fits, never a legal/illegal verdict, never
  advice, reply in JSON.

The model picks up to 3 entry ids and writes the short answer, how it applies and the bullets from those entries'
official text, summary and key numbers only. The Act name, section and SSO link always come from the law data, never
from the model. Before an answer is returned:

- **Number check.** Every number in the short answer (digits, or spelled out like "seven days") must match a value
  listed in the matched entries' `keyNumbers`, as a number + unit pair: "50 km/h" passes only if `keyNumbers` has
  "50 km/h", not "50 days" or a bare "50". Digits that appear only elsewhere in the law text (the Act year, section
  numbers) don't count, and the Act year never passes as a quantity. A sentence that fails is dropped. "How it
  applies" and the bullets get the same check, but may also repeat numbers from the person's own question. This
  catches most guessed or altered figures, but it is not a guarantee: a wrong figure can still get through if it
  happens to equal a stored value with the same unit, or is phrased in a way the check doesn't recognise as a number.
- **References stripped.** Every reference to a section, s., sec., §, or an Act (name, year, Cap. number or
  abbreviation such as "RTA") is removed from the short answer and "How it applies", or replaced with "the rule" /
  "the law". The source footnote is the only place for them.
- **Wording filter.** Any sentence that says legal/illegal/lawful/unlawful, entitled, breach, guilty, liable, gives
  odds, or gives advice ("you should", "I recommend") is dropped.
- **Fallback.** If nothing usable is left, the short answer falls back to the entries' human-written `summary`.
- **Missing figures.** If the fallback is used, or a matched entry has no figures in `keyNumbers`, the answer carries
  `figuresNote`: "The exact figures are not in the text I have. Check the source below.", shown under the short
  answer.

## Official routes

The "Official routes that may apply" part of an answer comes only from `data/routes.json`, never from the model. It
describes each route and its conditions; it must never say what the user should do, never say anyone is entitled or
in breach, and never give odds. Keep that wording when editing the file, and re-check limits against the linked
official pages (last checked November 2026).

## Law data

Laws are changed by **writing to the `LAWS` KV namespace, not by redeploying**. The Worker reads `LAWS` and caches it in
memory for 60 seconds, so a change shows within about a minute. Only if `LAWS` is missing, empty or unreadable does it
fall back to `data/laws.json`, which is bundled at deploy time.

`LAWS` can hold the entries in either of two ways:

- **One key `laws`** (checked first, and the cheaper option: one KV read per minute): either a JSON array of entries,
  each with a `topic`, or the same `{ "topics": { "tenancy": [...], ... } }` object as `data/laws.json`.
- **One key per entry** (used when there is no `laws` key): any key name, value = one entry with a `topic`. This
  costs a KV list plus one read per entry each minute, and KV's free tier allows 1,000 lists a day.

Each entry: `{ id, topic, placeholder, act, section, title, officialText, summary, keyNumbers: [{ label, value }], sourceUrl }`.
`topic` is `tenancy`, `employment` or `traffic` (it picks the official routes; inside the `topics` object it comes
from the group). `officialText` is the section's wording from SSO, `summary` a plain-English summary of it, and
`keyNumbers` every figure (speed limits, fines, demerit points, notice periods, deadlines) as its value **with its
unit**, exactly as the text states it, e.g. `"50 km/h"`, `"$1,000"`, `"7 days"`, `"4 demerit points"`. Only these
values can appear as numbers in a short answer. A value of `"PLACEHOLDER"` means the figure isn't supplied yet.
Entries without `id`, `act`, `section` or `topic` are ignored.

```sh
cd worker
# whole set in one key (this file's shape works as-is)
npx wrangler kv key put laws --path=../data/laws.json --binding=LAWS --remote
# or one entry per key
npx wrangler kv key put traffic-1 --path=traffic-1.json --binding=LAWS --remote
```

All entries in `data/laws.json` are **PLACEHOLDER**: the text is a stand-in, and the Act names, section numbers and
`sourceUrl` deep links (`https://sso.agc.gov.sg/Act/<code>?ProvIds=pr<n>-#pr<n>-`) must be checked against SSO when the
real text is supplied. Entries marked PLACEHOLDER are served as DEMO DATA with no SSO link, whichever source they come
from.

## Deploy

```sh
cd worker
npx wrangler kv namespace create LAWS       # paste the id into wrangler.toml
npx wrangler kv namespace create LIMITS     # paste the id into wrangler.toml
npx wrangler kv namespace create FEEDBACK   # paste the id into wrangler.toml
npx wrangler deploy                         # deploys the Worker and uploads web/ as its static assets
```

Add a custom domain to the Worker in the Cloudflare dashboard if you want one, and set `SITE_URL` to it.

## Local development

```sh
cd worker && npx wrangler dev     # site + API on http://localhost:8787 (Workers AI runs remotely, needs wrangler login)
```
