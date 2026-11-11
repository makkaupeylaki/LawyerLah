# lawyerlah

*Your kaki for Singapore law basics.*

A person describes an everyday situation in Singapore and gets a plain-English answer drawn from the actual text of
Singapore Acts: the real rule and its numbers first, how it applies, what depends on the facts, and the Act and section
as a small footnote. It never says whether something is legal or illegal and never gives a verdict or
advice. Every answer carries: "Not legal advice. For general understanding only. Ask a lawyer for your situation."

One Cloudflare Worker serves both the static site and the API, so they share an origin:

```
browser ──► GET  /, /about, /style.css …  ──► worker/index.js ──► ASSETS (web/, Workers static assets)
        ──► POST /api/ask                 ──►                 ──► keywords (AI) ──► embed (AI) ──► VECTORIZE
                                                                  ──► full sections (KV LAWS) ──► answer (AI)
        ──► POST /api/feedback            ──►                 ──► KV FEEDBACK
            caps: 10/visitor/day (IP hash) + 300/day overall  ──► KV LIMITS
```

| Path | What |
| --- | --- |
| `web/index.html`, `web/about.html` | Pages. Plain HTML/CSS/JS, no build step. Logo is inline SVG (header + favicon). |
| `web/app.js` | Ask form, example chips, topic list, loading / limit / offline / error states, feedback buttons, demo-data banner, official routes. Calls `/api/*` on the same origin. |
| `web/og.png` | 1200×630 social preview image. |
| `worker/index.js` | The API (retrieval + answer), plus serving `web/` as static assets. All chat-model calls go through `askModel(prompt, env, options)`. |
| `worker/wrangler.toml` | Worker config, bindings and vars. |
| `web/_headers`, `web/robots.txt` | Keep the site out of search engines (see [Privacy](#privacy)). |
| `data/routes.json` | Official routes per topic (MOM, TADM, ECT, HDB, Small Claims Tribunals, Pro Bono SG, police) with eligibility, limits and links. Fixed text, never generated. |

## Bindings needed

| Binding | Type | Used for |
| --- | --- | --- |
| `ASSETS` | Workers static assets (`[assets]`, directory `../web`) | The site itself |
| `AI` | Workers AI | The chat model (while `PROVIDER = "cloudflare"`) and, always, the embedding model `@cf/baai/bge-base-en-v1.5` |
| `VECTORIZE` | Vectorize index `lawyerlah-laws` (768 dims, cosine, metadata index on `code`) | Finding the relevant sections. Read only. |
| `LAWS` | KV namespace | Full section text `law:{code}:{section}`, plus `act:{code}` and `acts:index`. Read only. |
| `LIMITS` | KV namespace | Daily counters: `ask:<date>:<hash>` (10 questions per visitor), `global:<date>` (all visitors, `GLOBAL_DAILY_CAP`) and `fb:<date>:<hash>`. Keys expire after 2 days. The IP itself is never stored, only a SHA-256 of date + IP. |
| `FEEDBACK` | KV namespace | Helpful / Wrong votes: `{ at, vote, question, act, section }` |

Vars in `wrangler.toml`: `GLOBAL_DAILY_CAP` (default `300` model calls/day across all visitors) and `SITE_URL`
(optional absolute base for canonical/OG URLs; empty = the origin the page was requested on). The HTML keeps those
URLs relative and the Worker makes them absolute, so no domain is hard-coded.

Only if you switch to DeepSeek: a secret `DEEPSEEK_API_KEY` (`npx wrangler secret put DEEPSEEK_API_KEY`). It is never
in the repo. For local dev put it in `worker/.dev.vars` (git-ignored).

## API

- `POST /api/ask` `{ "question": "..." }` →
  `{ notCovered, shortAnswer, figuresNote, howItApplies, depends[], sources[], furtherReading, demo, demoNotice, routes }`.
  - `shortAnswer`: 2–4 sentences stating the rule with its real numbers first, no section numbers or Act names.
    `howItApplies`: 1–2 neutral sentences on which part of the rule matches. `depends`: up to 5 facts that would
    change the answer.
  - `sources`: up to 3 `{ act, section, heading, inForceFrom, sourceUrl, note }`, shown as a small footnote:
    Act, section, "version in force from …" and `note` = "Unofficial consolidation from SSO, check sso.agc.gov.sg for
    the official text". `sourceUrl` is the record's `source` if it is an sso.agc.gov.sg link, otherwise the footnote
    links to the SSO home page.
  - `figuresNote`: "The exact figures are not in the text I have. Check the source below." when the short answer
    had a sentence dropped by the number check, or fell back to naming the rules found; otherwise `null`.
  - `furtherReading`: for questions about the rights of an accused or arrested person, a link to a third-party law
    firm article (Regent Law, on the Criminal Procedure Code), labelled as such. Link only; its text is never copied.
    Otherwise `null`.
  - `demo` / `demoNotice`: only if a section's text says PLACEHOLDER (none of the loaded Acts should).
  - `routes`: `[{ name, what, eligibility, limits, url }]` from `data/routes.json`. Traffic Acts (rta, rtr, rter, rtsn)
    get the traffic routes; every answer gets the general Pro Bono SG route.
  - Not covered → `notCovered: true`, `sources` and `routes` are empty, and `shortAnswer` starts with "Not covered".
  - Errors are `{ error, message }`: 400 `empty` / `too_long` (over 500 chars) / `rejected` (abusive words or prompt
    injection) / `bad_request`, 429 `limit` (visitor's 10/day) or `global_limit` (overall cap), 502 `model` (the
    model, embedding or Vectorize failed).
  - A visitor's question counts only after it is answered, so a failed call doesn't use one up. The global counter
    counts every question that reaches the model, failed or not, since it guards the AI budget. Each question costs 2
    chat-model calls and 1 embedding. KV has no atomic increment, so a burst of parallel requests can overshoot either
    cap slightly.
- `POST /api/feedback` `{ "vote": "helpful" | "wrong", question, act, section }` → `{ ok: true }`.

## Model and retrieval

In `worker/index.js`:

- `PROVIDER` — `"cloudflare"` (default) or `"deepseek"`, for the two chat calls. Embeddings always use Workers AI
  (`EMBED_MODEL`), because the index was built with that model.
- `MODELS` — the chat model name per provider (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `deepseek-chat`).
- `KEYWORDS_PROMPT`, `ANSWER_PROMPT` — the two system prompts.

Per question:

1. **Keywords.** The model rewrites the question into 3–6 legal keywords as an Act would word them (e.g. "arrested
   person", "consult legal practitioner", "produced before Magistrate") and guesses up to 4 Act codes. Act names for
   the prompt come from KV `acts:index` (cached 60 s), with built-in names as a fallback. If this step fails, the
   plain question is used.
2. **Search.** The question plus keywords is embedded with `@cf/baai/bge-base-en-v1.5` and Vectorize is queried
   (`topK` 12, `returnMetadata: "all"`). Extra filtered queries on `code` run for policing questions
   (`const, cpc, pfa, ea, pc, isa`), speed or driving questions (`rta, rtr, rter, rtsn`) and the model's guessed codes.
   Results are merged and deduped by `kv_key`; the top 2 from each filtered query are always kept (they often score
   lower than the unfiltered hits), then the rest by score.
3. **Sections.** Up to 6 full sections are read from KV `LAWS` (sections with empty text are skipped; a very long
   section is cut at 6,000 characters) and given to the model verbatim.
4. **Answer.** The model answers only from those sections and cites up to 3 by id. Where the text doesn't contain the
   answer or a number, it says "The text provided does not state this." instead of guessing.
5. **Speed limits.** The model gives the real numbers from the speed notification text. When a speed question mentions
   an expressway, the Worker adds fixed text: limits vary by stretch (commonly 80 to 90 km/h), only some stretches are
   listed at 90 km/h, and the signs for that stretch set it.

The Act name, section, version date and link always come from KV, never from the model. Before an answer is returned:

- **Number check.** Every number in the short answer (digits, ranges, or spelled out like "seven days") must appear
  with the same unit in the verbatim text of the sections given to the model ("50 kilometres per hour" counts as
  "50 km/h"). Digits in the Act name, section number or heading don't count, and the Act year never passes as a
  quantity. Speed tables often list bare numbers, so "N km/h" also passes when N appears in a section that talks about
  km/h. A sentence that fails is dropped. "How it applies" and the bullets get the same check, but may also repeat
  numbers from the person's own question. Figures are checked against the stored text, but this is not a guarantee:
  a wrong figure can still get through if it happens to appear in the text with the same unit, or is phrased in a way
  the check doesn't recognise as a number.
- **References stripped.** Every reference to a section, s., sec., §, article, rule or paragraph number, or to an
  Act, Code, Rules, Notification, Charter or the Constitution (name, year, Cap. number or abbreviation such as "CPC"),
  is removed from the short answer and "How it applies", or replaced with "the rule" / "the law". The footnote is the
  only place for them. "The law does not state" is reworded to "the text provided does not state".
- **Wording filter.** Any sentence that says legal/illegal/lawful/unlawful (statutory terms like "legal practitioner"
  and "legal aid" are allowed), entitled, breach, guilty, liable, gives odds, or gives advice ("you should",
  "I recommend") is dropped.
- **Fallback.** If nothing usable is left, the short answer names the rules found (section headings) and says the text
  provided does not state this in a form LawyerLah could check, with `figuresNote`.

## Official routes

The "Official routes that may apply" part of an answer comes only from `data/routes.json`, never from the model. It
describes each route and its conditions; it must never say what the user should do, never say anyone is entitled or
in breach, and never give odds. Keep that wording when editing the file, and re-check limits against the linked
official pages (last checked November 2026).

## Law data

The law text is already loaded into Vectorize (`lawyerlah-laws`) and KV `LAWS`; the Worker only reads them and never
writes. Laws are updated by reloading those, not by redeploying.

- Vector metadata: `code`, `act`, `section`, `heading`, `part`, `kv_key` (several vector parts can map to one section).
- KV `law:{code}:{section}` → `{ act, act_code, section, heading, text, version_in_force_from, source }`; also
  `act:{code}` and `acts:index`. Repealed sections can have an empty heading.
- Codes: pc cpc ea cma rta pdpa poha moa isa mda poa ocha vandal gca mla pfa arms ceswoa cltpa cdsa pca psa cypa vaa
  mhcta coroners immig rbda wc const, plus rtr (Road Traffic Rules), rter (Expressway Traffic Rules) and rtsn (Road
  Traffic (Restriction of Speed) Notification).

The text is an unofficial consolidation from SSO; every answer says so and points to sso.agc.gov.sg for the official
text. SSO only allows automated extraction between 3am and 7am Singapore time, so any reload job has to run in that
window.

## Privacy

The site is not meant to be public: every page has `<meta name="robots" content="noindex, nofollow, noarchive,
nosnippet">`, every response (Worker and static files via `web/_headers`) sends the same `X-Robots-Tag`, and
`robots.txt` disallows everything. These only keep well-behaved search engines out; anyone with the URL can still open
it. To restrict who can use it, put the Worker behind Cloudflare Access (Zero Trust) or another login.

## Deploy

```sh
cd worker
# LAWS (KV) and VECTORIZE (index "lawyerlah-laws") already exist: put the LAWS id into wrangler.toml.
npx wrangler kv namespace create LIMITS     # paste the id into wrangler.toml
npx wrangler kv namespace create FEEDBACK   # paste the id into wrangler.toml
npx wrangler deploy                         # deploys the Worker and uploads web/ as its static assets
```

Add a custom domain to the Worker in the Cloudflare dashboard if you want one, and set `SITE_URL` to it.

## Local development

```sh
cd worker && npx wrangler dev     # site + API on http://localhost:8787 (Workers AI and Vectorize run remotely, need wrangler login)
```
