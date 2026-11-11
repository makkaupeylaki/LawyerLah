# lawyerlah

*Your kaki for Singapore law basics.*

A person describes an everyday situation in Singapore (tenancy, employment or traffic for v1) and gets a plain-English
pointer to which Act and section seems relevant, what it says simply, what is unclear or depends, and a link to that
section on Singapore Statutes Online. It never says whether something is legal or illegal and never gives a verdict or
advice. Every answer carries: "Not legal advice. For general understanding only. Ask a lawyer for your situation."

```
web/ (static, Cloudflare Pages) ──► POST /api/ask       ──► worker/index.js ──► askModel() ──► Workers AI (binding AI)
                                ──► POST /api/feedback  ──►                 ──► KV FEEDBACK
                                    daily cap per visitor (IP hash)         ──► KV LIMITS
```

| Path | What |
| --- | --- |
| `web/index.html`, `web/about.html` | Pages. Plain HTML/CSS/JS, no build step. Logo is inline SVG (header + favicon). |
| `web/app.js` | Ask form, example chips, topic list, loading / limit / offline / error states, feedback buttons. `API_BASE` at the top says where the Worker is. |
| `web/og.png` | 1200×630 social preview image. |
| `worker/index.js` | The API. All model calls go through `askModel(prompt, env)`. |
| `worker/wrangler.toml` | Worker config and bindings. |
| `data/laws.json` | Law text the model may use. **Currently PLACEHOLDER**: 3 entries per topic. |

## Bindings needed

| Binding | Type | Used for |
| --- | --- | --- |
| `AI` | Workers AI | The model, while `PROVIDER = "cloudflare"` |
| `LIMITS` | KV namespace | Daily counters per visitor: `ask:<date>:<hash>` (10 questions/day) and `fb:<date>:<hash>`. Keys expire after 2 days. The IP itself is never stored, only a SHA-256 of date + IP. |
| `FEEDBACK` | KV namespace | Helpful / Wrong votes: `{ at, vote, question, act, section }` |

Only if you switch to DeepSeek: a secret `DEEPSEEK_API_KEY` (`npx wrangler secret put DEEPSEEK_API_KEY`). It is never
in the repo. For local dev put it in `worker/.dev.vars` (git-ignored).

## API

- `POST /api/ask` `{ "question": "..." }` → `{ act, section, plain, unclear, sourceUrl }`.
  Not covered → `act`, `section` and `sourceUrl` are `null` and `plain` starts with "Not covered".
  Errors are `{ error, message }`: 400 `empty` / `too_long` (over 500 chars) / `rejected` (abusive words or prompt
  injection) / `bad_request`, 429 `limit`, 502 `model`.
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
npx wrangler deploy

cd ..
npx wrangler pages deploy web --project-name lawyerlah
```

Route the Worker at `<your-domain>/api/*` so the site calls it on the same origin (`API_BASE = ""`), or set `API_BASE`
in `web/app.js` to the workers.dev URL. On localhost the page calls `wrangler dev` on port 8787.

## Local development

```sh
cd worker && npx wrangler dev     # API on http://localhost:8787 (Workers AI runs remotely, needs wrangler login)
npx serve web                     # site
```
