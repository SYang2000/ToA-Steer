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

  // ---------- demo: real Qwen3-8B runs at three steering strengths (data in demo_data.js) ----------
  const DEMO = window.TOA_DEMO || [];
  const BENCH = { math: "MATH", aime: "AIME", mmlu_pro: "MMLU-Pro" };
  const isMath = b => b === "math" || b === "aime";
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MINUS = "−";
  // the three runs are shown as m = -150 / 0 / +150
  const mText = m => (m > 0 ? "+150" : m < 0 ? MINUS + "150" : "0");
  const side = m => (m > 0 ? "act" : m < 0 ? "think" : "base");
  // keep the last ~n characters, starting at a line break so no formula is cut in half
  const tail = (t, n) => {
    if (t.length <= n) return t;
    const k = t.indexOf("\n", t.length - n);
    let out = t.slice(k < 0 ? t.length - n : k + 1);
    // the cut must not leave half of a display-math block behind
    if ((out.match(/\$\$/g) || []).length % 2) out = out.slice(out.indexOf("$$") + 2);
    const close = out.indexOf("\\]"), open = out.indexOf("\\[");
    if (close >= 0 && (open < 0 || close < open)) out = out.slice(close + 2);
    return "…\n" + out.replace(/^\s+/, "");
  };
  const fmt = t => esc(t).replace(/\[asy\][\s\S]*?\[\/asy\]/g, "")
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>").replace(/^\s*-{3,}\s*$/gm, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n\s*\n+/g, "\n").replace(/\n*(\$\$|\\\[)/g, "$1").replace(/(\$\$|\\\])\n*/g, "$1").trim();
  // the question itself, without the boilerplate every prompt of a benchmark shares
  const question = D => D.prompt.replace(/^Problem:\s*/, "").replace(/\s*\[asy\][\s\S]*?\[\/asy\]\s*/, "@@FIG@@")
    .replace(/^The following is a multiple choice question[^\n]*\n+/, "").replace(/^Question:\s*/m, "")
    .replace(/\n*Answer: Let's think step by step\.\s*$/, "")
    .replace(/\n*Solve the problem step by step\.[^\n]*$/, "").replace(/\n*The answer is an integer between[^\n]*/, "")
    .replace(/of(Caesium)/g, "of $1").replace(/Caesium(atoms|and)/g, "Caesium $1").replace(/ m - s\^-1/g, " m s\u207b\u00b9");
  const FIGURES = { "math::4173": `<img class="dm-fig" src="static/images/demo_math_diagram.png" alt="Triangle PQR with S on PR, QS perpendicular to PR, angle QRP marked 65 degrees and angle PQS marked x degrees">` };
  // a run cut off by the token budget can end inside a formula: drop the unclosed tail so the rest renders
  const closeMath = t => {
    if ((t.match(/\$\$/g) || []).length % 2) t = t.slice(0, t.lastIndexOf("$$"));
    const single = t.replace(/\$\$/g, "").match(/\$/g) || [];
    if (single.length % 2) { const k = t.lastIndexOf("$"); t = t.slice(0, k); }
    return t;
  };
  const ans = (t, b) => (!t ? "no answer" : isMath(b) ? `\\(${esc(t)}\\)` : esc(t));
  const typeset = node => { if (window.renderMathInElement) renderMathInElement(node, { throwOnError: false, delimiters: [
    { left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }] }); };
  const mark = ok => `<span class="dm-mark ${ok ? "ok" : "no"}" aria-label="${ok ? "correct" : "wrong"}">${ok ? "✓" : "✗"}</span>`;
  const cutOff = r => (r.steps[r.steps.length - 1].status || "").includes("token");
  const how = r => (r.called_tool ? `${r.n_calls} tool call${r.n_calls > 1 ? "s" : ""}` : "answered directly") + (cutOff(r) ? ", ran out of tokens" : "");
  const helps = D => { const g = D.runs.find(r => r.correct && r.m !== 0); return g && g.m > 0 ? "act" : "think"; };

  function stepHtml(st, bench) {
    if (st.kind === "think") return `<details class="dm-think"><summary>Thought for ${st.tokens.toLocaleString()} tokens</summary><div class="dm-full">${esc(st.text)}</div></details>`;
    if (st.kind === "text") return `<div class="dm-text mathy">${fmt(tail(st.text, 600))}</div>`;
    if (st.kind === "call") {
      const arg = st.args.code ?? st.args.query ?? JSON.stringify(st.args, null, 1);
      return `<figure class="dm-tool"><figcaption>${esc(st.name)}</figcaption><pre class="dm-code">${esc(arg)}</pre><pre class="dm-res">${esc(tail(st.result, 800))}</pre></figure>`;
    }
    const cut = (st.status || "").includes("token");
    return `<div class="dm-final"><div class="dm-text mathy">${fmt(tail(closeMath(st.text), 500))}${cut ? " \u2026" : ""}</div>${cut ? `<p class="dm-cut">Output cut off: the model ran out of its token budget before giving an answer.</p>` : ""}</div>`;
  }

  function column(run, bench, title) {
    return `<section class="dm-col ${side(run.m)}">
      <header><div><h4>${title}</h4><p>${how(run)}</p></div>
        <div class="dm-out"><span class="mathy">${ans(run.extracted, bench)}</span>${mark(run.correct)}</div></header>
      <div class="dm-steps">${run.steps.map(st => stepHtml(st, bench)).join("")}</div></section>`;
  }

  let cur = null;
  const picker = document.getElementById("dm-picker");
  DEMO.forEach((D, i) => {
    const b = el("button", i === 0 ? "on" : "", `<b>${BENCH[D.bench]}</b><span class="dm-tag ${helps(D)}">${helps(D) === "act" ? "tool helps" : "tool hurts"}</span>`);
    b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", i === 0);
    b.addEventListener("click", () => {
      picker.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
      showProblem(D);
    });
    picker.appendChild(b);
  });

  function showProblem(D) {
    cur = D;
    const q = document.getElementById("dm-q"); q.innerHTML = fmt(question(D)).replace("@@FIG@@", FIGURES[D.id] || ""); typeset(q);
    const gt = document.getElementById("dm-gt"); gt.innerHTML = ans(String(D.ground_truth), D.bench); typeset(gt);
    const stops = document.getElementById("dm-stops");
    stops.innerHTML = D.runs.map((r, i) => `<button type="button" role="tab" class="dm-stop ${side(r.m)}" data-i="${i}">
        <span class="dm-m">${mText(r.m)}</span>
        <span class="dm-res-line">${mark(r.correct)}<span class="mathy">${ans(r.extracted, D.bench)}</span></span>
        <span class="dm-how">${r.called_tool ? "tool" : "no tool"}</span></button>`).join("");
    typeset(stops);
    stops.querySelectorAll(".dm-stop").forEach(b => b.addEventListener("click", () => showRun(+b.dataset.i)));
    document.getElementById("dm-note").textContent = `Qwen3-8B, greedy decoding. This problem was selected from ${D.n_screened} screened ${BENCH[D.bench]} problems as one where steering changes both tool use and the outcome; on any single problem the outcome also depends on generation noise.`;
    const good = D.runs.findIndex(r => r.correct && r.m !== 0);
    showRun(good >= 0 ? good : 1);
  }

  function showRun(i) {
    const r = cur.runs[i], base = cur.runs.find(x => x.m === 0);
    document.querySelectorAll(".dm-stop").forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-selected", k === i); });
    const knob = document.getElementById("dm-knob");
    knob.style.left = (r.m > 0 ? 100 : r.m < 0 ? 0 : 50) + "%";
    knob.className = side(r.m);
    const what = run => `${run.called_tool ? "calls a tool" : "answers directly"} and <span class="dm-hl ${run.correct ? "ok" : "no"}">is ${run.correct ? "right" : "wrong"}</span>`;
    document.getElementById("dm-caption").innerHTML = r.m === 0
      ? `Without steering, the model ${what(r)}.`
      : `Steered toward ${r.m > 0 ? "ACT" : "THINK"}, the model ${what(r)}. Without steering, it ${what(base)}.`;
    const box = document.getElementById("dm-compare");
    box.classList.toggle("single", r.m === 0);
    box.innerHTML = column(base, cur.bench, "No steering, <i>m</i> = 0") +
      (r.m === 0 ? "" : column(r, cur.bench, `Steered toward ${r.m > 0 ? "ACT" : "THINK"}, <i>m</i> = ${mText(r.m)}`));
    box.querySelectorAll(".mathy").forEach(typeset);
  }
  if (DEMO.length) showProblem(DEMO[0]);

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
  if (document.readyState === "complete") renderMath(); else window.addEventListener("load", renderMath);
})();
