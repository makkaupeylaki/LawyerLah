// lawyerlah frontend. Plain JS, no build step.

// The site and the API are served by the same Worker, so API calls are same-origin (/api/...).
const MAX = 500;
const TIMEOUT_MS = 30000;

const $ = (id) => document.getElementById(id);
const form = $("ask");
const q = $("q");
const submit = $("submit");
const count = $("count");
const askError = $("ask-error");
const loading = $("loading");
const notice = $("notice");
const answer = $("answer");
const retry = $("retry");
const offline = $("offline");

let lastQuestion = "";
let lastAnswer = null;
let busy = false;

// ------------------------------------------------------------ input
function updateCount() {
  count.textContent = `${q.value.length} / ${MAX}`;
  count.classList.toggle("near", q.value.length > MAX - 50);
}
q.addEventListener("input", () => { updateCount(); askError.hidden = true; });
updateCount();

// Enter submits on desktop; Shift+Enter for a new line.
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover)").matches) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// Example chips (top three and the topic lists) fill the box and ask.
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    q.value = chip.textContent.trim();
    updateCount();
    form.requestSubmit();
  });
});

// ------------------------------------------------------------ states
function show(el) {
  for (const x of [loading, notice, answer]) x.hidden = x !== el;
}

function showNotice(title, text, { warn = false, canRetry = false } = {}) {
  $("notice-title").textContent = title;
  $("notice-text").textContent = text;
  notice.classList.toggle("warn", warn);
  retry.hidden = !canRetry;
  show(notice);
}

function showAnswer(a) {
  lastAnswer = a;
  const demo = $("a-demo");
  demo.hidden = !a.demo;
  if (a.demo) $("a-demo-title").textContent = a.demoNotice || "DEMO DATA, not real law";

  $("a-short").textContent = a.shortAnswer || "";
  $("a-figures").textContent = a.figuresNote || "";
  $("a-figures").hidden = !a.figuresNote;
  $("a-how").textContent = a.howItApplies || "";
  $("a-how-block").hidden = !a.howItApplies;

  const depends = $("a-depends");
  depends.textContent = "";
  for (const d of Array.isArray(a.depends) ? a.depends : []) {
    const li = document.createElement("li");
    li.textContent = d;
    depends.append(li);
  }

  renderSources(Array.isArray(a.sources) ? a.sources : []);
  renderFurtherReading(a.furtherReading);

  renderRoutes(Array.isArray(a.routes) ? a.routes : []);

  for (const b of answer.querySelectorAll("[data-vote]")) {
    b.disabled = false;
    b.setAttribute("aria-pressed", "false");
  }
  $("fb-thanks").hidden = true;
  show(answer);
}

// Source footnote: "Source: Act, s N · sso.agc.gov.sg ↗" per matched section (no link for demo data).
function renderSources(sources) {
  const box = $("a-source");
  box.textContent = "";
  const link = (href, text) => {
    const el = document.createElement("a");
    el.href = href;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
    el.textContent = text;
    return el;
  };
  if (!sources.length) {
    const p = document.createElement("p");
    p.append("Source: no matching section. ", link("https://sso.agc.gov.sg/", "Search sso.agc.gov.sg ↗"));
    box.append(p);
    return;
  }
  for (const s of sources) {
    const p = document.createElement("p");
    const heading = s.heading || s.title;
    p.append(`Source: ${s.act}, ${s.label || `section ${s.section}`}${heading ? ` (${heading})` : ""}`);
    if (s.inForceFrom) p.append(` · version in force from ${s.inForceFrom}`);
    p.append(" · ");
    if (s.note) {
      // "Unofficial consolidation from SSO, check sso.agc.gov.sg for the official text": the domain is the link.
      const [before, after] = s.note.split("sso.agc.gov.sg");
      const url = s.sourceUrl && /^https:\/\/sso\.agc\.gov\.sg\//.test(s.sourceUrl) ? s.sourceUrl : "https://sso.agc.gov.sg/";
      p.append(before, link(url, "sso.agc.gov.sg ↗"), after || "");
    } else if (s.sourceUrl && /^https:\/\/sso\.agc\.gov\.sg\//.test(s.sourceUrl)) {
      p.append(link(s.sourceUrl, "sso.agc.gov.sg ↗"));
    } else {
      p.append("no link (demo data)");
    }
    box.append(p);
  }
}

