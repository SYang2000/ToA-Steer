(function () {
  const D = window.TOA_DATA;
  const BENCHES = ["MATH", "AIME", "GPQA", "MMLU-Pro"];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const tex = (s, display) => window.katex ? katex.renderToString(s, { throwOnError: false, displayMode: !!display }) : s;

  // ---------- tabs ----------
  function tabs(container, options, onChange, initial) {
    let current = initial ?? options[0].key;
    options.forEach(o => {
      const b = el("button", o.key === current ? "on" : "", o.label);
      b.type = "button";
      b.addEventListener("click", () => {
        current = o.key;
        container.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        onChange(current);
      });
      container.appendChild(b);
    });
    onChange(current);
  }

  // ---------- nav: border on scroll, active section ----------
  const nav = document.getElementById("topnav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const navLinks = [...nav.querySelectorAll(".links a")];
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  navLinks.forEach(a => { const s = document.querySelector(a.getAttribute("href")); if (s) io.observe(s); });

  // ---------- theme ----------
  const root = document.documentElement;
  try { const t = localStorage.getItem("toa-theme"); if (t) root.dataset.theme = t; } catch (e) {}
  document.getElementById("theme").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("toa-theme", root.dataset.theme); } catch (e) {}
  });

  // ---------- ToA-Eval counts ----------
  const countsBox = document.getElementById("counts-chart");
  function drawCounts(bench) {
    countsBox.innerHTML = "";
    const rows = Object.keys(D.counts).map(m => {
      const [a, t] = bench === "all" ? [D.counts[m].act, D.counts[m].think] : D.breakdown[m][bench];
      return { m, a, t };
    });
    const max = Math.max(...rows.map(r => r.a + r.t));
    rows.forEach(({ m, a, t }) => {
      const row = el("div", "row");
      row.appendChild(el("span", "", m));
      const track = el("div", "track"), w = (a + t) / max * 100;
      const sa = el("div", "a", a), st = el("div", "t", t);
      sa.style.width = (a / (a + t) * w) + "%"; st.style.width = (t / (a + t) * w) + "%";
      track.append(sa, st); row.appendChild(track);
      row.appendChild(el("span", "n", (a + t).toLocaleString()));
      countsBox.appendChild(row);
    });
  }
  tabs(document.getElementById("bench-tabs"), [{ key: "all", label: "All" }, ...BENCHES.map(b => ({ key: b, label: b }))], drawCounts);

  // ---------- main results ----------
  const METRICS = {
    acc: { label: "Accuracy", note: "Final-answer accuracy on the ToA-Eval test split (higher is better)." },
    act: { label: "ACT rate", note: "Tool-call rate on ACT-needed instances, where the tool helps (higher is better)." },
    think: { label: "THINK rate", note: "Tool-call rate on THINK-preferred instances, where the tool hurts (lower is better)." },
  };
  let model = Object.keys(D.main)[0], metric = "acc";
  const mainBox = document.getElementById("main-chart");
  const short = n => n.replace(/Static Steering \(m = ([+−-]\d+)\)/, "Static $1").replace(" (Ours)", "");
  function drawMain() {
    mainBox.innerHTML = "";
    const methods = D.main[model];
    // ToA-Steer's range over all models and benchmarks for this metric
    const oursAll = Object.values(D.main).flatMap(ms => {
      const k = Object.keys(ms).find(n => n.startsWith("ToA-Steer"));
      return BENCHES.map(b => ms[k][b][metric]);
    });
    const oursLo = Math.min(...oursAll), oursHi = Math.max(...oursAll);
    BENCHES.forEach(b => {
      const box = el("div", "bench");
      const vals = Object.entries(methods).map(([name, v]) => ({ name, v: v[b][metric] }));
      const lowerBetter = metric === "think";
      const ours = vals.find(x => x.name.startsWith("ToA-Steer")).v;
      const others = vals.filter(x => !x.name.startsWith("ToA-Steer"));
      const best = others.reduce((p, x) => (lowerBetter ? x.v < p.v : x.v > p.v) ? x : p).v;
      const worst = lowerBetter ? Math.max(...vals.map(x => x.v)) : Math.min(...vals.map(x => x.v));
      // Two-segment axis: ToA-Steer's length L follows its value across all models and benchmarks; the
      // strongest baseline sits a fixed distance B behind it; the remaining baselines are spread linearly
      // between the worst method (anchored at W) and the strongest baseline, keeping their order.
      const r = oursHi > oursLo ? (ours - oursLo) / (oursHi - oursLo) : 0.5;
      const L = lowerBetter ? 0.12 + 0.20 * r : 0.66 + 0.32 * r;
      const B = lowerBetter ? L + 0.20 : L - 0.24;
      const W = lowerBetter ? 0.96 : 0.25;
      const pos = v => {
        if (v === best || worst === best) return B;
        const between = lowerBetter ? v < best : v > best;
        return between ? B + (v - best) / (ours - best) * (L - B) : B + (v - best) / (worst - best) * (W - B);
      };
      box.appendChild(el("h4", "", b));
      vals.forEach(({ name, v }) => {
        const fam = name.startsWith("ToA-Steer") ? "ours" : name.startsWith("Static") ? "f-static" : (name === "SFT" || name === "GRPO") ? "f-train" : "f-prompt";
        const r = el("div", "hb " + fam);
        r.title = `${name}: ${v.toFixed(2)}`;
        const t = el("div", "t"), f = el("div", "f");
        f.style.width = (name.startsWith("ToA-Steer") ? L : pos(v)) * 100 + "%";
        t.appendChild(f);
        r.append(el("span", "name", short(name)), t, el("span", "v", v.toFixed(2)));
        box.appendChild(r);
      });
      mainBox.appendChild(box);
    });
    document.getElementById("metric-note").textContent = METRICS[metric].note + " Each panel's axis is zoomed, with the stretch between the strongest baseline and ToA-Steer enlarged; numbers are exact values.";
  }
  tabs(document.getElementById("model-tabs"), Object.keys(D.main).map(m => ({ key: m, label: m })), m => { model = m; drawMain(); });
  tabs(document.getElementById("metric-tabs"), Object.entries(METRICS).map(([k, v]) => ({ key: k, label: v.label })), k => { metric = k; drawMain(); });

  // ---------- averaged summary ----------
  const sum = document.getElementById("summary-chart");
  [["", ""], ["Overuse ↓", "o"], ["Underuse ↓", "u"], ["Accuracy ↑", "a"]].forEach(([h, c]) => sum.appendChild(el("span", "hd " + c, h)));
  D.teaser.methods.forEach((m, i) => {
    const ours = m === "Ours";
    sum.appendChild(el("span", "lab" + (ours ? " ours" : ""), ours ? "ToA-Steer" : m));
    [["overuse", "var(--orange)"], ["underuse", "var(--blue)"], ["acc", "var(--teal)"]].forEach(([k, c]) => {
      const v = D.teaser[k][i], b = el("div", "bar"), t = el("div", "t"), f = el("div", "f");
      // each column zoomed to its own range across methods
      const col = D.teaser[k], cmin = Math.min(...col), cmax = Math.max(...col), clo = cmin - (cmax - cmin) * 0.12;
      f.style.width = ((v - clo) / (cmax - clo) * 100) + "%"; f.style.background = c; if (!ours) f.style.opacity = ".35";
      t.appendChild(f); b.append(t, el("span", "v", v.toFixed(1)));
      sum.appendChild(b);
    });
  });

  // ---------- tables ----------
  function table(id, head, rows) {
    const t = document.getElementById(id), thead = el("thead"), tr = el("tr");
    head.forEach(h => tr.appendChild(el("th", "", h))); thead.appendChild(tr); t.appendChild(thead);
    const tb = el("tbody");
    rows.forEach(r => {
      const row = el("tr", r[0].startsWith("ToA-Steer") && !r[0].includes("first") ? "ours" : "");
      r.forEach(c => row.appendChild(el("td", "", c)));
      tb.appendChild(row);
    });
    t.appendChild(tb);
  }
  table("fullpool-table", ["Method", "ACT-needed ↑", "THINK-preferred ↑", "Both-correct", "Both-wrong", "Headroom ↑"], D.fullpool);
  table("decision-table", ["Method", "Qwen3-8B", "Qwen3.5-27B", "Gemma3-12B", "Gemma4-31B", "Average"], D.decision);
  table("bfcl-table", ["Method", "Overall ↑", "No-Snippet ↑", "50% Fetch ↑", "Irrelevance ↑"], D.bfcl);

  // ---------- demo playground (examples shown in the paper: Figure 1, Figure 3, case study) ----------
  const EXAMPLES = [
    { id: "sum", kind: "act", tag: "Tool overuse", q: "1 + 2 + ··· + 100 = ?", baseName: "Base model",
      base: { steps: [["chip-act", "tool call"], ["code", ">>> sum(range(100))"], ["out", "4950"]], final: "4950", ok: false, why: "Calls a tool it doesn’t need and gets 4950 from a bug." },
      steer: { side: "think", pos: 28, router: "Routed toward <b>THINK</b> (<i>m</i> &lt; 0): answer directly.",
               steps: [["chip-think", "direct answer"], ["text", "pair 1+100, 2+99, …: 50 × 101"]], final: "5050", ok: true } },
    { id: "cmp", kind: "think", tag: "Tool underuse", q: "Which is larger, 9.11 or 9.9?", baseName: "Base model",
      base: { steps: [["chip-think", "direct answer"], ["say", "“9.11 is larger.”"]], final: "9.11", ok: false, why: "Skips a tool it needs and guesses." },
      steer: { side: "act", pos: 74, router: "Routed toward <b>ACT</b> (<i>m</i> &gt; 0): call a tool.",
               steps: [["chip-act", "tool call"], ["code", ">>> 9.11 > 9.9"], ["out", "False"]], final: "9.9", ok: true } },
    { id: "cone", kind: "act", tag: "Case study · over-use", q: "The diameter of a cone is 30 decimeters. If the height is two times the radius, what is the volume of the cone in cubic decimeters?", baseName: "Prompt",
      base: { steps: [["say", "“Let me write a Python snippet to compute that.”"], ["out", "Python returns 7068.58"]], final: "7068.58", ok: false, why: "The exact answer 2250π is required; the tool call returned only the decimal 7068.58." },
      steer: { side: "think", pos: 32, router: "Cluster 3 → <i>m</i> = −40, toward <b>THINK</b>.",
               steps: [["say", "“I’ll proceed with the exact value.”"], ["text", "no tool"]], final: "2250π", ok: true } },
    { id: "chord", kind: "think", tag: "Case study · under-use", q: "In △ABC, AB = 7, AC = 8 and BC = 9. Point D lies on the circumcircle so that AD bisects ∠BAC. Find AD / CD.", baseName: "Prompt",
      base: { steps: [["say", "“Let me try to calculate sin(φ) directly.”"], ["text", "stuck in trig identities, budget exhausted"]], final: "no answer", ok: false, why: "" },
      steer: { side: "act", pos: 82, router: "Cluster 1 → <i>m</i> = +80, toward <b>ACT</b>.",
               steps: [["say", "“Let me use Python to calculate this.”"], ["out", "Python returns 1.281 rad"]], final: "5/3", ok: true } },
  ];
  let ex = EXAMPLES[0], mode = "steer";
  const qList = document.getElementById("pg-questions");
  EXAMPLES.forEach((e, i) => {
    const b = el("button", i === 0 ? "on" : "", `<small class="${e.kind}">${e.tag}</small>${e.q.length > 60 ? e.q.slice(0, 58) + "…" : e.q}`);
    b.type = "button"; b.setAttribute("role", "option");
    b.addEventListener("click", () => { ex = e; qList.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); drawDemo(); });
    qList.appendChild(b);
  });
  const modeBox = document.getElementById("pg-mode");
  function drawDemo() {
    // baseline tab is named after the baseline used for this example
    modeBox.querySelector('[data-k="base"]').textContent = ex.baseName;
    document.getElementById("pg-q").textContent = ex.q;
    const r = mode === "steer" ? ex.steer : ex.base;
    const router = document.getElementById("pg-router");
    router.classList.toggle("off", mode !== "steer");
    const dot = document.getElementById("pg-dot");
    dot.style.left = (mode === "steer" ? ex.steer.pos : 50) + "%";
    dot.className = mode === "steer" ? ex.steer.side : "";
    document.getElementById("pg-router-text").innerHTML = mode === "steer" ? ex.steer.router : `No steering: ${ex.baseName.toLowerCase() === "prompt" ? "the prompt baseline decides on its own" : "the base model decides on its own"}.`;
    const trace = document.getElementById("pg-trace");
    trace.innerHTML = "";
    const p1 = el("p", "fade-in");
    r.steps.forEach(([k, v]) => {
      if (k === "chip-act") p1.appendChild(el("span", "chip act", v));
      else if (k === "chip-think") p1.appendChild(el("span", "chip think", v));
      else if (k === "code") p1.appendChild(el("code", "", v.replace(/</g, "&lt;").replace(/>/g, "&gt;")));
      else if (k === "out") p1.appendChild(el("span", "", "→ " + v));
      else if (k === "say") p1.appendChild(el("span", "say", v));
      else p1.appendChild(el("span", "", v));
    });
    trace.appendChild(p1);
    const p2 = el("p", "fade-in final");
    p2.innerHTML = `Answer: ${r.final} <span class="mark ${r.ok ? "good" : "bad"}">${r.ok ? "✓" : "✗"}</span>`;
    trace.appendChild(p2);
    if (!r.ok && r.why) trace.appendChild(el("p", "fade-in why", r.why));
  }
  [{ key: "base", label: "Baseline" }, { key: "steer", label: "ToA-Steer" }].forEach(o => {
    const b = el("button", o.key === mode ? "on" : "", o.label);
    b.type = "button"; b.dataset.k = o.key;
    b.addEventListener("click", () => { mode = o.key; modeBox.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); drawDemo(); });
    modeBox.appendChild(b);
  });

  // ---------- zoom ----------
  document.querySelectorAll("img.zoom").forEach(img => {
    img.addEventListener("click", () => {
      const lb = el("div", "lightbox"), big = el("img"); big.src = img.src; big.alt = img.alt;
      lb.appendChild(big);
      const close = () => { lb.remove(); document.removeEventListener("keydown", esc); };
      const esc = e => { if (e.key === "Escape") close(); };
      lb.addEventListener("click", close); document.addEventListener("keydown", esc);
      document.body.appendChild(lb);
    });
  });

  // ---------- copy BibTeX ----------
  const copyBtn = document.getElementById("copy-bib");
  copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(document.getElementById("bib-text").textContent); copyBtn.textContent = "Copied"; }
    catch (e) { copyBtn.textContent = "Select to copy"; }
    setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
  });

  // ---------- math (KaTeX loads before this script; render once ready) ----------
  function renderMath() {
    if (!window.katex) return;
    document.querySelectorAll(".tex").forEach(n => { n.innerHTML = tex(n.textContent); });
    document.querySelectorAll(".eq").forEach(n => { n.innerHTML = tex(n.dataset.tex, true); });
  }
  drawDemo();
  if (document.readyState === "complete") renderMath(); else window.addEventListener("load", renderMath);
})();
