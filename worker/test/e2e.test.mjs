// End-to-end test of /api/ask with fake stand-ins for Workers AI, Vectorize and KV (no network, no Cloudflare).
// Run: node worker/test/e2e.test.mjs   (exit code 1 on failure)
//
// The stand-in records have the real KV shapes. Vector results are deliberately noisy (Women's Charter 64E for policing
// questions, rtsn 2 for the expressway one) and miss the expected sections, so they must come from pinning. The fake
// selection model picks whichever of the expected sections it is shown, so this tests the plumbing (pinning, filtering,
// previews, section tags, number guard, expressway override, not covered), not the real model's judgement.
// Stand-in answers follow the plain-language limits: short answer at most 2 sentences and 45 words.
let n = 0;
const WORKER = new URL("../index.js", import.meta.url).href;
const load = async () => (await import(WORKER + "?run=" + n++)).default;
const kv = (init = {}) => { const m = new Map(Object.entries(init)); let gets = 0; return { m, gets: () => gets, get: async (k, t) => { gets++; const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => m.set(k, v) }; };
const SRC = "Singapore Statutes Online, Attorney-General's Chambers";
const ACTS = { const: "Constitution of the Republic of Singapore", cpc: "Criminal Procedure Code 2010", cma: "Computer Misuse Act 1993", wc: "Women's Charter 1961", rta: "Road Traffic Act 1961", rtsn: "Road Traffic (Restriction of Speed on Roads) Notification", pc: "Penal Code 1871",
  ceswoa: "Corrosive and Explosive Substances and Offensive Weapons Act 1958", psn: "Poisons Act 1938", psnr: "Poisons Rules" };
const L = {};
const put = (code, section, heading, text) => { L[`law:${code}:${section}`] = JSON.stringify({ act: ACTS[code], act_code: code, section, heading, text, version_in_force_from: "2024-01-01", parts: 1, source: SRC }); };
put("const", "9", "Liberty of the person", "(3) Where a person is arrested, he shall be informed as soon as may be of the grounds of his arrest and shall be allowed to consult and be defended by a legal practitioner of his choice. (4) Where a person is arrested and not released, he shall, without unreasonable delay, and in any case within 48 hours (excluding the time of any necessary journey), be produced before a Magistrate.");
put("cpc", "68", "Person arrested to be informed of grounds of arrest", "A police officer making an arrest must inform the person arrested of the grounds of the arrest as soon as may be. Filler text ".repeat(4));
put("cpc", "22", "Power to examine witnesses", "(1) In conducting an investigation, a police officer may examine orally any person who appears to be acquainted with any of the facts and circumstances of the case. (2) The person examined shall be bound to state truly what he knows of the facts and circumstances of the case, except that he need not say anything that might expose him to a criminal charge, penalty or forfeiture.");
put("cpc", "23", "Cautioned statements", "(1) If, during an investigation, a person is charged with an offence or informed that he may be prosecuted, a police officer must serve on that person a notice ... (3) a court may draw such inferences as appear proper from a failure to mention a fact later relied on.");
put("cpc", "258", "Admissibility of accused's statements", "Where any person is charged with an offence, any statement made by the person ... shall be admissible ...");
put("cpc", "261", "Inferences from accused's silence", "Where in any criminal proceedings evidence is given that the accused, on being charged, failed to mention any fact, the court may draw such inferences as appear proper.");
put("cpc", "32", "Search by police officer", "A police officer may search any place where he has reason to believe that a thing necessary for an investigation may be found.");
// STAND-IN for CPC s34 (shape and key condition only, not the verbatim text).
put("cpc", "34", "Search without warrant for arrestable offences", "(1) A police officer investigating an arrestable offence may, without a search warrant, search any place for a document or other thing needed for the investigation, if he has reason to believe that the document or thing is likely to be removed or lost before a search warrant can be obtained.");
// CPC s78: the real text of law:cpc:78 (version in force 15/9/2026).
L["law:cpc:78"] = JSON.stringify({ act: ACTS.cpc, act_code: "cpc", section: "78", heading: "Search of arrested persons", version_in_force_from: "2026-09-15", parts: 1, source: SRC,
  text: "78.—(1) Whenever —\n(a) a person is arrested by a police officer under a warrant which does not provide for the taking of bail or under a warrant which provides for the taking of bail but the person arrested cannot furnish bail; or\n(b) a person is arrested without warrant by a police officer or a private person under a warrant and the person arrested cannot legally be admitted to bail or is unable to furnish bail,\nthe police officer making the arrest or, when the arrest is made by a private person, the police officer to whom the private person hands over the person arrested, may search the person arrested and place in safe custody all articles other than necessary wearing apparel found upon him or her.\n(1A) Whenever a person is arrested by a police officer or an arrested person is handed over to a police officer under section 66, the police officer may search the person arrested and place in safe custody any article that the person arrested may potentially use to cause harm to himself or herself or to any other person. [Act 5 of 2024 wef 31/05/2024]\n(2) A police officer investigating an arrestable offence under Part 4 may — (a) enter any place belonging to or under the control of any person who — (i) is under arrest in connection with the offence; (ii) is reasonably believed to be connected with the offence; or (iii) is reasonably believed to have given shelter to the person under arrest; and (b) search the place for any evidence of the offence." });
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
// STAND-INS for special-Act sections (shape only, not the verbatim text): a power limited to offences "under this Act".
put("ceswoa", "9", "Power of search (stand-in)", "A police officer may, without a warrant, stop and search any person whom he reasonably suspects of having committed or being about to commit an offence under this Act, and seize any corrosive or explosive substance or offensive weapon found.");
put("psn", "5", "Sale of poisons (stand-in)", "No person shall sell any poison unless he is licensed under this Act.");
put("psn", "6", "Poisons licences (stand-in)", "A licence to sell poisons may be granted by the licensing authority, subject to the conditions in the licence.");
put("psn", "9", "Possession of poisons (stand-in)", "No person shall have in his possession any poison except as allowed under this Act.");
put("psnr", "4", "Labelling of poisons (stand-in)", "Every container of a poison shall be labelled with the name of the poison.");
put("psn", "19", "Penalty (stand-in)", "Any person who contravenes this Act shall be liable on conviction to a fine not exceeding $10,000 or to imprisonment for a term not exceeding 2 years or to both.");
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
  const a = await r.json();
  if (r.status === 200) checkLength(t.q, a.shortAnswer);
  return { a, AI, status: r.status, lawsReads: LAWS.gets(), visitorCounted: [...env.LIMITS.m.keys()].some((k) => k.startsWith("ask:")) };
}
// Every short answer the Worker returns: at most 2 sentences and 45 words. Checked on every run, reported at the end.
const sentencesIn = (t) => String(t).trim().split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter(Boolean);
const wordsIn = (t) => (String(t).match(/\S+/g) || []).length;
const lengthViolations = [];
let lengthChecked = 0;
function checkLength(q, text) {
  lengthChecked++;
  if (wordsIn(text) > 45 || sentencesIn(text).length > 2) lengthViolations.push(`${q}: ${wordsIn(text)} words, ${sentencesIn(text).length} sentences: ${text}`);
}
let fails = 0;
const expect = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${detail ? "  — " + detail : ""}`); if (!cond) fails++; };
const src = (a) => (a.sources || []).map((s) => `${s.act.split(" ")[0]} ${s.label}`).join(", ");

// Plain stand-in sentences used by several cases.
const HACK3 = "Getting into a computer without permission can mean up to $5,000 fine or 2 years' jail, or both [[law:cma:3]].";
const HACK4 = "Doing it to commit another crime can mean up to $50,000 fine or 10 years' jail, or both [[law:cma:4]].";
const S34 = "Police investigating an arrestable offence (a serious offence where police can arrest without a warrant) may search a place without a warrant only when the thing is likely to be removed or lost first.";
const S78_1 = "If you are arrested and cannot get or pay bail, police may search you and keep your things, except clothing you need [[law:cpc:78]].";
const S78_1A = "When arresting you, police may also take items you could use to hurt yourself or others [[law:cpc:78]].";
const plain = (x) => x.replace(/\s*\[\[[^\]]*\]\]/g, "");
const noTag = (x) => plain(x).replace(/\.$/, "");

const T = [
  { name: "1. Lawyer when arrested (expect const 9)", q: "My brother was arrested. Can he see a lawyer?",
    kw: { keywords: ["arrested person", "consult legal practitioner", "produced before Magistrate"], codes: ["cpc", "const"] },
    ideal: ["law:const:9", "law:cpc:68"],
    answer: { ids: ["law:const:9", "law:cpc:68"], shortAnswer: "If you are arrested, you must be told why and may see a lawyer of your choice [[law:const:9]]. If not released, you must be taken to a Magistrate (a judge) within 48 hours [[law:const:9]].", howItApplies: "The rule on the liberty of the person covers someone who has been arrested.", depends: ["Whether he has been released.", "When the arrest happened."] },
    check: (a, AI) => {
      expect("const 9 pinned into candidates although vector search missed it", AI.candidateIds.includes("law:const:9"));
      expect("Women's Charter 64E dropped from candidates", !AI.candidateIds.includes("law:wc:64E"), AI.candidateIds.join(" "));
      expect("selection saw previews only (<=200 chars)", AI.previewMax <= 200, `longest ${AI.previewMax}`);
      expect("answer step got only the selected sections", (AI.answerPrompt.match(/<section id=/g) || []).length === 2);
      expect("sources lead with const 9 as Article 9", src(a).startsWith("Constitution Article 9"), src(a));
      expect("48 hours kept, one tag at the end of the sentence", /within 48 hours \(Article 9\)\.$/.test(a.shortAnswer), a.shortAnswer);
      expect("further-reading link shown", !!a.furtherReading);
    } },
  { name: "2. Police questions (expect cpc 22, 23)", q: "Do I have to answer police questions?",
    kw: { keywords: ["examination of witnesses", "statement to police", "adverse inference"], codes: ["cpc"] },
    ideal: ["law:cpc:22", "law:cpc:23", "law:cpc:261"],
    answer: { ids: ["law:cpc:22", "law:cpc:23"], shortAnswer: "Police can question anyone who seems to know about a case, and you must tell the truth [[law:cpc:22]]. But you do not have to say anything that could get you charged with a crime [[law:cpc:22]].", howItApplies: "The rule on police questioning covers being asked questions by the police.", depends: ["Whether you have been charged."] },
    check: (a, AI) => {
      expect("cpc 22, 23, 258, 261 pinned", ["law:cpc:22", "law:cpc:23", "law:cpc:258", "law:cpc:261"].every((k) => AI.candidateIds.includes(k)));
      expect("sources are cpc 22 then 23", src(a) === "Criminal section 22, Criminal section 23", src(a));
      expect("Women's Charter dropped", !AI.candidateIds.includes("law:wc:64E"));
      expect("further-reading link shown", !!a.furtherReading);
    } },
  { name: "3. Basic hacking (expect $5,000 and 2 years under cma 3)", q: "Someone hacked into my email account",
    kw: { keywords: ["unauthorised access to computer material", "securing access without authority"], codes: ["cma"] },
    ideal: ["law:cma:3", "law:cma:4", "law:cma:5"],
    answer: { ids: ["law:cma:3", "law:cma:4"], shortAnswer: `${HACK3} Repeat offenders face up to $50,000 [[law:cma:3]]. ${HACK4}`, howItApplies: "The rule on unauthorised access covers someone getting into an account without permission.", depends: ["Whether it was meant to commit another crime."] },
    check: (a, AI) => {
      expect("cma 3 is the first candidate (pinned first)", AI.candidateIds[0] === "law:cma:3", AI.candidateIds.slice(0, 3).join(" "));
      expect("cma 3 leads the sources", src(a).startsWith("Computer section 3"), src(a));
      expect("plain penalty, $5,000 and 2 years, tagged section 3 at the end", /up to \$5,000 fine or 2 years' jail, or both \(section 3\)\./.test(a.shortAnswer), a.shortAnswer);
      expect("cma 4 penalty kept separately", /up to \$50,000 fine or 10 years' jail, or both \(section 4\)\.$/.test(a.shortAnswer));
      expect("merged penalty ($50,000 tagged to section 3) dropped", !/Repeat offenders/.test(a.shortAnswer));
      expect("'details left out' note shown for the dropped sentence", a.figuresNote === "Some details are left out, check the official source below.", a.figuresNote);
    } },
  { name: "4. Police search without warrant (expect cpc 34, with its key condition)", q: "Can police search me without a warrant?",
    kw: { keywords: ["search without warrant", "arrestable offence"], codes: ["cpc"] },
    ideal: ["law:cpc:34", "law:cpc:32"],
    answer: { ids: ["law:cpc:34"], shortAnswer: S34, howItApplies: "The rule on searches without a warrant covers a police search during an investigation.", depends: ["Whether the offence is arrestable."] },
    check: (a, AI) => {
      expect("cpc 32 and 34 pinned", AI.candidateIds.includes("law:cpc:34") && AI.candidateIds.includes("law:cpc:32"));
      expect("source is cpc section 34", src(a) === "Criminal section 34", src(a));
      expect("s34's key condition kept: likely to be removed or lost", /likely to be removed or lost/.test(a.shortAnswer), a.shortAnswer);
      expect("legal term explained in brackets", /arrestable offence \(a serious offence/.test(a.shortAnswer));
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
      expect("coverage text in reply, incl. poisons", /policing and criminal procedure/.test(a.shortAnswer) && /poisons and dangerous substances/.test(a.shortAnswer));
    } },
  { name: "7. Selection reply unreadable -> falls back to pinned candidates", q: "Someone hacked into my email account",
    kw: { keywords: ["unauthorised access"], codes: ["cma"] }, selectRaw: "not json",
    answer: { ids: ["law:cma:3"], shortAnswer: plain(HACK3), depends: [] },
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
  console.log("9. Figure tagged with a section that wasn't used; two sections in one sentence");
  const { a } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:4"],
    answer: { ids: ["law:cma:4"], shortAnswer: "Hacking to commit another crime can mean up to $50,000 fine [[law:cma:4]]. Repeat offenders face up to $50,000 [[law:cma:3]].", depends: [] } });
  expect("sentence tagged to an unused section dropped", !/Repeat offenders/.test(a.shortAnswer), a.shortAnswer);
  expect("verified sentence kept", /\$50,000/.test(a.shortAnswer), a.shortAnswer);
  const r2 = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3", "law:cma:4"],
    answer: { ids: ["law:cma:3", "law:cma:4"], shortAnswer: `Hacking can mean up to $5,000 fine [[law:cma:3]] or up to $50,000 fine [[law:cma:4]]. ${HACK3}`, depends: [] } });
  expect("sentence merging two sections dropped", !/or up to \$50,000 fine/.test(r2.a.shortAnswer), r2.a.shortAnswer);
  expect("the single-section sentence kept", /\$5,000 fine or 2 years' jail/.test(r2.a.shortAnswer));
}
// ---------------------------------------------------------------- model switch: DeepSeek on Workers AI
const POLICE = { q: "Can police search me without a warrant?", kw: { keywords: ["search without warrant"], codes: ["cpc"] }, ideal: ["law:cpc:34"],
  answer: { ids: ["law:cpc:34"], shortAnswer: S34, howItApplies: "The rule covers a police search.", depends: ["Whether the offence is arrestable."] } };
const fresh = (extra) => ({ ...JSON.parse(JSON.stringify(POLICE)), ...extra });
{
  console.log("10. DeepSeek model, thinking off, OpenAI reply shape");
  const { a, AI, status } = await run(fresh({}));
  const chats = AI.runs.filter((r) => r.step !== "embed");
  expect("all 3 chat calls use deepseek-v4.1-flash-1017", chats.length === 3 && chats.every((r) => r.model === "@cf/deepseek-ai/deepseek-v4.1-flash-1017"), chats.map((r) => r.model).join(", "));
  expect("every chat call sends chat_template_kwargs { thinking: false }", chats.every((r) => r.params.chat_template_kwargs && r.params.chat_template_kwargs.thinking === false));
  expect("max_tokens 200, 200, 1500", chats.map((r) => r.params.max_tokens).join(",") === "200,200,1500", chats.map((r) => r.params.max_tokens).join(","));
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
// ---------------------------------------------------------------- conditions (CPC s78, real text)
const SEARCH = (answer) => ({ q: "Can police search me without a warrant?", kw: { keywords: ["search without warrant", "search of arrested persons"], codes: ["cpc"] },
  ideal: ["law:cpc:34", "law:cpc:78"], extraHits: ["law:cpc:78"], answer });
{
  console.log("15. Police search: s78(1), (1A) and (2) kept separate, each with its own condition");
  const { a, status } = await run(SEARCH({ ids: ["law:cpc:78", "law:cpc:34"],
    powers: [{ provision: "78(1)", power: "search arrested person, keep articles", conditions: "arrest under a warrant without bail, or bail not possible or not furnished; not necessary clothing" },
             { provision: "78(1A)", power: "keep articles that could cause harm", conditions: "on arrest by police or handover under s66" },
             { provision: "78(2)", power: "enter and search a place for evidence", conditions: "investigating an arrestable offence; place linked to the person arrested or connected" }],
    shortAnswer: `${S78_1} ${S78_1A}`,
    howItApplies: "The rule on searching an arrested person covers being searched after arrest. A separate power lets police investigating an arrestable offence search places linked to it for evidence.",
    depends: ["Whether you were arrested.", "Whether you can get or pay bail."] }));
  const [first, second] = sentencesIn(a.shortAnswer);
  expect("status 200", status === 200, JSON.stringify(a).slice(0, 200));
  expect("personal search (s78) answered first", /^If you are arrested and cannot get or pay bail/.test(a.shortAnswer), a.shortAnswer);
  expect("(1) only on arrest where bail is not possible or not paid, clothing excepted", /cannot get or pay bail/.test(first) && /except clothing you need/.test(first), first);
  expect("(1A) only for items that could cause harm, in its own sentence", /could use to hurt yourself or others/.test(second || "") && !/bail/.test(second || "") && !/hurt/.test(first), second);
  expect("(2) is a place search for evidence of an arrestable offence", /arrestable offence search places linked to it for evidence/.test(a.howItApplies), a.howItApplies);
  expect("never says any arrested person's belongings are all kept", !/any (arrested )?person/i.test(a.shortAnswer) && !/keep (all|everything)/i.test(a.shortAnswer));
  expect("both complete sentences kept", [S78_1, S78_1A].every((x) => a.shortAnswer.includes(noTag(x))), a.shortAnswer);
  expect("one tag per sentence, at the end", sentencesIn(a.shortAnswer).every((x) => /\(section 78\)\.$/.test(x) && (x.match(/\(section/g) || []).length === 1));
  expect("sources are s78 then s34", src(a) === "Criminal section 78, Criminal section 34", src(a));
  expect("at most 3 bullets, each at most 12 words", a.depends.length <= 3 && a.depends.every((d) => wordsIn(d) <= 12), JSON.stringify(a.depends));
  expect("'powers' worksheet not shown to the user", !("powers" in a));
}
{
  console.log("16. Live bad answer replayed: over-broad and vague sentences dropped");
  const { a } = await run(SEARCH({ ids: ["law:cpc:78", "law:cpc:34"],
    shortAnswer: "Police may search any arrested person and keep all articles found on them [[law:cpc:78]]. Police can also search without a warrant on one of the listed grounds [[law:cpc:34]].",
    howItApplies: "In certain cases, police may search a place without a warrant.", depends: ["Whether a warrant was issued."] }));
  expect("'any arrested person ... all articles' dropped", !/any arrested person|all articles/i.test(a.shortAnswer), a.shortAnswer);
  expect("'one of the listed grounds' dropped", !/listed grounds/i.test(a.shortAnswer));
  expect("vague 'In certain cases' how-it-applies replaced by the neutral default", !/certain cases/i.test(a.howItApplies), a.howItApplies);
  expect("falls back to naming the rules found, with the 'details left out' note", /^LawyerLah found rules on: /.test(a.shortAnswer) && a.figuresNote === "Some details are left out, check the official source below.", a.shortAnswer);
}
{
  console.log("17. Mixed answer: the conditioned sentence kept, the over-broad one dropped");
  const { a } = await run(SEARCH({ ids: ["law:cpc:34", "law:cpc:78"],
    shortAnswer: `${S34.replace(/\.$/, " [[law:cpc:34]].")} Police may also search any arrested person and keep all articles [[law:cpc:78]].`,
    howItApplies: "The rule on searches without a warrant covers this.", depends: [] }));
  expect("conditioned s34 sentence kept", /likely to be removed or lost/.test(a.shortAnswer), a.shortAnswer);
  expect("over-broad s78 sentence dropped", !/any arrested person/i.test(a.shortAnswer));
  expect("'details left out' note shown", !!a.figuresNote);
}
{
  console.log("18. Answer prompt carries the rules");
  const { AI } = await run(SEARCH({ ids: ["law:cpc:34"], shortAnswer: "x.", depends: [] }));
  const sys = AI.runs.filter((r) => r.step === "answer")[0].params.messages[0].content;
  expect("plain language: 12-year-old, jail not imprisonment, arrested not apprehended", /12-year-old/.test(sys) && /"jail" or "prison", never "imprisonment"/.test(sys) && /"arrested", never "apprehended"/.test(sys));
  expect("legal terms explained in brackets", /Explain any legal term in brackets/.test(sys));
  expect("short answer at most 2 short sentences, about 35 words", /at most 2 short sentences, about 35 words/.test(sys));
  expect("plain penalties, only the tiers that matter", /up to \$5,000 fine or 2 years' jail, or both/.test(sys) && /only the penalty tiers that matter/.test(sys));
  expect("shorter never less accurate: drop the point, never the condition", /leave out that whole point, never the condition/.test(sys));
  expect("one power per sentence, one tag at the end", /One power or rule per sentence/.test(sys) && /end each sentence with exactly one section id/.test(sys));
  expect("sub-provision rule (1) versus (1A)", /subsection \(1\) versus \(1A\)/.test(sys));
  expect("special Acts named by offence category", /offences involving corrosive or explosive substances or offensive weapons/.test(sys) && /Never present it as a general police power/.test(sys));
  expect("warrant condition, not 'one of the listed grounds'", /likely to be removed or lost/.test(sys) && /"one of the listed grounds"/.test(sys));
  expect("how-it-applies max 2 sentences; max 3 bullets under 12 words", /"howItApplies": at most 2 short/.test(sys) && /at most 3 bullets, each under 12 words/.test(sys));
  expect("self-check before replying", /check every sentence of "shortAnswer" and "howItApplies" against the section text/.test(sys));
  expect("'powers' worksheet in the reply shape", /"powers": \[/.test(sys));
}
// ---------------------------------------------------------------- length limits and truncation
{
  console.log("19. Long answer: cut to whole sentences (2 max, 45 words max), never mid-word");
  const long = [S78_1, S78_1A,
    "This applies whether the officer made the arrest or received you from a private person who made it [[law:cpc:78]].",
    S34.replace(/\.$/, " [[law:cpc:34]]."),
    "Police investigating an arrestable offence may also enter places linked to you and search them for evidence [[law:cpc:78]]."].join(" ");
  const { a } = await run(SEARCH({ ids: ["law:cpc:78", "law:cpc:34"], shortAnswer: long, howItApplies: "The rules on searching a person and searching a place cover this.", depends: [] }));
  expect("model answer had 5 sentences", sentencesIn(plain(long)).length === 5, `${sentencesIn(plain(long)).length}`);
  expect("at most 2 sentences and 45 words", sentencesIn(a.shortAnswer).length <= 2 && wordsIn(a.shortAnswer) <= 45, `${sentencesIn(a.shortAnswer).length} sentences, ${wordsIn(a.shortAnswer)} words`);
  expect("kept sentences are whole (each one from the model, word for word)", sentencesIn(a.shortAnswer).every((x) => plain(long).includes(x.replace(/ \(section \d+\)\.$/, "."))), a.shortAnswer);
  expect("'details left out' note shown", !!a.figuresNote);
}
{
  console.log("20. Reply cut off mid-word (finish_reason length): only the dangling fragment is dropped");
  const raw = '{"ids":["law:cma:3","law:cma:4"],"powers":[{"provision":"3(1)","power":"offence","conditions":"knowingly, without authority"}],' +
    `"shortAnswer":"${HACK3.replace(/'/g, "'")} ` +
    "Doing it to commit another crime can mean up to $50,000 fine or 10 years' jail, or b";
  const { a, status } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3", "law:cma:4"], answerRaw: raw, finish: "length" });
  expect("still answered (200), not a model error", status === 200, JSON.stringify(a).slice(0, 160));
  expect("complete first sentence kept", /\$5,000 fine or 2 years' jail, or both/.test(a.shortAnswer), a.shortAnswer);
  expect("dangling 'or b' fragment dropped", !/or b\b/.test(a.shortAnswer) && !/10 years/.test(a.shortAnswer), a.shortAnswer);
  expect("cut-off fields fall back to defaults", /depends on the full facts/.test(a.howItApplies) && a.depends.length === 1, JSON.stringify([a.howItApplies, a.depends]));
}
{
  console.log("21. Reply ending without a full stop (not flagged as cut): fragment dropped, rest kept");
  const { a } = await run(SEARCH({ ids: ["law:cpc:78"], shortAnswer: `${plain(S78_1)} ${plain(S78_1A)} The officer may also take any article used by a pers`,
    howItApplies: "The rule on searching an arrested person covers this. It also covers questions tending t", depends: ["Whether you were arrested."] }));
  expect("both complete s78 sentences kept", a.shortAnswer.includes(noTag(S78_1)) && a.shortAnswer.includes(noTag(S78_1A)), a.shortAnswer);
  expect("'used by a pers' fragment dropped", !/used by a pers/.test(a.shortAnswer));
  expect("'questions tending t' dropped from how-it-applies, complete sentence kept", a.howItApplies === "The rule on searching an arrested person covers this.", a.howItApplies);
  expect("bullet kept whole", a.depends[0] === "Whether you were arrested.");
}
{
  console.log("22. Cut inside the bullets: complete bullets kept, the half bullet left out");
  const raw = `{"ids":["law:cma:3"],"shortAnswer":"${plain(HACK3)}",` +
    '"howItApplies":"The rule on unauthorised access covers someone getting into an account without permission.","depends":["Whether the access was knowing.","Whether it was meant to commit another off';
  const { a } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3"], answerRaw: raw, finish: "length" });
  expect("short answer and how-it-applies whole", /or both\.$/.test(a.shortAnswer) && /without permission\.$/.test(a.howItApplies), a.shortAnswer);
  expect("only the complete bullet kept", a.depends.length === 1 && a.depends[0] === "Whether the access was knowing.", JSON.stringify(a.depends));
}
{
  console.log("23. Hacking stand-in: every complete sentence kept, basic offence first");
  const { a } = await run({ q: "Someone hacked into my email account", kw: { keywords: ["unauthorised access"], codes: ["cma"] }, ideal: ["law:cma:3", "law:cma:4"],
    answer: { ids: ["law:cma:4", "law:cma:3"], shortAnswer: `${HACK4} ${HACK3}`, howItApplies: "The rule on unauthorised access covers this.", depends: ["Whether it was knowing."] } });
  expect("both sentences kept", [HACK3, HACK4].every((x) => a.shortAnswer.includes(noTag(x))), a.shortAnswer);
  expect("basic offence (section 3) first although the model put it second", a.shortAnswer.startsWith("Getting into a computer"), a.shortAnswer.slice(0, 60));
  expect("no 'details left out' note when nothing was dropped", a.figuresNote === null, a.figuresNote);
}
{
  console.log("24. Personal search answered before a secondary place-search power");
  const S33 = "Police may also enter and search a place a wanted person has entered, if they believe the person is inside [[law:cpc:33]].";
  const { a } = await run({ ...SEARCH({ ids: ["law:cpc:33", "law:cpc:78"], shortAnswer: `${S33} ${S78_1} ${S78_1A}`, howItApplies: "The rule on searching an arrested person covers this.", depends: [] }),
    ideal: ["law:cpc:33", "law:cpc:78"], extraHits: ["law:cpc:78", "law:cpc:33"] });
  expect("s78 sentences come first although the model put s33 first", /^If you are arrested and cannot get or pay bail/.test(a.shortAnswer), a.shortAnswer.slice(0, 80));
  expect("the 2-sentence limit then leaves out s33, never cutting a sentence", !/wanted person/.test(a.shortAnswer) && !!a.figuresNote);
  expect("footnote lists s78 first", src(a).startsWith("Criminal section 78"), src(a));
}
{
  console.log("25. Over-long short answers: more than 2 sentences or 45 words never get through");
  const third = "This also applies when a private person makes the arrest and hands you over [[law:cpc:78]].";
  let r = await run(SEARCH({ ids: ["law:cpc:78"], shortAnswer: `${plain(S78_1)} ${plain(S78_1A)} ${plain(third)}`, depends: [] }));
  expect("3 sentences -> 2 kept", sentencesIn(r.a.shortAnswer).length === 2, r.a.shortAnswer);
  // Both stand-ins pass every other filter, so only the word limit can remove them.
  const wordy40 = "If you are arrested by police under a warrant that does not allow bail, or you are arrested and you cannot get bail or cannot pay it, police may search you and keep the things you carry, except clothing.";
  r = await run(SEARCH({ ids: ["law:cpc:78"], shortAnswer: `${wordy40} ${plain(S78_1A)}`, depends: [] }));
  expect(`${wordsIn(wordy40)}-word sentence + 16-word sentence: second left out whole, first kept`, r.a.shortAnswer === wordy40 && !!r.a.figuresNote, `${wordsIn(r.a.shortAnswer)} words: ${r.a.shortAnswer}`);
  const wordy50 = wordy40.replace("except clothing.", "except the clothing that you need to wear, and they may do this whether or not you were arrested by them.");
  r = await run(SEARCH({ ids: ["law:cpc:78"], shortAnswer: wordy50, depends: [] }));
  expect(`a single ${wordsIn(wordy50)}-word sentence is left out whole, not cut`, !/clothing that you need/.test(r.a.shortAnswer) && /^LawyerLah found rules on/.test(r.a.shortAnswer), r.a.shortAnswer);
}
// ---------------------------------------------------------------- special-Act scope
const KNIFE = (answer) => ({ q: "Can police search me if they think I have a knife?", kw: { keywords: ["offensive weapon", "search without warrant"], codes: ["ceswoa", "cpc"] },
  ideal: ["law:ceswoa:9", "law:cpc:78"], extraHits: ["law:ceswoa:9"], answer });
{
  console.log("26. Special Act (ceswoa 9): the offence category is named, never a general police power");
  let r = await run(KNIFE({ ids: ["law:ceswoa:9"],
    shortAnswer: "For offences under this Act, police may search you without a warrant if they suspect you carry an offensive weapon. Police may stop and search you without a warrant if they suspect an offence.", depends: [] }));
  expect("'offences under this Act' becomes the offence category", /^For offences involving corrosive or explosive substances or offensive weapons, police may search you/.test(r.a.shortAnswer), r.a.shortAnswer);
  expect("sentence without the category (reads as a general power) dropped", !/suspect an offence/.test(r.a.shortAnswer));
  r = await run(KNIFE({ ids: ["law:ceswoa:9"],
    shortAnswer: "Under the Corrosive and Explosive Substances and Offensive Weapons Act, police may search you without a warrant if they suspect such an offence.", depends: [] }));
  expect("Act-name stripping keeps the restriction", /corrosive or explosive substances and offensive weapons/.test(r.a.shortAnswer) && !/Act\b/.test(r.a.shortAnswer), r.a.shortAnswer);
  r = await run(KNIFE({ ids: ["law:cpc:78", "law:ceswoa:9"],
    shortAnswer: `${S78_1} Police may search you without a warrant if they suspect an offence [[law:ceswoa:9]].`, depends: [] }));
  expect("tagged special-Act sentence without the category dropped; s78 kept", /cannot get or pay bail/.test(r.a.shortAnswer) && !/suspect an offence/.test(r.a.shortAnswer), r.a.shortAnswer);
  expect("selection prompt says a special-Act power is not a general police power", /is not a general police power/.test(r.AI.runs.find((x) => x.step === "select").params.messages[0].content));
}
{
  console.log("27. Poisons (new codes): pins, filtered query, Act names, rules labelled 'rule'");
  const { a, AI } = await run({ q: "Do I need a licence to sell poisons?", kw: { keywords: ["sale of poisons", "poisons licence"], codes: ["psn"] },
    ideal: ["law:psn:5", "law:psn:6"],
    answer: { ids: ["law:psn:5", "law:psn:6"], shortAnswer: "You may sell poisons only if you have a licence [[law:psn:5]]. A licence can be granted with conditions in it [[law:psn:6]].", depends: [] } });
  expect("psn 5, 6, 9, 19 pinned, in that order", AI.candidateIds.slice(0, 4).join(" ") === "law:psn:5 law:psn:6 law:psn:9 law:psn:19", AI.candidateIds.slice(0, 4).join(" "));
  expect("poisons filtered query (psn, psnr, psnvet, psnsanc)", VECTORIZE.calls.some((c) => c.filter === "psn,psnr,psnvet,psnsanc"), JSON.stringify(VECTORIZE.calls));
  const kwPrompt = AI.runs.find((x) => x.step === "keywords").params.messages[1].content;
  expect("keyword step lists all 4 new codes with names", ["psn: Poisons Act 1938", "psnr: Poisons Rules", "psnvet: Approved Qualifications for Veterinary Surgeons (Consolidation) Notification (Cap 234, N 2)", "psnsanc: Authority to Grant Sanctions to Prosecute (Cap 234, N 1)"].every((x) => kwPrompt.includes(x)));
  expect("poison sentence kept (names its category)", /sell poisons only if you have a licence \(section 5\)/.test(a.shortAnswer), a.shortAnswer);
  expect("psn sentence without 'poison' dropped", !/with conditions in it/.test(a.shortAnswer));
  const r2 = await run({ q: "How must poisons be labelled?", kw: { keywords: ["labelling of poisons"], codes: ["psnr"] }, ideal: ["law:psnr:4", "law:psn:5"], extraHits: ["law:psnr:4"],
    answer: { ids: ["law:psnr:4", "law:psn:5"], shortAnswer: "A poison container must show the name of the poison [[law:psnr:4]]. You may sell poisons only if you have a licence [[law:psn:5]].", depends: [] } });
  expect("Poisons Rules cited as 'rule 4' (tag and footnote)", /\(rule 4\)\./.test(r2.a.shortAnswer) && /Poisons rule 4/.test(src(r2.a)), `${r2.a.shortAnswer} | ${src(r2.a)}`);
}
{
  console.log("28. Every short answer in this run: at most 2 sentences and 45 words");
  expect(`all ${lengthChecked} short answers within the limit`, lengthViolations.length === 0, lengthViolations.join(" | "));
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
if (fails) process.exitCode = 1;
