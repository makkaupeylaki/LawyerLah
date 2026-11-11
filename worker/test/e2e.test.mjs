// End-to-end test of /api/ask with fake stand-ins for Workers AI, Vectorize and KV (no network, no Cloudflare).
// Run: node worker/test/e2e.test.mjs   (exit code 1 on failure)
//
// The stand-in records have the real KV shapes. Vector results are deliberately noisy (Women's Charter 64E for policing
// questions, rtsn 2 for the expressway one) and miss the expected sections, so they must come from pinning. The fake
// selection model picks whichever of the expected sections it is shown, so this tests the plumbing (pinning, filtering,
// previews, section tags, number guard, expressway override, not covered), not the real model's judgement.
let n = 0;
const WORKER = new URL("../index.js", import.meta.url).href;
const load = async () => (await import(WORKER + "?run=" + n++)).default;
const kv = (init = {}) => { const m = new Map(Object.entries(init)); let gets = 0; return { m, gets: () => gets, get: async (k, t) => { gets++; const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => m.set(k, v) }; };
const SRC = "Singapore Statutes Online, Attorney-General's Chambers";
const ACTS = { const: "Constitution of the Republic of Singapore", cpc: "Criminal Procedure Code 2010", cma: "Computer Misuse Act 1993", wc: "Women's Charter 1961", rta: "Road Traffic Act 1961", rtsn: "Road Traffic (Restriction of Speed on Roads) Notification", pc: "Penal Code 1871" };
const L = {};
const put = (code, section, heading, text) => { L[`law:${code}:${section}`] = JSON.stringify({ act: ACTS[code], act_code: code, section, heading, text, version_in_force_from: "2024-01-01", parts: 1, source: SRC }); };
put("const", "9", "Liberty of the person", "(3) Where a person is arrested, he shall be informed as soon as may be of the grounds of his arrest and shall be allowed to consult and be defended by a legal practitioner of his choice. (4) Where a person is arrested and not released, he shall, without unreasonable delay, and in any case within 48 hours (excluding the time of any necessary journey), be produced before a Magistrate.");
put("cpc", "68", "Person arrested to be informed of grounds of arrest", "A police officer making an arrest must inform the person arrested of the grounds of the arrest as soon as may be. Filler text ".repeat(4));
put("cpc", "22", "Power to examine witnesses", "(1) In conducting an investigation, a police officer may examine orally any person who appears to be acquainted with any of the facts and circumstances of the case. (2) The person examined shall be bound to state truly what he knows of the facts and circumstances of the case, except that he need not say anything that might expose him to a criminal charge, penalty or forfeiture.");
put("cpc", "23", "Cautioned statements", "(1) If, during an investigation, a person is charged with an offence or informed that he may be prosecuted, a police officer must serve on that person a notice ... (3) a court may draw such inferences as appear proper from a failure to mention a fact later relied on.");
put("cpc", "258", "Admissibility of accused's statements", "Where any person is charged with an offence, any statement made by the person ... shall be admissible ...");
put("cpc", "261", "Inferences from accused's silence", "Where in any criminal proceedings evidence is given that the accused, on being charged, failed to mention any fact, the court may draw such inferences as appear proper.");
put("cpc", "32", "Search by police officer", "A police officer may search any place where he has reason to believe that a thing necessary for an investigation may be found.");
put("cpc", "34", "Search without warrant for arrestable offences", "(1) A police officer investigating an arrestable offence may, without a warrant, search any place where he has reason to believe that a thing necessary for the investigation may be found ...");
// CPC s78. (1) follows the published wording in substance. (1A) is a PARAPHRASE of the real subsection (articles the
// person could use to cause harm, on arrest or on handover from a private person under s66), written from the 2024
// amending Bill: the verbatim KV text (law:cpc:78) could not be read from this environment. Paste it in to replace.
put("cpc", "78", "Search of arrested persons", "(1) Whenever a person is arrested by a police officer under a warrant which does not provide for the taking of bail, or without a warrant, and the person arrested cannot legally be admitted to bail or is unable to furnish bail, the officer may search that person and place in safe custody all articles, other than necessary wearing apparel, found upon him. (1A) Where a police officer arrests a person, or a person arrested by a private person is handed over to a police officer under section 66, the police officer may search that person and place in safe custody any article found on that person which the person could use to cause harm to himself or herself or to any other person.");
// STAND-IN for a secondary place-search power (not the real s33 text): used only to test that the personal-search
// provision is answered first.
put("cpc", "33", "Search of place (stand-in)", "A police officer may enter and search a place where a person to be arrested has entered, if the officer has reason to believe the person is inside.");
put("cpc", "92", "Bailable offences", "When any person accused of a bailable offence is arrested ... he shall be released on bail.");
put("cma", "3", "Unauthorised access to computer material", "(1) Any person who knowingly causes a computer to perform any function for the purpose of securing access without authority to any program or data held in any computer shall be guilty of an offence and shall be liable on conviction to a fine not exceeding $5,000 or to imprisonment for a term not exceeding 2 years or to both and, in the case of a second or subsequent conviction, to a fine not exceeding $10,000 or to imprisonment for a term not exceeding 3 years or to both.");
put("cma", "4", "Access with intent to commit or facilitate commission of offence", "(1) Any person who causes a computer to perform any function for the purpose of securing access to any program or data held in any computer with intent to commit an offence ... shall be liable on conviction to a fine not exceeding $50,000 or to imprisonment for a term not exceeding 10 years or to both.");
put("cma", "5", "Unauthorised modification of computer material", "... liable on conviction to a fine not exceeding $10,000 or to imprisonment for a term not exceeding 3 years or to both ...");
put("wc", "64E", "Power to arrest for breach of protection order", "A police officer may arrest without warrant any person whom he reasonably believes has committed an offence under section 64.");
put("rtsn", "2", "Speed limits", "The speed limit for motor vehicles on roads is 50 kilometres per hour, except on the roads specified in the Schedules.");
put("rtsn", "Schedule-First", "", "Pan-Island Expressway (Jurong Town Hall Road to Adam Road) 90\nAyer Rajah Expressway 90");
put("rtsn", "Schedule-Second", "", "Bukit Timah Expressway 80\nCentral Expressway 80");
put("rta", "63", "Speed limits", "A person who drives a motor vehicle at a speed greater than the speed limit shall be guilty of an offence and liable to a fine not exceeding $1,000 or to imprisonment for a term not exceeding 3 months.");
put("pc", "1", "Title", "This Act is the Penal Code.");
L["acts:index"] = JSON.stringify(Object.entries(ACTS).map(([code, act]) => ({ code, act, version_in_force_from: "2024-01-01", sections: 1 })));

// Noisy vector results: the expected sections are NOT in the unfiltered results, so they must come from pinning.
const hit = (key, score) => ({ id: key + ":p1", score, metadata: { kv_key: key, code: key.split(":")[1], section: key.split(":")[2], heading: "", part: 1 } });
const VECTORIZE = { calls: [], query: async (v, o) => { VECTORIZE.calls.push({ topK: o.topK, filter: o.filter ? o.filter.code.$in.join(",") : null });
  return { matches: [hit("law:wc:64E", 0.82), hit("law:pc:1", 0.8), hit("law:rtsn:2", 0.7), hit("law:cpc:92", 0.5), ...(VECTORIZE.extra || []).map((k) => hit(k, 0.75))] }; } };

// Workers AI chat replies in the OpenAI shape (DeepSeek); t.shape = "llama" returns the old { response } shape.
const openai = (content, finish = "stop") => ({ id: "chatcmpl-test", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }], usage: {} });
// t.fail = { keywords|select|answer|embed: { kind: "rate" | "empty" | "error", times } } injects failures;
// t.failModel = "<model id>" makes every call to that model throw a non-rate-limit error.
function makeAI(t) {
  const ai = { calls: [], runs: [], run: async (model, o) => {
    const step = o.text ? "embed" : o.messages[0].content.startsWith("You turn") ? "keywords" : o.messages[0].content.startsWith("You choose") ? "select" : "answer";
    ai.runs.push({ step, model, params: o, at: Date.now() });
    const f = t.fail && t.fail[step];
    if (f && f.times > 0) {
      f.times--;
      if (f.kind === "rate") throw new Error("3021: inference request per min rate reached");
      if (f.kind === "error") throw new Error("5000: internal error");
      if (f.kind === "empty") return step === "embed" ? { data: [] } : openai(null);
    }
    if (t.failModel && model === t.failModel) throw new Error("5007: No such model");
    if (step === "embed") return { data: [new Array(768).fill(0.01)] };
    const reply = (content) => (t.shape === "llama" ? { response: content } : openai(content));
    const user = o.messages[1].content;
    if (step === "keywords") { ai.calls.push("keywords"); return reply(JSON.stringify(t.kw)); }
    if (step === "select") {
      ai.calls.push("select"); ai.selectPrompt = user;
      ai.candidateIds = [...user.matchAll(/<candidate id="([^"]+)"/g)].map((m) => m[1]);
      ai.previewMax = Math.max(...[...user.matchAll(/">([^<]*)<\/candidate>/g)].map((m) => m[1].length));
      if (t.selectRaw) return reply(t.selectRaw);
      return reply(JSON.stringify({ ids: t.ideal.filter((id) => ai.candidateIds.includes(id)) }));
    }
    ai.calls.push("answer"); ai.answerPrompt = user;
    // t.answerRaw: the reply text as-is (e.g. cut off mid-JSON); t.finish: its finish_reason ("length" when cut).
    if (t.answerRaw != null) return t.shape === "llama" ? { response: t.answerRaw } : openai(t.answerRaw, t.finish || "stop");
    return reply(JSON.stringify(t.answer));
  } };
  return ai;
}
async function run(t) {
  const w = await load(); VECTORIZE.calls = []; VECTORIZE.extra = t.extraHits || [];
  const AI = makeAI(t); const LAWS = kv(L);
  const env = { AI, VECTORIZE, LAWS, LIMITS: kv(), FEEDBACK: kv() };
  const r = await w.fetch(new Request("https://x/api/ask", { method: "POST", headers: { "cf-connecting-ip": Math.random() + "" }, body: JSON.stringify({ question: t.q }) }), env);
  return { a: await r.json(), AI, status: r.status, lawsReads: LAWS.gets(), visitorCounted: [...env.LIMITS.m.keys()].some((k) => k.startsWith("ask:")) };
}
let fails = 0;
const expect = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); if (!cond) fails++; };
const src = (a) => (a.sources || []).map((s) => `${s.act.split(" ")[0]} ${s.label}`).join(", ");

const T = [
  { name: "1. Lawyer when arrested (expect const 9)", q: "My brother was arrested. Can he see a lawyer?",
    kw: { keywords: ["arrested person", "consult legal practitioner", "produced before Magistrate"], codes: ["cpc", "const"] },
    ideal: ["law:const:9", "law:cpc:68"],
    answer: { ids: ["law:const:9", "law:cpc:68"], shortAnswer: "A person who is arrested must be told the grounds of arrest and be allowed to consult and be defended by a legal practitioner of their choice [[law:const:9]]. If not released, they must be produced before a Magistrate within 48 hours [[law:const:9]]. The police officer must tell them the grounds as soon as may be [[law:cpc:68]].", howItApplies: "The rule on the liberty of the person covers someone who has been arrested.", depends: ["Whether he has been released.", "When the arrest happened."] },
    check: (a, AI) => {
      expect("const 9 pinned into candidates although vector search missed it", AI.candidateIds.includes("law:const:9"));
      expect("Women's Charter 64E dropped from candidates", !AI.candidateIds.includes("law:wc:64E"), AI.candidateIds.join(" "));
      expect("selection saw previews only (<=200 chars)", AI.previewMax <= 200, `longest ${AI.previewMax}`);
      expect("answer step got only the selected sections", (AI.answerPrompt.match(/<section id=/g) || []).length === 2);
      expect("sources lead with const 9 as Article 9", src(a).startsWith("Constitution Article 9"), src(a));
      expect("48 hours kept, tagged per section", /48 hours \(Article 9\)/.test(a.shortAnswer), a.shortAnswer);
      expect("further-reading link shown", !!a.furtherReading);
    } },
  { name: "2. Police questions (expect cpc 22, 23)", q: "Do I have to answer police questions?",
    kw: { keywords: ["examination of witnesses", "statement to police", "adverse inference"], codes: ["cpc"] },
    ideal: ["law:cpc:22", "law:cpc:23", "law:cpc:261"],
    answer: { ids: ["law:cpc:22", "law:cpc:23"], shortAnswer: "A police officer may question anyone who seems to know the facts of a case, and that person must state truly what they know [[law:cpc:22]]. They need not say anything that might expose them to a criminal charge [[law:cpc:22]]. If a person is charged and later relies on a fact they did not mention, a court may draw inferences from that [[law:cpc:23]].", howItApplies: "The rule on police examination covers being asked questions by the police.", depends: ["Whether the person has been charged."] },
    check: (a, AI) => {
      expect("cpc 22, 23, 258, 261 pinned", ["law:cpc:22", "law:cpc:23", "law:cpc:258", "law:cpc:261"].every((k) => AI.candidateIds.includes(k)));
      expect("sources are cpc 22 then 23", src(a) === "Criminal section 22, Criminal section 23", src(a));
      expect("Women's Charter dropped", !AI.candidateIds.includes("law:wc:64E"));
      expect("further-reading link shown", !!a.furtherReading);
    } },
  { name: "3. Basic hacking (expect $5,000 and 2 years under cma 3)", q: "Someone hacked into my email account",
    kw: { keywords: ["unauthorised access to computer material", "securing access without authority"], codes: ["cma"] },
    ideal: ["law:cma:3", "law:cma:4", "law:cma:5"],
    answer: { ids: ["law:cma:3", "law:cma:4"], shortAnswer: "Getting a computer to give access to data without authority is an offence with a fine of up to $5,000 or up to 2 years in jail, or both [[law:cma:3]]. Doing it to commit another offence carries a fine of up to $50,000 or up to 10 years in jail, or both [[law:cma:4]]. Repeat offenders face up to $50,000 [[law:cma:3]].", howItApplies: "The rule on unauthorised access covers someone getting into an account without permission.", depends: ["Whether the access was meant to commit another offence."] },
    check: (a, AI) => {
      expect("cma 3 is the first candidate (pinned first)", AI.candidateIds[0] === "law:cma:3", AI.candidateIds.slice(0, 3).join(" "));
      expect("cma 3 leads the sources", src(a).startsWith("Computer section 3"), src(a));
      expect("$5,000 and 2 years stated, attributed to section 3", /\$5,000 or up to 2 years in jail, or both \(section 3\)/.test(a.shortAnswer), a.shortAnswer);
      expect("cma 4 penalty kept separately", /\$50,000 or up to 10 years in jail, or both \(section 4\)/.test(a.shortAnswer));
      expect("merged penalty ($50,000 tagged to section 3) dropped", !/Repeat offenders/.test(a.shortAnswer));
      expect("figures note shown for the dropped sentence", !!a.figuresNote);
    } },
  { name: "4. Police search without warrant (expect cpc 34)", q: "Can police search me without a warrant?",
    kw: { keywords: ["search without warrant", "arrestable offence"], codes: ["cpc"] },
    ideal: ["law:cpc:34", "law:cpc:32"],
    answer: { ids: ["law:cpc:34"], shortAnswer: "A police officer investigating an arrestable offence may search a place without a warrant if they have reason to believe something needed for the investigation is there.", howItApplies: "The rule on searches without a warrant covers a police search during an investigation.", depends: ["Whether the offence is arrestable."] },
    check: (a, AI) => {
      expect("cpc 32 and 34 pinned", AI.candidateIds.includes("law:cpc:34") && AI.candidateIds.includes("law:cpc:32"));
      expect("source is cpc section 34", src(a) === "Criminal section 34", src(a));
      expect("no section tag when one section is used", !/\(section/.test(a.shortAnswer), a.shortAnswer);
    } },
  { name: "5. Expressway speed (fixed sentence only)", q: "What is the speed limit on an expressway?",
    kw: { keywords: ["speed limit", "expressway"], codes: ["rtsn"] },
    ideal: ["law:rtsn:Schedule-First", "law:rtsn:Schedule-Second", "law:rta:63", "law:rtsn:2"],
    answer: { ids: ["law:rtsn:Schedule-First", "law:rtsn:Schedule-Second"], shortAnswer: "The general speed limit is 50 km/h. Some expressways are 90 km/h.", howItApplies: "The general limit is 50 km/h on roads. The speed limits listed for expressways cover this question.", depends: ["Which stretch of expressway.", "The default is 50 km/h."] },
    check: (a, AI) => {
      expect("short answer is exactly the fixed sentence", a.shortAnswer === "Expressway speed limits vary by stretch, commonly 80 to 90 km/h, and only some stretches are listed at 90 km/h. Check the speed signs for the stretch in question.", a.shortAnswer);
      expect("rtsn 2 (50 km/h default) not a candidate", !AI.candidateIds.includes("law:rtsn:2"), AI.candidateIds.join(" "));
      expect("no 50 km/h anywhere in the answer", !/50/.test(JSON.stringify([a.shortAnswer, a.howItApplies, a.depends])), JSON.stringify([a.howItApplies, a.depends]));
      expect("answer step told not to mention 50 km/h", /Do not mention the general 50 km\/h/.test(AI.answerPrompt));
      expect("sources are the speed Schedules", src(a).includes("First Schedule"), src(a));
      expect("traffic routes shown", a.routes.some((r) => r.name.startsWith("Singapore Police Force")));
    } },
  { name: "6. Tenancy (expect not covered)", q: "Can my landlord keep my deposit when I move out?",
    kw: { keywords: ["tenancy deposit", "landlord"], codes: [] },
    ideal: [], answer: { ids: [] },
    check: (a, AI) => {
      expect("not covered", a.notCovered === true, a.shortAnswer);
      expect("answer step skipped after empty selection", !AI.calls.includes("answer"), AI.calls.join(","));
      expect("coverage text in reply", /policing and criminal procedure/.test(a.shortAnswer));
    } },
  { name: "7. Selection reply unreadable -> falls back to pinned candidates", q: "Someone hacked into my email account",
    kw: { keywords: ["unauthorised access"], codes: ["cma"] }, selectRaw: "not json",
    answer: { ids: ["law:cma:3"], shortAnswer: "The fine is up to $5,000 or up to 2 years in jail, or both.", depends: [] },
    check: (a, AI) => {
      expect("answer step got the first 6 candidates", (AI.answerPrompt.match(/<section id=/g) || []).length === 6);
      expect("still answers from cma 3", src(a) === "Computer section 3" && /\$5,000/.test(a.shortAnswer), a.shortAnswer);
    } },
];
for (const t of T) {
  console.log(t.name);
  const { a, AI, status } = await run(t);
  if (status !== 200) { expect("status 200", false, JSON.stringify(a)); continue; }
  t.check(a, AI);
  console.log("    short:", a.shortAnswer);
}
// Vectorize topK and failure path
{ const w = await load(); VECTORIZE.calls = []; const t = T[0]; const AI = makeAI(t);
  await w.fetch(new Request("https://x/api/ask", { method: "POST", headers: { "cf-connecting-ip": "1" }, body: JSON.stringify({ question: t.q }) }), { AI, VECTORIZE, LAWS: kv(L), LIMITS: kv(), FEEDBACK: kv() });
  console.log("8. Vectorize"); expect("every query uses topK 20", VECTORIZE.calls.every((c) => c.topK === 20), JSON.stringify(VECTORIZE.calls));
  expect("3 chat calls per question (keywords, select, answer)", AI.calls.join(",") === "keywords,select,answer", AI.calls.join(","));
  const LIMITS = kv(); const r = await w.fetch(new Request("https://x/api/ask", { method: "POST", headers: { "cf-connecting-ip": "2" }, body: JSON.stringify({ question: "speeding" }) }), { AI, VECTORIZE: { query: async () => { throw new Error("down"); } }, LAWS: kv(L), LIMITS, FEEDBACK: kv() });
  expect("Vectorize down -> 502, visitor not counted", r.status === 502 && ![...LIMITS.m.keys()].some((k) => k.startsWith("ask:")));
}

// A figure tagged with a section the model was not given can't be verified, so that sentence is dropped.
{
  console.log("9. Figure tagged with a section that wasn't used");
  const t = { q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:4"],
    answer: { ids: ["law:cma:4"], shortAnswer: "Accessing a computer to commit another offence carries a fine of up to $50,000 [[law:cma:4]]. Repeat offenders face up to $50,000 [[law:cma:3]].", depends: [] } };
  const { a } = await run(t);
  expect("sentence tagged to an unused section dropped", !/Repeat offenders/.test(a.shortAnswer), a.shortAnswer);
  expect("verified sentence kept", /\$50,000/.test(a.shortAnswer), a.shortAnswer);
}
// ---------------------------------------------------------------- model switch: DeepSeek on Workers AI
const POLICE = { q: "Can police search me without a warrant?", kw: { keywords: ["search without warrant"], codes: ["cpc"] }, ideal: ["law:cpc:34"],
  answer: { ids: ["law:cpc:34"], shortAnswer: "A police officer investigating an arrestable offence may search a place without a warrant if they have reason to believe something needed for the investigation is there.", howItApplies: "The rule covers a police search.", depends: ["Whether the offence is arrestable."] } };
const fresh = (extra) => ({ ...JSON.parse(JSON.stringify(POLICE)), ...extra });
{
  console.log("10. DeepSeek model, thinking off, OpenAI reply shape");
  const { a, AI, status } = await run(fresh({}));
  const chats = AI.runs.filter((r) => r.step !== "embed");
  expect("all 3 chat calls use deepseek-v4.1-flash-1017", chats.length === 3 && chats.every((r) => r.model === "@cf/deepseek-ai/deepseek-v4.1-flash-1017"), chats.map((r) => r.model).join(", "));
  expect("every chat call sends chat_template_kwargs { thinking: false }", chats.every((r) => r.params.chat_template_kwargs && r.params.chat_template_kwargs.thinking === false));
  expect("max_tokens 200, 200, 1500 (answer step raised so long answers aren't cut)", chats.map((r) => r.params.max_tokens).join(",") === "200,200,1500", chats.map((r) => r.params.max_tokens).join(","));
  expect("embedding still bge-base-en-v1.5, no thinking flag", AI.runs.some((r) => r.step === "embed" && r.model === "@cf/baai/bge-base-en-v1.5" && !r.params.chat_template_kwargs));
  expect("answer read from choices[0].message.content", status === 200 && /arrestable offence/.test(a.shortAnswer), a.shortAnswer);
}
{
  console.log("11. Llama reply shape (out.response) still read");
  const { a, status } = await run(fresh({ shape: "llama" }));
  expect("answer read from out.response", status === 200 && /arrestable offence/.test(a.shortAnswer));
}
{
  console.log("12. Empty or null content = failed call, existing fallbacks");
  let r = await run(fresh({ fail: { keywords: { kind: "empty", times: 1 } } }));
  expect("empty keyword reply -> plain question still answered", r.status === 200 && /arrestable/.test(r.a.shortAnswer));
  r = await run(fresh({ fail: { select: { kind: "empty", times: 1 } } }));
  const given = [...r.AI.answerPrompt.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
  expect("empty selection reply -> first candidates (pinned first) used, still answered",
    r.status === 200 && given[0] === "law:cpc:78" && given[1] === "law:cpc:32" && given[2] === "law:cpc:34" && given.length <= 6 && /arrestable/.test(r.a.shortAnswer), given.join(" "));
  r = await run(fresh({ fail: { answer: { kind: "empty", times: 1 } } }));
  expect("empty answer reply -> 502, visitor's question not counted", r.status === 502 && r.a.error === "model" && !r.visitorCounted, JSON.stringify(r.a));
}
{
  console.log("13. Rate limit (3021): one retry after ~1.5 s");
  let r = await run(fresh({ fail: { answer: { kind: "rate", times: 1 } } }));
  const ans = r.AI.runs.filter((x) => x.step === "answer");
  const waited = ans.length === 2 ? ans[1].at - ans[0].at : 0;
  expect("rate-limited answer retried once and answered", r.status === 200 && ans.length === 2 && /arrestable/.test(r.a.shortAnswer), `${ans.length} calls`);
  expect("retry waited about 1.5 s", waited >= 1400 && waited < 3000, `${waited} ms`);
  expect("retry used the same model, not the fallback", ans.every((x) => x.model === "@cf/deepseek-ai/deepseek-v4.1-flash-1017"));
  r = await run(fresh({ fail: { answer: { kind: "rate", times: 2 } } }));
  expect("rate-limited twice -> 502, visitor's question not counted", r.status === 502 && !r.visitorCounted && r.AI.runs.filter((x) => x.step === "answer").length === 2);
  r = await run(fresh({ fail: { embed: { kind: "rate", times: 1 } } }));
  expect("rate-limited embedding retried once and answered", r.status === 200 && r.AI.runs.filter((x) => x.step === "embed").length === 2);
  r = await run(fresh({ fail: { keywords: { kind: "rate", times: 2 } } }));
  expect("keyword step rate-limited twice -> plain question, still answered", r.status === 200 && /arrestable/.test(r.a.shortAnswer));
}
{
  console.log("14. Fallback model on other errors");
  const r = await run(fresh({ failModel: "@cf/deepseek-ai/deepseek-v4.1-flash-1017" }));
  const chats = r.AI.runs.filter((x) => x.step !== "embed");
  expect("each step tries v4-flash-0731 after the primary fails", chats.filter((x) => x.model === "@cf/deepseek-ai/deepseek-v4-flash-0731").length === 3, chats.map((x) => x.model.split("/").pop()).join(", "));
  expect("still answered", r.status === 200 && /arrestable/.test(r.a.shortAnswer));
}
// ---------------------------------------------------------------- conditions (live failure: CPC s78 over-generalised)
const SEARCH = (answer) => ({ q: "Can police search me without a warrant?", kw: { keywords: ["search without warrant", "search of arrested persons"], codes: ["cpc"] },
  ideal: ["law:cpc:34", "law:cpc:78"], extraHits: ["law:cpc:78"], answer });
const S78_1 = "If a person is arrested and cannot be admitted to bail or cannot furnish bail, the officer may search them and place in safe custody the articles found on them, other than necessary wearing apparel [[law:cpc:78]].";
const S78_1A = "When a police officer arrests a person, or receives an arrested person from a private person, the officer may also search that person and take into safe custody any article found on them that they could use to cause harm to themselves or anyone else [[law:cpc:78]].";
const S34 = "Separately, a police officer investigating an arrestable offence may search a place without a warrant only if they have reason to believe something needed for the investigation is there [[law:cpc:34]].";
const plain = (x) => x.replace(/\s*\[\[[^\]]*\]\]/g, "");
{
  console.log("15. Police search without a warrant: conditions stated, s78 first, s78(1A) as the real text says");
  const { a, status } = await run(SEARCH({ ids: ["law:cpc:78", "law:cpc:34"],
    powers: [{ provision: "78(1)", power: "search an arrested person and keep articles", conditions: "arrested and cannot be admitted to or furnish bail; not necessary wearing apparel" },
             { provision: "78(1A)", power: "search and keep articles that could cause harm", conditions: "on arrest, or on handover from a private person" },
             { provision: "34(1)", power: "search a place without a warrant", conditions: "investigating an arrestable offence and reason to believe a thing needed is there" }],
    shortAnswer: `${S78_1} ${S78_1A} ${S34}`,
    howItApplies: "The rules on searching an arrested person and on searches without a warrant cover a police search.",
    depends: ["Whether the person was arrested.", "Whether they can be admitted to bail.", "Whether the offence being investigated is arrestable."] }));
  expect("status 200", status === 200, JSON.stringify(a).slice(0, 200));
  expect("personal search (s78) answered first", a.shortAnswer.startsWith("If a person is arrested and cannot be admitted to bail"), a.shortAnswer);
  expect("s78(1) with its bail condition and the wearing-apparel exception", /cannot be admitted to bail or cannot furnish bail/.test(a.shortAnswer) && /other than necessary wearing apparel/.test(a.shortAnswer));
  expect("s78(1A) as the real text: articles that could cause harm, on arrest or handover", /could use to cause harm/.test(a.shortAnswer) && /from a private person/.test(a.shortAnswer));
  expect("no claim that (1A) is about people released on bail", !/released on bail/.test(a.shortAnswer));
  expect("s34 applies to an arrestable offence, with its condition", /arrestable offence may search a place without a warrant only if they have reason to believe/.test(a.shortAnswer));
  expect("never says any arrested person's belongings are all kept without condition", !/any (arrested )?person/i.test(a.shortAnswer) && !/keep (in safe custody )?all/i.test(a.shortAnswer));
  expect("every complete sentence kept (3 of 3)", [S78_1, S78_1A, S34].every((x) => a.shortAnswer.includes(plain(x).slice(0, -1))), a.shortAnswer);
  expect("sources are s78 then s34", src(a) === "Criminal section 78, Criminal section 34", src(a));
  expect("'powers' worksheet not shown to the user", !("powers" in a));
}
{
  console.log("16. Live bad answer replayed: over-broad and vague sentences dropped");
  const { a } = await run(SEARCH({ ids: ["law:cpc:78", "law:cpc:34"],
    shortAnswer: "Police may search any arrested person and keep all articles found on them [[law:cpc:78]]. Police can also search without a warrant in the stated situations [[law:cpc:34]].",
    howItApplies: "In certain cases, police may search a place without a warrant.", depends: ["Whether a warrant was issued."] }));
  expect("'any arrested person ... all articles' dropped", !/any arrested person|all articles/i.test(a.shortAnswer), a.shortAnswer);
  expect("'in the stated situations' dropped", !/stated situations/i.test(a.shortAnswer));
  expect("vague 'In certain cases' how-it-applies replaced by the neutral default", !/certain cases/i.test(a.howItApplies), a.howItApplies);
  expect("falls back to naming the rules found, with the figures note", /most relevant rules found/.test(a.shortAnswer) && !!a.figuresNote);
}
{
  console.log("17. Mixed answer: the conditioned sentence kept, the over-broad one dropped");
  const { a } = await run(SEARCH({ ids: ["law:cpc:34", "law:cpc:78"],
    shortAnswer: "A police officer investigating an arrestable offence may search a place without a warrant only if they have reason to believe something needed for the investigation is there [[law:cpc:34]]. Police may also search any arrested person and keep all articles [[law:cpc:78]].",
    howItApplies: "The rule on searches without a warrant covers this.", depends: [] }));
  expect("conditioned s34 sentence kept", /only if they have reason to believe/.test(a.shortAnswer), a.shortAnswer);
  expect("over-broad s78 sentence dropped", !/any arrested person/i.test(a.shortAnswer));
}
{
  console.log("18. Answer prompt carries the new rules");
  const { AI } = await run(SEARCH({ ids: ["law:cpc:34"], shortAnswer: "x.", depends: [] }));
  const sys = AI.runs.filter((r) => r.step === "answer")[0].params.messages[0].content;
  expect("conditions and limits rule", /state its conditions and limits in plain words/.test(sys));
  expect("sub-provision rule (1) versus (1A)", /subsection \(1\) versus \(1A\)/.test(sys));
  expect("vague-phrase rule", /in the stated situations/.test(sys) && /Either say what the conditions are, or leave the sentence out/.test(sys));
  expect("self-check before replying", /check every sentence of "shortAnswer" and "howItApplies" against the section text/.test(sys));
  expect("'powers' worksheet in the reply shape", /"powers": \[/.test(sys));
}
// ---------------------------------------------------------------- truncation (live bug: answers hard-cut at 900 chars)
{
  console.log("19. Long answer over 900 characters comes back whole");
  const S34b = "That place search also covers anything found there that the officer has reason to believe is needed for the investigation of the arrestable offence, and it does not depend on anyone having been arrested first [[law:cpc:34]].";
  const S78c = "The safe-custody power for articles that could be used to cause harm applies whether the officer made the arrest or received the arrested person from a private person, and it is separate from the bail-related power to keep other articles [[law:cpc:78]].";
  const long = `${S78_1} ${S78_1A} ${S78c} ${S34} ${S34b}`;
  const { a } = await run(SEARCH({ ids: ["law:cpc:78", "law:cpc:34"], shortAnswer: long, howItApplies: "The rules on searching a person and searching a place cover this.", depends: [] }));
  const expected = [S78_1, S78_1A, S78c, S34, S34b].map(plain);
  expect("answer is longer than 900 characters", a.shortAnswer.length > 900, `${a.shortAnswer.length} chars`);
  expect("all 5 sentences present, none cut", expected.every((x) => a.shortAnswer.includes(x.slice(0, -1))), a.shortAnswer.slice(-120));
  expect("ends on a complete sentence", /[.)]$/.test(a.shortAnswer));
}
{
  console.log("20. Reply cut off mid-word (finish_reason length): only the dangling fragment is dropped");
  const raw = '{"ids":["law:cma:3","law:cma:4"],"powers":[{"provision":"3(1)","power":"offence","conditions":"knowingly, without authority"}],' +
    '"shortAnswer":"Knowingly getting a computer to give access to data without authority is an offence with a fine of up to $5,000 or up to 2 years in jail, or both [[law:cma:3]]. ' +
    'Doing it with intent to commit another offence carries a fine of up to $50,000 or up to 10 years in jail, or b';
  const { a, status } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3", "law:cma:4"], answerRaw: raw, finish: "length" });
  expect("still answered (200), not a model error", status === 200, JSON.stringify(a).slice(0, 160));
  expect("complete first sentence kept", /\$5,000 or up to 2 years in jail, or both/.test(a.shortAnswer), a.shortAnswer);
  expect("dangling 'or b' fragment dropped", !/or b\b/.test(a.shortAnswer) && !/10 years/.test(a.shortAnswer), a.shortAnswer);
  expect("cut-off fields fall back to defaults", /depends on the full facts/.test(a.howItApplies) && a.depends.length === 1, JSON.stringify([a.howItApplies, a.depends]));
}
{
  console.log("21. Reply ending without a full stop (not flagged as cut): fragment dropped, rest kept");
  const { a } = await run(SEARCH({ ids: ["law:cpc:78"], shortAnswer: `${plain(S78_1)} ${plain(S78_1A)} The officer may also take any article used by a pers`,
    howItApplies: "The rule on searching an arrested person covers this. It also covers questions tending t", depends: ["Whether the person was arrested."] }));
  expect("both complete s78 sentences kept", a.shortAnswer.includes(plain(S78_1).slice(0, -1)) && a.shortAnswer.includes(plain(S78_1A).slice(0, -1)), a.shortAnswer);
  expect("'used by a pers' fragment dropped", !/used by a pers/.test(a.shortAnswer));
  expect("'questions tending t' dropped from how-it-applies, complete sentence kept", a.howItApplies === "The rule on searching an arrested person covers this.", a.howItApplies);
  expect("bullet kept whole", a.depends[0] === "Whether the person was arrested.");
}
{
  console.log("22. Cut inside the bullets: complete bullets kept, the half bullet left out");
  const raw = '{"ids":["law:cma:3"],"shortAnswer":"Knowingly getting a computer to give access to data without authority is an offence with a fine of up to $5,000 or up to 2 years in jail, or both.",' +
    '"howItApplies":"The rule on unauthorised access covers someone getting into an account without permission.","depends":["Whether the access was knowing.","Whether it was meant to commit another off';
  const { a } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3"], answerRaw: raw, finish: "length" });
  expect("short answer and how-it-applies whole", /or both\.$/.test(a.shortAnswer) && /without permission\.$/.test(a.howItApplies), a.shortAnswer);
  expect("only the complete bullet kept", a.depends.length === 1 && a.depends[0] === "Whether the access was knowing.", JSON.stringify(a.depends));
}
{
  console.log("23. Hacking stand-in: every complete sentence kept");
  const H1 = "Knowingly getting a computer to give access to any program or data without authority is an offence with a fine of up to $5,000 or up to 2 years in jail, or both [[law:cma:3]].";
  const H2 = "For a second or later conviction, the penalty is a fine of up to $10,000 or up to 3 years in jail, or both [[law:cma:3]].";
  const H3 = "Doing it with intent to commit another offence carries a fine of up to $50,000 or up to 10 years in jail, or both [[law:cma:4]].";
  const { a } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3", "law:cma:4"],
    answer: { ids: ["law:cma:3", "law:cma:4"], shortAnswer: `${H1} ${H2} ${H3}`, howItApplies: "The rule on unauthorised access covers this.", depends: ["Whether it was knowing."] } });
  expect("all 3 sentences kept", [H1, H2, H3].every((x) => a.shortAnswer.includes(plain(x).slice(0, -1))), a.shortAnswer);
  expect("basic offence (section 3) first", a.shortAnswer.startsWith("Knowingly getting a computer"), a.shortAnswer.slice(0, 60));
}
{
  console.log("24. Personal search answered before a secondary place-search power");
  const S33 = "A police officer may also enter and search a place a person to be arrested has entered, if they have reason to believe the person is inside [[law:cpc:33]].";
  const { a } = await run({ ...SEARCH({ ids: ["law:cpc:33", "law:cpc:78"], shortAnswer: `${S33} ${S78_1} ${S78_1A}`, howItApplies: "The rule on searching an arrested person covers this.", depends: [] }),
    ideal: ["law:cpc:33", "law:cpc:78"], extraHits: ["law:cpc:78", "law:cpc:33"] });
  expect("s78 sentences come first although the model put s33 first", a.shortAnswer.startsWith("If a person is arrested and cannot be admitted to bail"), a.shortAnswer.slice(0, 80));
  expect("s33 sentence kept, after s78", a.shortAnswer.indexOf("enter and search a place") > a.shortAnswer.indexOf("cause harm"));
  expect("footnote lists s78 first", src(a).startsWith("Criminal section 78"), src(a));
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
if (fails) process.exitCode = 1;
