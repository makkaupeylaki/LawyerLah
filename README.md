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
| `data/laws.json` | Law text the model may use. **Currently PLACEHOLDER**: 3 entries per topic. |
| `data/routes.json` | Official routes per topic (MOM, TADM, ECT, HDB, Small Claims Tribunals, Pro Bono SG, police) with eligibility, limits and links. Fixed text, never generated. |

## Bindings needed

| Binding | Type | Used for |
| --- | --- | --- |
| `ASSETS` | Workers static assets (`[assets]`, directory `../web`) | The site itself |
| `AI` | Workers AI | The model, while `PROVIDER = "cloudflare"` |
| `LIMITS` | KV namespace | Daily counters: `ask:<date>:<hash>` (10 questions per visitor), `global:<date>` (all visitors, `GLOBAL_DAILY_CAP`) and `fb:<date>:<hash>`. Keys expire after 2 days. The IP itself is never stored, only a SHA-256 of date + IP. |
| `FEEDBACK` | KV namespace | Helpful / Wrong votes: `{ at, vote, question, act, section }` |

Vars in `wrangler.toml`: `GLOBAL_DAILY_CAP` (default `300` model calls/day across all visitors) and `SITE_URL`
(optional absolute base for canonical/OG URLs; empty = the origin the page was requested on). The HTML keeps those
URLs relative and the Worker makes them absolute, so no domain is hard-coded.

Only if you switch to DeepSeek: a secret `DEEPSEEK_API_KEY` (`npx wrangler secret put DEEPSEEK_API_KEY`). It is never
in the repo. For local dev put it in `worker/.dev.vars` (git-ignored).

## API

- `POST /api/ask` `{ "question": "..." }` → `{ act, section, plain, unclear, sourceUrl, demo, demoNotice, routes }`.
  - `demo: true`, `demoNotice: "DEMO DATA, not real law"` and `sourceUrl: null` when the matched entry is marked
    PLACEHOLDER (`"placeholder": true` or "PLACEHOLDER" in its text). The page shows a banner on every such answer.
  - `routes`: `[{ name, what, eligibility, limits, url }]` from `data/routes.json` for the matched topic.
  - Not covered → `act`, `section` and `sourceUrl` are `null`, `routes` is empty, and `plain` starts with "Not covered".
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
- `SYSTEM_PROMPT` — only use the provided law text, cite one entry by id, answer "not covered" if nothing fits, never
  a legal/illegal verdict, never advice, reply in JSON.

The model only picks an entry id; the Act name, section and SSO link always come from `data/laws.json`, never from the
model. Any sentence in the model's reply that says legal/illegal/lawful/unlawful, guilty, or gives advice
("you should", "I recommend") is dropped before it is returned.

## Official routes

The "Official routes that may apply" part of an answer comes only from `data/routes.json`, never from the model. It
describes each route and its conditions; it must never say what the user should do, never say anyone is entitled or
in breach, and never give odds. Keep that wording when editing the file, and re-check limits against the linked
official pages (last checked November 2026).

## Law data

`data/laws.json` has `topics.{tenancy,employment,traffic}`, each a list of
`{ id, placeholder, act, section, title, text, sourceUrl }`. All entries are **PLACEHOLDER**: the text is a stand-in,
and the Act names, section numbers and `sourceUrl` deep links (`https://sso.agc.gov.sg/Act/<code>?ProvIds=pr<n>-#pr<n>-`)
must be checked against SSO when the real text is supplied. The Worker bundles this file at deploy time, so redeploy
after editing it.

## Deploy

```sh
cd worker
npx wrangler kv namespace create LIMITS     # paste the id into wrangler.toml
npx wrangler kv namespace create FEEDBACK   # paste the id into wrangler.toml
npx wrangler deploy                         # deploys the Worker and uploads web/ as its static assets
```

Add a custom domain to the Worker in the Cloudflare dashboard if you want one, and set `SITE_URL` to it.

## Local development

```sh
cd worker && npx wrangler dev     # site + API on http://localhost:8787 (Workers AI runs remotely, needs wrangler login)
```
