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
  // the three runs are shown as m = -150 / 0 / +150
  const mLabel = m => (m > 0 ? "+150" : m < 0 ? "−150" : "0");
  const mDir = m => (m > 0 ? "toward ACT" : m < 0 ? "toward THINK" : "no steering");
  // keep the last ~n characters, starting at a line break so no formula is cut in half
  const tail = (t, n) => { if (t.length <= n) return t; const k = t.indexOf("\n", t.length - n); return "…\n" + t.slice(k < 0 ? t.length - n : k + 1); };
  const fmt = t => esc(t).replace(/\[asy\][\s\S]*?\[\/asy\]/g, "<span class=\"pg-asy\">[diagram]</span>")
    .replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>").replace(/^\s*-{3,}\s*$/gm, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n\s*\n+/g, "\n").replace(/\n*(\$\$|\\\[)/g, "$1").replace(/(\$\$|\\\])\n*/g, "$1");
  const ansHtml = (t, b) => (!t ? "no answer" : isMath(b) ? `\\(${esc(t)}\\)` : esc(t));
  const typeset = node => { if (window.renderMathInElement) renderMathInElement(node, { throwOnError: false, delimiters: [
    { left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false }] }); };
  const toolChip = r => (r.called_tool ? `<span class="chip act">tool call ×${r.n_calls}</span>` : `<span class="chip think">direct answer</span>`);
  const okMark = r => `<span class="mark ${r.correct ? "good" : "bad"}">${r.correct ? "✓" : "✗"}</span>`;
  // which way steering helps on this problem: the correct steered run
  const helps = D => { const good = D.runs.find(r => r.correct && r.m !== 0); return good && good.m > 0 ? "act" : "think"; };

  function stepHtml(st, bench) {
    if (st.kind === "think") return `<details class="pg-think"><summary><span class="pg-step-t">Thinking · ${st.tokens.toLocaleString()} tokens</span>
      <span class="pg-prev">${esc(st.text.slice(0, 240))}</span><span class="pg-more">Show full text</span></summary><div class="pg-full">${esc(st.text)}</div></details>`;
    if (st.kind === "text") return `<div class="pg-step"><span class="pg-step-t">Output</span><div class="pg-out mathy">${fmt(tail(st.text, 600))}</div></div>`;
    if (st.kind === "call") {
      const arg = st.args.code ?? st.args.query ?? JSON.stringify(st.args, null, 1);
      return `<div class="pg-step call"><span class="pg-step-t"><span class="chip act">tool call</span> ${esc(st.name)}</span><pre>${esc(arg)}</pre>
        <span class="pg-step-t">Tool output</span><pre class="res">${esc(tail(st.result, 800))}</pre></div>`;
    }
    return `<div class="pg-step final"><span class="pg-step-t">Final answer</span><div class="pg-out mathy">${fmt(tail(st.text, 500))}</div>
      <p class="pg-answer mathy">Extracted answer: <b>${ansHtml(st.extracted, bench)}</b>${okMark(st)}</p></div>`;
  }

  let cur = DEMO[0], sel = 0;
  const qList = document.getElementById("pg-questions");
  DEMO.forEach((D, i) => {
    const kind = helps(D);
    const first = D.prompt.replace(/^Problem:\s*/, "").replace(/^The following is a multiple choice question[^\n]*\n+(Question:\s*)?/, "");
    const b = el("button", i === 0 ? "on" : "", `<small class="${kind}">${BENCH[D.bench]} · ${kind === "act" ? "tool helps" : "tool hurts"}</small><span class="mathy">${esc(first.split("\n")[0].slice(0, 90))}${first.length > 90 ? "…" : ""}</span>`);
    b.type = "button"; b.setAttribute("role", "option");
    b.addEventListener("click", () => { qList.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); showProblem(D); });
    qList.appendChild(b);
  });
  typeset(qList);

  function showProblem(D) {
    cur = D;
    document.getElementById("pg-bench").textContent = `${BENCH[D.bench]} · ${D.id.split("::")[1] ? "problem " + D.id.split("::")[1] : D.id}`;
    const prob = document.getElementById("pg-problem");
    prob.innerHTML = fmt(D.prompt); typeset(prob);
    const gt = document.getElementById("pg-gt");
    gt.innerHTML = `Ground truth: <b>${ansHtml(String(D.ground_truth), D.bench)}</b>`; typeset(gt);
    const runs = document.getElementById("pg-runs");
    runs.innerHTML = D.runs.map((r, i) => `<button type="button" role="tab" class="pg-run" data-i="${i}">
        <span class="pg-run-m">m = ${mLabel(r.m)}</span><span class="pg-run-d">${mDir(r.m)}</span>
        <span class="pg-run-row">${toolChip(r)}${okMark(r)}</span>
        <span class="pg-run-a mathy">Answer: ${ansHtml(r.extracted, D.bench)}</span></button>`).join("");
    typeset(runs);
    runs.querySelectorAll(".pg-run").forEach(b => b.addEventListener("click", () => showRun(+b.dataset.i)));
    document.getElementById("pg-note").textContent = `Qwen3-8B, greedy decoding. This ${BENCH[D.bench]} problem was selected from ${D.n_screened} screened problems as one where steering changes both tool use and the outcome; on a single problem the outcome also depends on generation noise, so the effect on accuracy is measured over many problems in the paper.`;
    // open on the steered run that gets the problem right
    const good = D.runs.findIndex(r => r.correct && r.m !== 0);
    showRun(good >= 0 ? good : 1);
  }

  function showRun(i) {
    sel = i;
    const r = cur.runs[i], base = cur.runs.find(x => x.m === 0);
    document.querySelectorAll(".pg-run").forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-selected", k === i); });
    const dot = document.getElementById("pg-dot");
    dot.style.left = (r.m > 0 ? 88 : r.m < 0 ? 12 : 50) + "%";
    dot.className = r.m > 0 ? "act" : r.m < 0 ? "think" : "";
    const what = run => `${run.called_tool ? "calls a tool" : "answers directly"} and ${run.correct ? "gets it right" : "gets it wrong"}`;
    document.getElementById("pg-router-text").innerHTML = r.m === 0
      ? `No steering (<i>m</i> = 0): the model ${what(r)}.`
      : `Steered ${mDir(r.m)} (<i>m</i> = ${mLabel(r.m)}): the model ${what(r)}; without steering it ${what(base)}.`;
    const trace = document.getElementById("pg-trace");
    trace.innerHTML = r.steps.map(st => stepHtml(st, cur.bench)).join("");
    trace.querySelectorAll(".mathy").forEach(typeset);
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
  drawDemo();
  if (document.readyState === "complete") renderMath(); else window.addEventListener("load", renderMath);
})();
