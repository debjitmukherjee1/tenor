/* Tenor — app.js
   Reads data/tenor.json (written daily by pipeline/run.py) and renders the
   curve, slope/inversion history, real yields and credit spreads. */
(function () {
  "use strict";

  var D = null;            // the dataset
  var idx = 0;             // selected curve index
  var charts = {};
  var built = {};
  var ranges = { spreads: "10Y", real: "5Y" };
  var playing = null;

  var C = {
    s1: "#f3f3f1", s2: "#8f7dff", s3: "#1fd8c4", s4: "#f2c14e", s5: "#ff6a4a",
    mute: "#8f9199", grid: "rgba(255,255,255,.06)", bearFill: "rgba(255,106,74,.16)"
  };
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // ---------- helpers --------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function ti(t) { return D.tenors.indexOf(t); }
  function y(i, t) { var r = D.curve[i]; return r ? r[ti(t)] : null; }
  function bp(a, b) { return a == null || b == null ? null : Math.round((a - b) * 100); }
  function fmtPct(v, d) { return v == null ? "—" : v.toFixed(d == null ? 2 : d) + "%"; }
  function fmtBp(v, signed) {
    if (v == null || isNaN(v)) return "—";
    var s = Math.round(v);
    return (signed && s > 0 ? "+" : s < 0 ? "−" : "") + Math.abs(s);
  }
  function cls(v) { return v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "flat"; }
  function niceDate(iso) {
    var p = iso.split("-");
    return +p[2] + " " + MON[+p[1] - 1] + " " + p[0];
  }
  function shortDate(iso) { var p = iso.split("-"); return MON[+p[1] - 1] + " " + p[0].slice(2); }
  function back(i, n) { return Math.max(0, i - n); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function kpi(label, value, unit, sub, extraCls) {
    return '<div class="kpi"><span class="label">' + label + '</span><div class="value ' + (extraCls || "") + '">' +
      value + (unit ? "<small>" + unit + "</small>" : "") + '</div><div class="sub">' + (sub || "&nbsp;") + "</div></div>";
  }
  function startIndexFor(range) {
    if (range === "MAX") return 0;
    var yrs = parseInt(range, 10);
    var last = D.dates[D.dates.length - 1];
    var cut = (parseInt(last.slice(0, 4), 10) - yrs) + last.slice(4);
    for (var i = 0; i < D.dates.length; i++) if (D.dates[i] >= cut) return i;
    return 0;
  }
  // thin long series so the canvas stays smooth on phones
  function stride(n) { var w = window.innerWidth < 720 ? 700 : 1500; return Math.max(1, Math.ceil(n / w)); }
  function sample(arr, from, step) {
    var out = [];
    for (var i = from; i < arr.length; i += step) out.push(arr[i]);
    if ((arr.length - 1 - from) % step) out.push(arr[arr.length - 1]);
    return out;
  }

  function timeAxis() {
    return {
      grid: { color: C.grid, drawTicks: false },
      border: { display: false },
      ticks: {
        autoSkip: true, maxTicksLimit: window.innerWidth < 720 ? 4 : 8, maxRotation: 0, padding: 8,
        callback: function (v) { return shortDate(this.getLabelForValue(v)); }
      }
    };
  }
  function valueAxis(fmt) {
    return { grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { padding: 8, callback: fmt } };
  }
  function lineDs(label, data, color, extra) {
    var ds = { label: label, data: data, borderColor: color, backgroundColor: color, borderWidth: 1.6,
      pointRadius: 0, pointHoverRadius: 3, tension: 0, spanGaps: true };
    if (extra) Object.keys(extra).forEach(function (k) { ds[k] = extra[k]; });
    return ds;
  }
  function baseOpts(yfmt, tipfmt) {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: function (items) { return items.length ? niceDate(items[0].label) : ""; },
          label: function (c) { return " " + c.dataset.label + "  " + tipfmt(c.parsed.y); }
        } }
      },
      scales: { x: timeAxis(), y: valueAxis(yfmt) }
    };
  }
  function draw(key, canvasId, cfg) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart($(canvasId), cfg);
  }

  // ---------- curve ----------------------------------------------------------
  function shape(i) {
    var s3 = bp(y(i, "10Y"), y(i, "3M")), s2 = bp(y(i, "10Y"), y(i, "2Y"));
    if (s3 != null && s3 < -10) return ["Inverted", "bad"];
    if (s2 != null && Math.abs(s2) <= 10) return ["Flat", "warn"];
    if (s2 != null && s2 > 100) return ["Steep", "good"];
    return ["Normal", "good"];
  }

  function renderCurveKpis() {
    var i = idx, p = back(i, 1), w = back(i, 5);
    var t10 = y(i, "10Y"), d10 = bp(t10, y(p, "10Y"));
    var s2 = bp(y(i, "10Y"), y(i, "2Y")), s2w = bp(y(w, "10Y"), y(w, "2Y"));
    var s3 = bp(y(i, "10Y"), y(i, "3M"));
    var sh = shape(i);
    $("curve-kpis").innerHTML =
      kpi("10-year yield", fmtPct(t10), "", '<span class="' + cls(d10) + '">' + fmtBp(d10, true) + " bp</span> on the day") +
      kpi("10Y − 2Y", fmtBp(s2, true), "bp", "a week earlier " + fmtBp(s2w, true) + " bp") +
      kpi("10Y − 3M", fmtBp(s3, true), "bp", "the slope in the NY Fed recession model") +
      kpi("Shape", '<span class="chip ' + sh[1] + '">' + sh[0] + "</span>", "", "30Y at " + fmtPct(y(i, "30Y")), "value--chip");
  }

  function overlays() {
    return Array.prototype.slice.call(document.querySelectorAll("#overlay-toggle button"))
      .filter(function (b) { return b.classList.contains("active"); })
      .map(function (b) { return +b.dataset.ago; });
  }

  var OVERLAY_COLOR = { 5: C.s3, 21: C.s2, 252: C.s4, 1260: C.s5 };
  var OVERLAY_NAME = { 5: "1W ago", 21: "1M ago", 252: "1Y ago", 1260: "5Y ago" };

  function curveDatasets() {
    var ds = [{
      label: niceDate(D.dates[idx]), data: D.curve[idx].slice(), borderColor: C.s1, backgroundColor: C.s1,
      borderWidth: 2.4, pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: "#050505", pointBorderWidth: 2,
      tension: .35, cubicInterpolationMode: "monotone", spanGaps: true, order: 0,
      fill: { target: "origin", above: "rgba(243,243,241,.045)" }
    }];
    overlays().forEach(function (n) {
      var j = idx - n;
      if (j < 0) return;
      ds.push({
        label: OVERLAY_NAME[n] + " · " + niceDate(D.dates[j]), data: D.curve[j].slice(),
        borderColor: OVERLAY_COLOR[n], backgroundColor: OVERLAY_COLOR[n], borderWidth: 1.4, borderDash: [5, 5],
        pointRadius: 0, pointHoverRadius: 4, tension: .35, cubicInterpolationMode: "monotone", spanGaps: true, order: 1, fill: false
      });
    });
    return ds;
  }

  function buildCurveChart() {
    var all = [];
    D.curve.forEach(function (r) { r.forEach(function (v) { if (v != null) all.push(v); }); });
    draw("curve", "curve-chart", {
      type: "line",
      data: { labels: D.tenors, datasets: curveDatasets() },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 650, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true, position: "bottom", align: "start",
            labels: { boxWidth: 18, boxHeight: 2, padding: 16, usePointStyle: false } },
          tooltip: { callbacks: {
            title: function (it) { return it.length ? it[0].label + " Treasury" : ""; },
            label: function (c) { return " " + c.dataset.label + "  " + fmtPct(c.parsed.y); }
          } }
        },
        scales: {
          x: { grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { padding: 8, maxRotation: 0, autoSkip: true, autoSkipPadding: 6 } },
          y: valueAxis(function (v) { return v.toFixed(1) + "%"; })
        }
      }
    });
  }

  function updateCurveChart(animate) {
    var ch = charts.curve;
    if (!ch) return;
    var ds = curveDatasets();
    // keep dataset objects stable during replay so Chart.js tweens instead of rebuilding
    if (ch.data.datasets.length === ds.length) {
      ds.forEach(function (d, k) { ch.data.datasets[k].data = d.data; ch.data.datasets[k].label = d.label; });
    } else {
      ch.data.datasets = ds;
    }
    ch.update(animate ? undefined : "none");
  }

  function renderMoves() {
    var i = idx, yr = D.dates[i].slice(0, 4), ytd = 0;
    for (var k = i; k >= 0; k--) if (D.dates[k].slice(0, 4) !== yr) { ytd = k; break; }
    var cols = [["1D", back(i, 1)], ["1W", back(i, 5)], ["1M", back(i, 21)], ["YTD", ytd], ["1Y", back(i, 252)]];
    var h = "<thead><tr><th>Tenor</th><th>Yield</th>" + cols.map(function (c) { return "<th>" + c[0] + "</th>"; }).join("") + "</tr></thead><tbody>";
    D.tenors.forEach(function (t) {
      var v = y(i, t);
      h += "<tr><td>" + t + "</td><td>" + fmtPct(v) + "</td>" + cols.map(function (c) {
        var d = bp(v, y(c[1], t));
        return '<td class="' + cls(d) + '">' + fmtBp(d, true) + "</td>";
      }).join("") + "</tr>";
    });
    $("moves-table").innerHTML = h + "</tbody>";
  }

  var FWDS = [["1y1y", "1Y", "2Y"], ["2y1y", "2Y", "3Y"], ["2y3y", "2Y", "5Y"], ["5y5y", "5Y", "10Y"], ["10y10y", "10Y", "20Y"], ["10y20y", "10Y", "30Y"]];
  function fwd(i, a, b) {
    var ya = y(i, a), yb = y(i, b);
    if (ya == null || yb == null) return null;
    var ta = D.months[ti(a)] / 12, tb = D.months[ti(b)] / 12;
    return (Math.pow(Math.pow(1 + yb / 100, tb) / Math.pow(1 + ya / 100, ta), 1 / (tb - ta)) - 1) * 100;
  }
  function renderForwards() {
    var i = idx, m = back(i, 21);
    var h = "<thead><tr><th>Forward</th><th>Rate</th><th>vs spot end</th><th>1M change</th></tr></thead><tbody>";
    FWDS.forEach(function (f) {
      var v = fwd(i, f[1], f[2]), prev = fwd(m, f[1], f[2]);
      var vs = bp(v, y(i, f[2])), ch = bp(v, prev);
      h += "<tr><td>" + f[0] + "</td><td>" + fmtPct(v) + '</td><td class="' + cls(vs) + '">' + fmtBp(vs, true) +
        ' bp</td><td class="' + cls(ch) + '">' + fmtBp(ch, true) + " bp</td></tr>";
    });
    $("fwd-table").innerHTML = h + "</tbody>";
  }

  function selectIndex(i, animate) {
    idx = Math.max(0, Math.min(D.dates.length - 1, i));
    $("date-slider").value = idx;
    var latest = idx === D.dates.length - 1;
    $("curve-date-label").textContent = niceDate(D.dates[idx]) + (latest ? " · latest" : " · drag back to latest anytime");
    renderCurveKpis();
    updateCurveChart(animate);
    if (!playing) { renderMoves(); renderForwards(); }
  }

  function stopPlay() {
    if (!playing) return;
    clearInterval(playing); playing = null;
    $("play-label").textContent = "Replay";
    $("play-icon").setAttribute("d", "M2 1l9 5-9 5z");
    renderMoves(); renderForwards();
  }
  function startPlay() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { selectIndex(D.dates.length - 1, true); return; }
    var i = idx >= D.dates.length - 6 ? 0 : idx;
    $("play-label").textContent = "Pause";
    $("play-icon").setAttribute("d", "M2 1h3v10H2zM7 1h3v10H7z");
    playing = setInterval(function () {
      i += 7;
      if (i >= D.dates.length - 1) { selectIndex(D.dates.length - 1, false); stopPlay(); return; }
      selectIndex(i, false);
    }, 33);
  }

  function initCurve() {
    var s = $("date-slider");
    s.max = D.dates.length - 1;
    s.addEventListener("input", function () { stopPlay(); selectIndex(+s.value, false); });
    s.addEventListener("change", function () { renderMoves(); renderForwards(); });
    $("today-btn").addEventListener("click", function () { stopPlay(); selectIndex(D.dates.length - 1, true); });
    $("play-btn").addEventListener("click", function () { playing ? stopPlay() : startPlay(); });
    document.querySelectorAll("#overlay-toggle button").forEach(function (b) {
      b.addEventListener("click", function () {
        var on = !b.classList.contains("active");
        b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on));
        if (charts.curve) { charts.curve.data.datasets = curveDatasets(); charts.curve.update(); }
      });
    });
    buildCurveChart();
    selectIndex(D.dates.length - 1, false);
  }

  // ---------- slope & inversions ---------------------------------------------
  var S2 = [], S3 = [];
  function computeSpreads() {
    for (var i = 0; i < D.dates.length; i++) { S2.push(bp(y(i, "10Y"), y(i, "2Y"))); S3.push(bp(y(i, "10Y"), y(i, "3M"))); }
  }

  function episodes() {
    var out = [], run = null, pos = 0;
    for (var i = 0; i < S3.length; i++) {
      var v = S3[i];
      if (v == null) continue;
      if (v < 0) {
        if (!run) run = { s: i, e: i, min: v, mi: i, n: 0 };
        run.e = i; run.n++; pos = 0;
        if (v < run.min) { run.min = v; run.mi = i; }
      } else if (run) {
        pos++;
        if (pos > 5) { if (run.n >= 10) out.push(run); run = null; pos = 0; }
      }
    }
    if (run && run.n >= 10) { run.ongoing = S3[S3.length - 1] < 0 || pos <= 5 && (S3.length - 1 - run.e) <= 5; out.push(run); }
    return out.reverse();
  }

  function renderSpreadKpis() {
    var n = S3.length - 1, streak = 0;
    for (var i = n; i >= 0 && S3[i] != null && S3[i] < 0; i--) streak++;
    var since = n;
    if (!streak) { while (since > 0 && (S3[since - 1] == null || S3[since - 1] >= 0)) since--; }
    var two = startIndexFor("2Y"), inv = 0, tot = 0;
    for (var k = two; k <= n; k++) if (S3[k] != null) { tot++; if (S3[k] < 0) inv++; }
    $("spread-kpis").innerHTML =
      kpi("10Y − 2Y", fmtBp(S2[n], true), "bp", "1Y ago " + fmtBp(S2[back(n, 252)], true) + " bp") +
      kpi("10Y − 3M", fmtBp(S3[n], true), "bp", "1Y ago " + fmtBp(S3[back(n, 252)], true) + " bp") +
      kpi(streak ? "Inverted for" : "Positive since", streak ? String(streak) : shortDate(D.dates[since]), streak ? "sessions" : "", streak ? "10Y − 3M below zero" : "10Y − 3M at or above zero") +
      kpi("Inverted, last 2Y", tot ? Math.round(inv / tot * 100) + "%" : "—", "", "share of sessions, 10Y − 3M");
  }

  function buildSpreadChart() {
    var from = startIndexFor(ranges.spreads), st = stride(D.dates.length - from);
    var labels = sample(D.dates, from, st);
    var fillNeg = { target: { value: 0 }, above: "rgba(0,0,0,0)", below: C.bearFill };
    var o = baseOpts(function (v) { return v; }, function (v) { return fmtBp(v, true) + " bp"; });
    o.scales.y.grid.color = function (c) { return c.tick && c.tick.value === 0 ? "rgba(255,255,255,.35)" : C.grid; };
    draw("spreads", "spread-chart", {
      type: "line",
      data: { labels: labels, datasets: [
        lineDs("10Y − 2Y", sample(S2, from, st), C.s1, { fill: fillNeg }),
        lineDs("10Y − 3M", sample(S3, from, st), C.s2, { borderWidth: 1.3 })
      ] },
      options: o
    });
  }

  function renderEpisodes() {
    var eps = episodes();
    var h = "<thead><tr><th>Began</th><th>Ended</th><th>Sessions</th><th>Deepest</th><th>Deepest on</th></tr></thead><tbody>";
    if (!eps.length) h += '<tr><td colspan="5" class="muted">No episodes in the data.</td></tr>';
    eps.forEach(function (e) {
      h += "<tr><td>" + niceDate(D.dates[e.s]) + "</td><td>" + (e.ongoing ? '<span class="chip bad">ongoing</span>' : niceDate(D.dates[e.e])) +
        "</td><td>" + e.n + '</td><td class="neg">' + fmtBp(e.min, true) + " bp</td><td>" + niceDate(D.dates[e.mi]) + "</td></tr>";
    });
    $("episodes-table").innerHTML = h + "</tbody>";
  }

  // ---------- real rates -----------------------------------------------------
  function series(k) { return (D.series && D.series[k]) || []; }
  function lastVal(arr) { for (var i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return [arr[i], i]; return [null, -1]; }

  function renderRealKpis() {
    var r = lastVal(series("real10")), b = lastVal(series("be10")), f = lastVal(series("ffr"));
    var n = D.dates.length - 1, two = y(n, "2Y");
    var r1 = r[1] >= 0 ? series("real10")[back(r[1], 252)] : null;
    $("real-kpis").innerHTML =
      kpi("10Y real yield", fmtPct(r[0]), "", "1Y ago " + fmtPct(r1)) +
      kpi("10Y breakeven", fmtPct(b[0]), "", "market-implied CPI, 10Y avg") +
      kpi("Fed funds, effective", fmtPct(f[0]), "", f[1] >= 0 ? "as of " + niceDate(D.dates[f[1]]) : "") +
      kpi("2Y − fed funds", fmtBp(bp(two, f[0]), true), "bp", bp(two, f[0]) < 0 ? "market leans toward cuts" : "market leans toward holds or hikes");
  }

  function buildRealCharts() {
    var from = startIndexFor(ranges.real), st = stride(D.dates.length - from);
    var labels = sample(D.dates, from, st);
    var nom = D.curve.map(function (r) { return r[ti("10Y")]; });
    var pct = function (v) { return v.toFixed(1) + "%"; };
    draw("real", "real-chart", {
      type: "line",
      data: { labels: labels, datasets: [
        lineDs("10Y nominal", sample(nom, from, st), C.s1),
        lineDs("10Y real", sample(series("real10"), from, st), C.s3),
        lineDs("10Y breakeven", sample(series("be10"), from, st), C.s4)
      ] },
      options: baseOpts(pct, function (v) { return fmtPct(v); })
    });
    var two = D.curve.map(function (r) { return r[ti("2Y")]; });
    draw("policy", "policy-chart", {
      type: "line",
      data: { labels: labels, datasets: [
        lineDs("2Y Treasury", sample(two, from, st), C.s1),
        lineDs("Fed funds", sample(series("ffr"), from, st), C.s2, { stepped: true })
      ] },
      options: baseOpts(pct, function (v) { return fmtPct(v); })
    });
  }

  // ---------- credit ---------------------------------------------------------
  function pctile(arr, v) {
    var xs = arr.filter(function (x) { return x != null; });
    if (!xs.length || v == null) return null;
    return Math.round(xs.filter(function (x) { return x < v; }).length / xs.length * 100);
  }
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function renderCredit() {
    var hy = series("hy"), ig = series("ig");
    var h = lastVal(hy), g = lastVal(ig);
    var first = hy.findIndex(function (v) { return v != null; });
    var p = pctile(hy, h[0]), pg = pctile(ig, g[0]);
    $("credit-kpis").innerHTML =
      kpi("High yield OAS", h[0] == null ? "—" : Math.round(h[0] * 100), "bp", p == null ? "" : ordinal(p) + " percentile of history shown") +
      kpi("Investment grade OAS", g[0] == null ? "—" : Math.round(g[0] * 100), "bp", pg == null ? "" : ordinal(pg) + " percentile of history shown") +
      kpi("HY − IG", h[0] == null || g[0] == null ? "—" : Math.round((h[0] - g[0]) * 100), "bp", "the extra pay for going below investment grade") +
      kpi("1M change, HY", fmtBp(h[0] != null && h[1] >= 21 && hy[h[1] - 21] != null ? (h[0] - hy[h[1] - 21]) * 100 : null, true), "bp", "positive means spreads widened");
    if (first < 0) { $("credit-window").textContent = "No credit spread history yet."; return; }
    $("credit-window").textContent = "History held: " + niceDate(D.dates[first]) + " to " + niceDate(D.dates[h[1]]) + " · " + (h[1] - first + 1) + " sessions";
    var st = stride(D.dates.length - first);
    var bpArr = function (a) { return a.map(function (v) { return v == null ? null : Math.round(v * 100); }); };
    draw("credit", "credit-chart", {
      type: "line",
      data: { labels: sample(D.dates, first, st), datasets: [
        lineDs("High yield", sample(bpArr(hy), first, st), C.s5, { fill: { target: "origin", above: "rgba(255,106,74,.06)" } }),
        lineDs("Investment grade", sample(bpArr(ig), first, st), C.s3)
      ] },
      options: baseOpts(function (v) { return v; }, function (v) { return v + " bp"; })
    });
  }

  // ---------- wiring ---------------------------------------------------------
  function buildPanel(name) {
    if (!D || built[name]) return;
    built[name] = true;
    if (name === "spreads") { renderSpreadKpis(); buildSpreadChart(); renderEpisodes(); }
    if (name === "real") { renderRealKpis(); buildRealCharts(); }
    if (name === "credit") renderCredit();
  }

  function bindRange(id, key, rebuild) {
    document.querySelectorAll("#" + id + " button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("#" + id + " button").forEach(function (x) { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
        ranges[key] = b.dataset.range; rebuild();
      });
    });
  }

  document.addEventListener("tabchange", function (e) {
    stopPlay();
    buildPanel(e.detail);
    Object.keys(charts).forEach(function (k) { var c = charts[k]; if (c.canvas.closest(".panel.active")) c.resize(); });
  });

  fetch("data/tenor.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      D = data;
      $("load-state").remove();
      $("updated-at").textContent = niceDate(D.asOf);
      computeSpreads();
      initCurve();
      bindRange("spread-range", "spreads", buildSpreadChart);
      bindRange("real-range", "real", buildRealCharts);
      var active = document.querySelector(".panel.active");
      if (active) buildPanel(active.id);
    })
    .catch(function (err) {
      $("load-state").textContent = "Could not load data/tenor.json (" + err.message + "). If you opened the file directly, serve the folder instead: python -m http.server";
      console.warn("Tenor: data load failed", err);
    });
})();
