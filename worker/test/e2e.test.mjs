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
  return { matches: [hit("law:wc:64E", 0.82), hit("law:pc:1", 0.8), hit("law:rtsn:2", 0.7), hit("law:cpc:92", 0.5)] }; } };

// Workers AI chat replies in the OpenAI shape (DeepSeek); t.shape = "llama" returns the old { response } shape.
const openai = (content) => ({ id: "chatcmpl-test", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: {} });
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
    return reply(JSON.stringify(t.answer));
  } };
  return ai;
}
async function run(t) {
  const w = await load(); VECTORIZE.calls = [];
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
  expect("max_tokens unchanged (200, 200, 900)", chats.map((r) => r.params.max_tokens).join(",") === "200,200,900", chats.map((r) => r.params.max_tokens).join(","));
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
    r.status === 200 && given[0] === "law:cpc:32" && given[1] === "law:cpc:34" && given.length <= 6 && /arrestable/.test(r.a.shortAnswer), given.join(" "));
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
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
if (fails) process.exitCode = 1;
