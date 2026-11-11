# lawyerlah

*Your kaki for Singapore law basics.*

A person describes an everyday situation in Singapore and gets a plain-English answer drawn from the actual text of
Singapore Acts: the real rule and its numbers first, how it applies, what depends on the facts, and the Act and section
as a small footnote. It covers policing and criminal procedure, traffic and road rules, family law (Women's Charter),
harassment, computer misuse, personal data, drugs, public order, and poisons and dangerous substances; it does not
cover tenancy or employment. It never says whether something is legal or illegal and never gives a verdict or
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
| `data/routes.json` | Official routes (Traffic Police e-services for traffic answers, Pro Bono SG for every answer) with eligibility, limits and links. Fixed text, never generated. |

## Bindings needed

| Binding | Type | Used for |
| --- | --- | --- |
| `ASSETS` | Workers static assets (`[assets]`, directory `../web`) | The site itself |
| `AI` | Workers AI | The chat model `@cf/deepseek-ai/deepseek-v4.1-flash-1017` (while `PROVIDER = "cloudflare"`) and, always, the embedding model `@cf/baai/bge-base-en-v1.5` |
| `VECTORIZE` | Vectorize index `lawyerlah-laws` (768 dims, cosine, metadata index on `code`) | Finding the relevant sections. Read only. |
| `LAWS` | KV namespace | Full section text `law:{code}:{section}`, plus `act:{code}` and `acts:index`. Read only. |
| `LIMITS` | KV namespace | Daily counters: `ask:<date>:<hash>` (10 questions per visitor), `global:<date>` (all visitors, `GLOBAL_DAILY_CAP`) and `fb:<date>:<hash>`. Keys expire after 2 days. The IP itself is never stored, only a SHA-256 of date + IP. |
| `FEEDBACK` | KV namespace | Helpful / Wrong votes: `{ at, vote, question, act, section }` |

Vars in `wrangler.toml`: `GLOBAL_DAILY_CAP` (default `300` questions/day across all visitors, each 3 chat calls + 1 embedding) and `SITE_URL`
(optional absolute base for canonical/OG URLs; empty = the origin the page was requested on). The HTML keeps those
URLs relative and the Worker makes them absolute, so no domain is hard-coded.

Only if you switch to DeepSeek: a secret `DEEPSEEK_API_KEY` (`npx wrangler secret put DEEPSEEK_API_KEY`). It is never
in the repo. For local dev put it in `worker/.dev.vars` (git-ignored).

## API

- `POST /api/ask` `{ "question": "..." }` →
  `{ notCovered, shortAnswer, figuresNote, howItApplies, depends[], sources[], furtherReading, demo, demoNotice, routes }`.
  - Plain language for readers with no law background. `shortAnswer`: at most 2 short sentences and 45 words (the
    model is asked for about 35), leading with what the person most likely wants to know, with its conditions and
    real numbers; no Act names. `howItApplies`: at most 2 short neutral sentences on which part of the rule matches.
    `depends`: at most 3 facts that would change the answer, each at most 12 words.
  - `sources`: up to 6 `{ act, section, label, heading, inForceFrom, sourceUrl, note }`, shown as a small footnote:
    Act, `label` ("section 63", "Article 9" for the Constitution, "rule 4" for the Poisons Rules, or "First Schedule" / "Schedules" for the non-numeric keys), "version in force from …"
    and `note` = "Unofficial consolidation from SSO, check sso.agc.gov.sg for the official text". `sourceUrl` is always
    `https://sso.agc.gov.sg/` (the records' `source` field is plain text, not a link), so the footnote links to SSO,
    not to the section.
  - `figuresNote`: "Some details are left out, check the official source below." whenever any sentence of the short
    answer was left out (by a filter or the length limit), or it fell back to naming the rules found; otherwise
    `null`.
  - `furtherReading`: for questions about the rights of an accused or arrested person, a link to a third-party law
    firm article (Regent Law, on the Criminal Procedure Code), labelled as such. Link only; its text is never copied.
    Otherwise `null`.
  - `demo` / `demoNotice`: only if a section's text says PLACEHOLDER (none of the loaded Acts should).
  - `routes`: `[{ name, what, eligibility, limits, url }]` from `data/routes.json`. Answers from the traffic Acts (rta,
    rtr, rter, rtsn) get `topics.traffic`; every answer gets `topics.general` (Pro Bono SG).
  - Not covered → `notCovered: true`, `sources` and `routes` are empty, and `shortAnswer` starts with "Not covered".
  - Errors are `{ error, message }`: 400 `empty` / `too_long` (over 500 chars) / `rejected` (abusive words or prompt
    injection) / `bad_request`, 429 `limit` (visitor's 10/day) or `global_limit` (overall cap), 502 `model` (the
    model, embedding or Vectorize failed).
  - A visitor's question counts only after it is answered, so a failed call doesn't use one up. The global counter
    counts every question that reaches the model, failed or not, since it guards the AI budget. Each question costs 3
    chat-model calls and 1 embedding. KV has no atomic increment, so a burst of parallel requests can overshoot either
    cap slightly.
- `POST /api/feedback` `{ "vote": "helpful" | "wrong", question, act, section }` → `{ ok: true }`.

## Model and retrieval

In `worker/index.js`:

- `PROVIDER` — `"cloudflare"` (default, Workers AI) or `"deepseek"` (DeepSeek's own API, unused), for the three chat
  calls. Embeddings always use Workers AI
  (`EMBED_MODEL`), because the index was built with that model.
- `MODEL` — the Workers AI chat model, `@cf/deepseek-ai/deepseek-v4.1-flash-1017`. `FALLBACK_MODEL`
  (`@cf/deepseek-ai/deepseek-v4-flash-0731`) is tried once when a call to `MODEL` throws an error other than a rate
  limit. To go back to Llama, set `MODEL` to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- DeepSeek models are called with `chat_template_kwargs: { thinking: false }`: with thinking on, the reasoning uses up
  `max_tokens` and the reply comes back empty. Replies are read from `choices[0].message.content` (OpenAI shape), with
  `response` as a fallback for Llama. `max_tokens` is 200 for the keyword and selection steps and 1500 for the answer (`ANSWER_MAX_TOKENS`), enough for
  the `powers` worksheet plus a 5-sentence answer with conditions.
- **Failed calls.** Empty or null content counts as a failed call. On the Workers AI rate limit (error 3021,
  "inference request per min rate reached") a call (chat or embedding) is retried once after 1.5 seconds. A call that
  still fails takes the step's existing fallback: the keyword step falls back to the plain question, the selection
  step to the first candidates, and the answer step returns 502 `model` without counting the visitor's question.
- `KEYWORDS_PROMPT`, `SELECT_PROMPT`, `ANSWER_PROMPT` — the three system prompts.
- `PINS`, `SPEED_PINS`, `EXPRESSWAY_PINS` — sections always added to the candidates for known topics.

Per question:

1. **Keywords.** The model rewrites the question into 3–6 legal keywords as an Act would word them (e.g. "arrested
   person", "consult legal practitioner", "produced before Magistrate") and guesses up to 4 Act codes. Act names for
   the prompt come from KV `acts:index` (cached 60 s), with `CODE_NAMES` as a fallback. If this step fails, the
   plain question is used.
2. **Candidates.** The question plus keywords is embedded with `@cf/baai/bge-base-en-v1.5` and Vectorize is queried
   (`topK` 20, `returnMetadata: "all"`). Extra filtered queries on `code` (also `topK` 20) run for policing questions
   (`const, cpc, pfa, ea, pc, isa`), speed or driving questions (`rta, rtr, rter, rtsn`) and the model's guessed codes.
   Results are deduped by `kv_key`. Candidates are, in order: pinned sections (below), the top 3 of each filtered
   query, then the rest by score, up to 32. Women's Charter sections are dropped unless the question or keywords are
   about family law. Each candidate is read from KV `LAWS` (missing or empty sections are skipped).
3. **Pinned sections.** Added to the candidates whenever the question or keywords match, main rule first:

   | Topic (matched words) | Sections |
   | --- | --- |
   | arrest, arrested, lawyer, counsel, detained | Constitution Art. 9, CPC s 68 |
   | police questioning, statement, silence, interview | CPC s 22, 23, 258, 261 |
   | searching a person ("search me", "my bag", body search, arrested persons) | CPC s 78, first |
   | police search, warrant, search without warrant | CPC s 32, 34 |
   | hacking, unauthorised access, computer | CMA s 3 first, then s 4–9 |
   | bail | CPC s 92, 93, 95 |
   | poisons, selling or possessing poison, poisons licence | Poisons Act s 5, 6, 9, 19 |
   | speed limit (general) | rtsn s 2, rtsn First–Sixth Schedules, RTA s 63 |
   | speed limit on an expressway (expressway named in the question) | rtsn First–Sixth Schedules, RTA s 63; never rtsn s 2 |

4. **Selection.** The model sees only each candidate's code, section, heading and first 200 characters, and picks the
   3–6 that directly answer the question, basic offence or main rule first, leaving out unrelated Acts. If it picks
   none, the answer is "Not covered". If its reply can't be read, the first 6 candidates are used.
5. **Answer.** Only the selected sections' full text (a very long section is cut at 6,000 characters) goes to the
   model. It answers only from them, describes the basic or main provision first, never merges penalties of different
   offences, and tags each figure with the section it comes from. Where the sections don't directly cover the
   question, it says "The text provided does not state this."
   - **Plain language.** Everyday words a 12-year-old understands; "jail"/"prison", not "imprisonment"; "arrested",
     not "apprehended"; a legal term explained in brackets the first time ("arrestable offence (a serious offence
     where police can arrest without a warrant)"). Penalties in plain words ("up to $5,000 fine or 2 years' jail, or
     both"), only the tiers that matter to the question.
   - **Shorter, not less accurate.** Every number and every condition that changes the meaning stays; if a condition
     doesn't fit, the whole point is left out, never the condition. One power per sentence.
   - **Special Acts.** A power that applies only to offences under its own Act (CESWOA, Poisons Act, Poisons Rules)
     is stated with its offence category ("for offences involving corrosive or explosive substances or offensive
     weapons"), never as a general police power. For searches without a warrant, the condition that makes the
     warrant unnecessary is stated (e.g. only when the thing is likely to be removed or lost), never "one of the
     listed grounds".
   - **Conditions.** A power or right is stated with its conditions and limits in plain words ("only if X, Y or Z"),
     never wider than the section says. Where a sub-provision gives a narrower or different power (e.g. s 78(1) vs
     s 78(1A)), the answer says which applies when instead of blending them. Vague phrases ("in the stated
     situations", "in certain cases", "under conditions") are not allowed: say the conditions or leave the sentence out.
   - **Self-check.** The model first fills a `powers` worksheet (provision, power, conditions as the text states them),
     writes the answer from it, and checks each sentence against the section text before replying. The worksheet is
     not shown to the user.
6. **Expressway speed.** When the question names an expressway and is about speed, the short answer is only the fixed
   text: limits vary by stretch (commonly 80 to 90 km/h), only some stretches are listed at 90 km/h, check the signs.
   The general 50 km/h rule is never a candidate, the model is told not to mention it, and any sentence with 50 km/h
   is dropped from "How it applies" and the bullets.

Each question costs 3 chat-model calls (keywords, selection, answer; more only on a rate-limit retry or the fallback
model), 1 embedding, up to 4 Vectorize queries and up
to about 34 KV reads.

The Act name, section, version date and link always come from KV, never from the model. Before an answer is returned:

- **Section tags.** When the short answer uses more than one section, each sentence ends with exactly one tag,
  "(section 3)" / "(Article 9)" / "(rule 4)"; with one section, no tag is shown. A sentence citing two different
  sections (two powers merged) is dropped. This is the only place section numbers appear outside the footnote.
- **Special-Act scope.** Before Act names are stripped, "offences under this Act" and the names of the special Acts
  (CESWOA, Poisons Act, Poisons Rules) are rewritten into their offence category, so the restriction survives. A
  sentence that cites a special-Act section, or states a power in an answer using one, without naming the category
  is dropped.
- **Length.** At most 2 sentences and 45 words in the short answer, whole sentences only; a single sentence over 45
  words is left out rather than cut.
- **Number check.** Every number in the short answer (digits, ranges, or spelled out like "seven days") must appear
  with the same unit in the verbatim text of the section it is tagged with (untagged: any of the sections used) ("50 kilometres per hour" counts as
  "50 km/h"). Digits in the Act name, section number or heading don't count, and the Act year never passes as a
  quantity. Speed tables often list bare numbers, so "N km/h" also passes when N appears in a section that talks about
  km/h. A sentence that fails is dropped. "How it applies" and the bullets get the same check, but may also repeat
  numbers from the person's own question. Figures are checked against the stored text, but this is not a guarantee:
  a wrong figure can still get through if it happens to appear in the text with the same unit, or is phrased in a way
  the check doesn't recognise as a number.
- **References stripped.** Every reference to a section, s., sec., §, article, rule or paragraph number, or to an
  Act, Code, Rules, Notification, Charter or the Constitution (name, year, Cap. number or abbreviation such as "CPC"),
  is removed from the short answer and "How it applies", or replaced with "the rule" / "the law". Apart from the
  section tags above, the footnote is the only place for them. "The law does not state" is reworded to "the text provided does not state".
- **Wording filter.** Any sentence that says legal/illegal/lawful/unlawful (statutory terms like "legal practitioner"
  and "legal aid" are allowed), entitled, breach, guilty, liable, gives odds, or gives advice ("you should",
  "I recommend") is dropped.
- **Conditions filter.** Any sentence with a vague condition phrase ("in the stated situations", "in certain cases",
  "under/subject to conditions", …) is dropped, and so is any sentence that gives a power ("may", "can", "has the
  power") to "any"/"all"/"everyone"/"at any time" with no condition word at all ("if", "only", "when", "where",
  "unless", "other than", "who", …). This catches the worst over-generalisations; it can't tell whether the stated
  conditions are the right ones, which depends on the model.
- **No cut-off text.** Returned text is never cut mid-word: length limits (2,000 characters per field, 240 per
  bullet) only drop whole sentences or bullets. If the model's reply ends mid-sentence (it stopped at `max_tokens`,
  or the text doesn't end with ".", "!", "?" or a closing bracket), the dangling fragment is dropped and the complete
  sentences before it are kept; a reply cut off mid-JSON is still read field by field, and a half-written bullet is
  left out.
- **Question first.** The sections used are ordered so the one that answers the question comes first (pinned
  sections for the question's topic, in pin order, e.g. CPC s 78 for a personal search before powers to search
  places), and the short answer's sentences follow that order.
- **Fallback.** Sentences that survive the filters are shown, with the line "Some details are left out, check the
  official source below." whenever any were left out. If none survive, the short answer names the rules found (at
  most 2 section headings), with the same line.

## Official routes

The "Official routes that may apply" part of an answer comes only from `data/routes.json`, never from the model. It
describes each route and its conditions; it must never say what the user should do, never say anyone is entitled or
in breach, and never give odds. Keep that wording when editing the file, and re-check limits against the linked
official pages (last checked November 2026). There are no routes specific to criminal matters yet: none could be
cited from verified facts, so criminal answers show only Pro Bono SG. Add one only from a checked official source.

## Law data

The law text is already loaded into Vectorize (`lawyerlah-laws`) and KV `LAWS`; the Worker only reads them and never
writes. Laws are updated by reloading those, not by redeploying.

- Vector metadata: `code`, `act`, `section`, `heading`, `part`, `kv_key` (several vector parts can map to one section).
- KV `law:{code}:{section}` → `{ act, act_code, section, heading, text, version_in_force_from, parts, source }` (the
  Poisons instruments also have `edition`). `source` is plain text (the same on every record), not a URL. Section
  keys are mostly numbers, but there are also `law:{code}:Schedules`, `law:rtsn:Schedule-First` … `Schedule-Sixth`,
  `law:psnr:{rule}` and `law:psnr:Schedule-First` … `Schedule-Thirteenth`. Repealed sections can have an empty heading.
- KV `act:{code}` → `{ act, code, version_in_force_from, sections: [{ section, heading }] }`.
- KV `acts:index` → JSON array of `{ code, act, version_in_force_from, sections }` (37 entries). The keyword step
  reads Act names from it; `CODE_NAMES` in `worker/index.js` is the fallback.
- Codes: arms cdsa ceswoa cltpa cma const coroners cpc cypa ea gca immig isa mda mhcta mla moa ocha pc pca pdpa pfa poa
  poha psa psn psnr psnsanc psnvet rbda rta rter rtr rtsn vaa vandal wc. Among them: ea = Evidence Act 1893, moa =
  Miscellaneous Offences (Public Order and Nuisance) Act 1906, psa = Protection from Scams Act 2025, rtr = Road
  Traffic Rules, rter = Road Traffic (Expressway Traffic) Rules, rtsn = Road Traffic (Restriction of Speed on Roads)
  Notification, psn = Poisons Act 1938, psnr = Poisons Rules (Cap 234, R 1), psnvet = Approved Qualifications for
  Veterinary Surgeons (Consolidation) Notification (Cap 234, N 2), psnsanc = Authority to Grant Sanctions to
  Prosecute (Cap 234, N 1). Poisons questions also run a filtered query on psn, psnr, psnvet, psnsanc.

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

## Tests

```sh
node worker/test/e2e.test.mjs   # end-to-end /api/ask with fake AI, Vectorize and KV; no network or packages needed
```

Covers six real questions with their expected sections (lawyer when arrested → Constitution Art. 9; police questions
→ CPC s 22, 23; basic hacking → $5,000 and 2 years under CMA s 3; police search without warrant → CPC s 34;
expressway speed → fixed sentence only; tenancy → not covered), plus the selection fallback, `topK` and outage paths. The fake model replies in the OpenAI shape (one case uses
Llama's `response`), and further cases check the DeepSeek model ID, `thinking: false`, empty replies, the rate-limit
retry and the fallback model. It also checks that every short answer the Worker returns is at most 2 sentences and
45 words; CPC s 78 (real text, in force 15/9/2026) answered with (1), (1A) and (2) kept apart; special-Act scope
(CESWOA s 9) and the Poisons codes. Other law fixtures are stand-ins (shape only) and are labelled as such.
The fake model picks whatever expected sections it is shown, so the test checks the pipeline, not the real model.

## Local development

```sh
cd worker && npx wrangler dev     # site + API on http://localhost:8787 (Workers AI and Vectorize run remotely, need wrangler login)
```