// Further reading: a third-party article, link only, labelled as such.
function renderFurtherReading(fr) {
  const box = $("a-further");
  box.textContent = "";
  box.hidden = !(fr && /^https:\/\//.test(fr.url || ""));
  if (box.hidden) return;
  const a = document.createElement("a");
  a.href = fr.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer nofollow";
  a.textContent = `${fr.label} ↗`;
  const p = document.createElement("p");
  p.append("Further reading: ", a);
  const note = document.createElement("p");
  note.className = "further-note";
  note.textContent = fr.note || "Third-party law firm article.";
  box.append(p, note);
}

function renderRoutes(routes) {
  const list = $("a-routes");
  list.textContent = "";
  for (const r of routes) {
    const li = document.createElement("li");
    li.className = "route";
    const name = document.createElement(/^https:\/\//.test(r.url || "") ? "a" : "span");
    name.className = "route-name";
    name.textContent = r.name || "";
    if (name.tagName === "A") {
      name.href = r.url;
      name.target = "_blank";
      name.rel = "noopener noreferrer";
      name.textContent += " ↗";
    }
    li.append(name);
    for (const [label, text] of [["", r.what], ["Who it's for: ", r.eligibility], ["Limits: ", r.limits]]) {
      if (!text) continue;
      const p = document.createElement("p");
      if (label) {
        const b = document.createElement("span");
        b.className = "route-k";
        b.textContent = label;
        p.append(b);
      }
      p.append(text);
      li.append(p);
    }
    list.append(li);
  }
  $("a-routes-block").hidden = routes.length === 0;
}

function setOffline() {
  offline.hidden = navigator.onLine;
}
window.addEventListener("online", setOffline);
window.addEventListener("offline", setOffline);
setOffline();

// ------------------------------------------------------------ API
async function post(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(t);
  }
}

async function ask(question) {
  if (busy) return;
  if (!navigator.onLine) {
    showNotice("You're offline", "Check your connection, then try again.", { warn: true, canRetry: true });
    return;
  }
  busy = true;
  lastQuestion = question;
  submit.disabled = true;
  submit.textContent = "Asking…";
  show(loading);
  $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

  try {
    const { status, ok, data } = await post("/api/ask", { question });
    if (ok && data && "shortAnswer" in data) {
      showAnswer(data);
    } else if (status === 429 && data && data.error === "global_limit") {
      showNotice("That's all for today", data.message || "LawyerLah has answered all the questions it can for today. Please come back tomorrow.", { warn: true });
    } else if (status === 429) {
      showNotice("Daily limit reached", (data && data.message) || "You've used your 10 questions for today. Come back tomorrow.", { warn: true });
    } else if (status === 400) {
      show(null);
      askError.textContent = (data && data.message) || "Please check your question and try again.";
      askError.hidden = false;
      q.focus();
    } else {
      showNotice("Something went wrong", (data && data.message) || "Couldn't get an answer just now.", { warn: true, canRetry: true });
    }
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    showNotice(
      navigator.onLine ? (timedOut ? "That took too long" : "Couldn't reach lawyerlah") : "You're offline",
      navigator.onLine ? "Please try again in a moment." : "Check your connection, then try again.",
      { warn: true, canRetry: true }
    );
  } finally {
    busy = false;
    submit.disabled = false;
    submit.textContent = "Ask";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = q.value.replace(/\s+/g, " ").trim();
  if (!question) {
    askError.textContent = "Describe your situation in a few words first.";
    askError.hidden = false;
    q.focus();
    return;
  }
  if (question.length > MAX) {
    askError.textContent = `Keep it under ${MAX} characters.`;
    askError.hidden = false;
    return;
  }
  askError.hidden = true;
  ask(question);
});

retry.addEventListener("click", () => { if (lastQuestion) ask(lastQuestion); });

// ------------------------------------------------------------ feedback
for (const btn of answer.querySelectorAll("[data-vote]")) {
  btn.addEventListener("click", async () => {
    const buttons = answer.querySelectorAll("[data-vote]");
    buttons.forEach((b) => { b.disabled = true; });
    btn.setAttribute("aria-pressed", "true");
    const thanks = $("fb-thanks");
    try {
      const { ok } = await post("/api/feedback", {
        vote: btn.dataset.vote,
        question: lastQuestion,
        act: lastAnswer && (lastAnswer.sources || []).map((s) => s.act).join("; "),
        section: lastAnswer && (lastAnswer.sources || []).map((s) => s.section).join("; "),
      });
      thanks.textContent = ok ? "Thanks, noted." : "Couldn't send that. Please try again later.";
      if (!ok) { buttons.forEach((b) => { b.disabled = false; }); btn.setAttribute("aria-pressed", "false"); }
    } catch {
      thanks.textContent = "Couldn't send that. Check your connection.";
      buttons.forEach((b) => { b.disabled = false; });
      btn.setAttribute("aria-pressed", "false");
    }
    thanks.hidden = false;
  });
}
