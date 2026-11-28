/* Trang làm bài: đăng nhập, hiển thị đề, chống gian lận, nộp bài, xem lại */
const ID = new URLSearchParams(location.search).get("id");
const S = {
  meta: null, info: null, sess: null, data: null, answers: {}, order: [], perm: {},
  violations: 0, lastVio: 0, submitting: false, done: false, offset: 0, timer: null,
};

/* ---------------- hộp thoại ---------------- */
function dialog(title, msg, buttons) {
  return new Promise(res => {
    $("#modalT").textContent = title; $("#modalM").innerHTML = msg;
    $("#modalA").innerHTML = "";
    buttons.forEach(([label, val, cls]) => {
      const b = document.createElement("button"); b.className = "btn " + (cls || ""); b.textContent = label;
      b.onclick = () => { $("#modal").classList.add("hidden"); res(val); };
      $("#modalA").appendChild(b);
    });
    $("#modal").classList.remove("hidden");
    $("#modalA button").focus();
  });
}
function setMsg(el, text, kind = "err") { $(el).innerHTML = text ? `<div class="msg ${kind}">${text}</div>` : ""; }

/* ---------------- 1. thông tin đề + đăng nhập ---------------- */
const XEM = { ngay: "ngay sau khi nộp bài", sauKhiDong: "sau khi bài thi đóng", khong: "không công bố" };

async function init() {
  if (!ID) { $("#exTitle").textContent = "Không tìm thấy đề."; return; }
  try {
    const idx = await (await fetch("data/index.json", { cache: "no-cache" })).json();
    S.meta = idx.exams.find(e => e.id === ID);
  } catch (e) {}
  if (!S.meta) { $("#exTitle").textContent = "Không tìm thấy đề này. Hãy quay lại danh sách đề."; $("#loginForm").classList.add("hidden"); return; }
  document.title = S.meta.title + " — Ôn tập Toán";
  $("#exTitle").textContent = S.meta.title;
  $("#exSub").textContent = [S.meta.khoi, S.meta.loai, S.meta.sub].filter(Boolean).join(", ");
  try {
    S.info = await api("info", { id: ID });
  } catch (e) {
    setMsg("#loginMsg", esc(e.message)); $("#btnStart").disabled = true; return;
  }
  const c = S.info.cfg, cnt = S.meta.counts;
  const facts = [
    ["Số câu", `${cnt.MC + cnt.TF + cnt.SA} (Phần I: ${cnt.MC}, Phần II: ${cnt.TF}, Phần III: ${cnt.SA})`],
    ["Thời gian", +c.ThoiGian ? c.ThoiGian + " phút" : "Không giới hạn"],
    ["Số lần làm", +c.SoLanLam ? "Tối đa " + c.SoLanLam + " lần" : "Không giới hạn"],
    ["Đáp án", "Xem " + (XEM[c.XemDapAn] || XEM.ngay) + (c.CanMatKhauLG && c.XemDapAn !== "khong" ? ", cần mật khẩu của thầy cô" : "")],
  ];
  if (c.DongLuc) facts.push(["Đóng lúc", c.DongLuc]);
  $("#exFacts").innerHTML = facts.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join("");
  const exam = c.CheDo !== "luyentap";
  const rules = exam ? [
    "Bài làm ở chế độ toàn màn hình. Thoát toàn màn hình, chuyển tab, mở ứng dụng khác hoặc thu nhỏ cửa sổ đều bị ghi là vi phạm.",
    +c.ViPhamToiDa ? `Vi phạm đến lần thứ ${c.ViPhamToiDa}, bài sẽ tự động nộp.` : "Mọi vi phạm đều được ghi lại và gửi cho giáo viên.",
    "Không sao chép, dán, in hay chụp màn hình đề. Thứ tự câu hỏi và phương án của mỗi bạn khác nhau.",
    +c.ThoiGian ? "Hết giờ, bài được nộp tự động. Tải lại trang không làm dừng đồng hồ." : "Bài không giới hạn thời gian.",
  ] : [
    "Đây là bài luyện tập: không giới hạn số lần, không giám sát.",
    "Sau khi nộp, bạn xem được điểm, đáp án và lời giải.",
  ];
  $("#rules").innerHTML = rules.map(r => `<li>${r}</li>`).join("");
  if (!S.info.roster) { $("#fRoster").classList.add("hidden"); $("#fFree").classList.remove("hidden"); $("#hoTen").required = true; $("#lop").required = true; $("#maHS").required = false; }
  if (!S.info.needPass) $("#fPass").classList.add("hidden");
  if (!S.info.open) { setMsg("#loginMsg", esc(S.info.reason || "Bài này đang đóng."), "info"); $("#btnStart").disabled = true; }
  // nhớ thông tin đã nhập
  ["maHS", "hoTen", "lop"].forEach(k => { const v = localStorage.getItem("u_" + k); if (v) $("#" + k).value = v; });
}

function identity() {
  const o = { id: ID, maHS: $("#maHS").value.trim(), matKhau: $("#matKhau").value, hoTen: $("#hoTen").value.trim(), lop: $("#lop").value.trim() };
  ["maHS", "hoTen", "lop"].forEach(k => localStorage.setItem("u_" + k, o[k]));
  return o;
}

$("#loginForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const examMode = S.info.cfg.CheDo !== "luyentap";
  if (examMode) await enterFullscreen();     // phải gọi ngay trong thao tác bấm của HS
  $("#btnStart").disabled = true; setMsg("#loginMsg", "Đang mở đề…", "info");
  try {
    const r = await api("start", { ...identity(), ua: navigator.userAgent.slice(0, 200) }, 3);
    S.sess = r; S.offset = r.now - Date.now(); S.violations = r.violations || 0;
    S.data = await decryptBin(`data/de/${ID}.bin`, r.kDe);
    startExam();
  } catch (e) {
    setMsg("#loginMsg", esc(e.message)); $("#btnStart").disabled = false;
    exitFullscreen();
  }
});

$("#btnReview").addEventListener("click", async () => {
  setMsg("#loginMsg", "Đang tải bài đã nộp…", "info");
  try {
    const r = await api("review", identity(), 2);
    S.data = null; S.reviewId = identity();
    await showResult(r, true);
  } catch (e) { setMsg("#loginMsg", esc(e.message)); }
});

/* ---------------- 2. hiển thị đề ---------------- */
function startExam() {
  const examMode = S.sess.cfg.CheDo !== "luyentap";
  const rand = rng(S.sess.seed);
  const qs = S.data.questions;
  S.order = [];
  ["MC", "TF", "SA"].forEach(t => {
    let part = qs.filter(q => q.t === t);
    if (examMode) part = shuffled(part, rand);
    S.order.push(...part);
  });
  qs.forEach(q => { if (q.t === "MC") S.perm[q.id] = examMode ? shuffled([0, 1, 2, 3].slice(0, q.opts.length), rand) : q.opts.map((_, i) => i); });
  try { S.answers = JSON.parse(localStorage.getItem("bl_" + S.sess.token) || "{}"); } catch (e) { S.answers = {}; }

  const paper = $("#paper"); let html = "", cur = null, n = 0;
  S.order.forEach(q => {
    if (q.t !== cur) { cur = q.t; n = 0; html += `<h2 class="part-h">${PART_INFO[cur].name}<small>${PART_INFO[cur].hint}</small></h2>`; }
    n++; q._n = n;
    html += `<article class="q" id="q_${q.id}"><div class="stem"><span class="q-n">Câu ${n}.</span>${q.stem}</div>${answerUI(q)}</article>`;
  });
  paper.innerHTML = html;
  attachFigs(paper, S.data.figs);
  bindAnswers(paper);
  renderSheet();
  $("#who").innerHTML = `<b>${esc(S.sess.name)}</b>${S.sess.lop ? ", lớp " + esc(S.sess.lop) : ""} — ${esc(S.meta.title)}`;
  updateVio();
  show("s-exam");
  typeset(paper);
  if (examMode) { watermark(); AC.on(); }
  if (S.sess.resumed && examMode) setTimeout(() => dialog("Tiếp tục bài làm", "Bạn đang làm tiếp bài đã bắt đầu trước đó. Đồng hồ vẫn chạy trong thời gian bạn rời đi, và lần vào lại này đã được ghi nhận.", [["Làm tiếp", 1]]), 300);
  tick(); S.timer = setInterval(tick, 1000);
  window.addEventListener("beforeunload", e => { if (!S.done) { e.preventDefault(); e.returnValue = ""; } });
}

function answerUI(q) {
  const a = S.answers[q.id];
  if (q.t === "MC") {
    return `<div class="opts">` + S.perm[q.id].map((oi, di) =>
      `<button type="button" class="opt" data-q="${q.id}" data-v="${oi}" aria-pressed="${a === oi}"><span class="L">${LETTERS[di]}</span><span>${q.opts[oi]}</span></button>`).join("") + `</div>`;
  }
  if (q.t === "TF") {
    return `<table class="tf">` + q.opts.map((o, i) => {
      const v = a ? a[i] : null;
      return `<tr><td class="k">${"abcd"[i]})</td><td>${o}</td><td class="c">
        <button type="button" class="tfb d" data-q="${q.id}" data-i="${i}" data-v="1" aria-pressed="${v === true}">Đúng</button>
        <button type="button" class="tfb s" data-q="${q.id}" data-i="${i}" data-v="0" aria-pressed="${v === false}">Sai</button></td></tr>`;
    }).join("") + `</table>`;
  }
  return `<div class="sa"><label>Đáp số: <input type="text" maxlength="4" data-q="${q.id}" value="${esc(a || "")}" autocomplete="off" spellcheck="false"></label><span class="hint">Tối đa 4 ký tự (chữ số, dấu trừ, dấu phẩy). Gõ dấu chấm cũng được hiểu là dấu phẩy.</span></div>`;
}

function bindAnswers(root) {
  root.addEventListener("click", e => {
    const o = e.target.closest(".opt");
    if (o) {
      const q = o.dataset.q, v = +o.dataset.v;
      S.answers[q] = S.answers[q] === v ? null : v;
      $all(`.opt[data-q="${q}"]`, root).forEach(b => b.setAttribute("aria-pressed", S.answers[q] === +b.dataset.v));
      saved(); return;
    }
    const t = e.target.closest(".tfb");
    if (t) {
      const q = t.dataset.q, i = +t.dataset.i, v = t.dataset.v === "1";
      const arr = S.answers[q] || [null, null, null, null];
      arr[i] = arr[i] === v ? null : v; S.answers[q] = arr;
      $all(`.tfb[data-q="${q}"][data-i="${i}"]`, root).forEach(b => b.setAttribute("aria-pressed", arr[i] === (b.dataset.v === "1")));
      saved();
    }
  });
  root.addEventListener("input", e => {
    const inp = e.target.closest("input[data-q]");
    if (!inp) return;
    const clean = inp.value.replace(/\./g, ",").replace(/[^0-9,\-]/g, "").slice(0, 4);
    if (clean !== inp.value) inp.value = clean;
    S.answers[inp.dataset.q] = clean;
    saved();
  });
}

function answered(q) {
  const a = S.answers[q.id];
  if (q.t === "MC") return a !== null && a !== undefined;
  if (q.t === "TF") return Array.isArray(a) && a.every(x => x !== null && x !== undefined);
  return !!(a && String(a).trim());
}

function renderSheet() {
  let html = "", cur = null;
  S.order.forEach(q => {
    if (q.t !== cur) { if (cur) html += `</div>`; cur = q.t; html += `<h4>${{ MC: "Phần I", TF: "Phần II", SA: "Phần III" }[cur]}</h4><div class="bubbles">`; }
    const a = S.answers[q.id];
    let dots = "";
    if (q.t === "MC") dots = S.perm[q.id].map(oi => `<span class="dot ${a === oi ? "on" : ""}"></span>`).join("");
    else if (q.t === "TF") dots = [0, 1, 2, 3].map(i => `<span class="dot ${a && a[i] !== null && a[i] !== undefined ? "on" : ""}"></span>`).join("");
    else dots = `<span class="dot ${answered(q) ? "on" : ""}"></span>`;
    html += `<button type="button" class="bub" data-go="${q.id}" title="Câu ${q._n}"><span class="n">${q._n}</span>${dots}</button>`;
  });
  html += `</div>`;
  $("#bubbles").innerHTML = html;
  const done = S.order.filter(answered).length;
  $("#stat").textContent = `Đã trả lời ${done}/${S.order.length} câu`;
}
$("#bubbles").addEventListener("click", e => {
  const b = e.target.closest("[data-go]");
  if (b) { document.getElementById("q_" + b.dataset.go).scrollIntoView({ behavior: "smooth", block: "start" }); $("#sheet").classList.remove("open"); }
});
$("#sheetToggle").addEventListener("click", () => $("#sheet").classList.toggle("open"));

let saveT = null;
function saved() {
  renderSheet();
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem("bl_" + S.sess.token, JSON.stringify(S.answers)); } catch (e) {} }, 200);
}

/* ---------------- đồng hồ ---------------- */
function tick() {
  const now = Date.now() + S.offset;
  const el = $("#clock");
  if (!S.sess.deadline) {
    const t = Math.floor((now - S.sess.startedAt) / 1000);
    el.textContent = fmt(t); return;
  }
  const left = Math.floor((S.sess.deadline - now) / 1000);
  el.textContent = fmt(Math.max(0, left));
  el.classList.toggle("low", left <= 300);
  if (left === 300) dialog("Còn 5 phút", "Hãy kiểm tra lại phiếu trả lời.", [["Đã hiểu", 1]]);
  if (left <= 0 && !S.submitting) submit(true, "Hết giờ");
}
function fmt(t) { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); }

/* ---------------- chống gian lận ---------------- */
async function enterFullscreen() {
  const el = document.documentElement;
  try { if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" }); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(); } catch (e) {}
}
function exitFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} }
const fsSupported = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

function watermark() {
  const text = `${S.sess.name} ${S.sess.lop || ""}`.trim();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="120" transform="rotate(-24 180 100)" font-family="sans-serif" font-size="18" font-weight="700" fill="#1b2a4a">${esc(text)}</text></svg>`;
  $("#wm").style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

function updateVio() {
  const max = +S.sess.cfg.ViPhamToiDa;
  $("#vio").textContent = `Vi phạm: ${S.violations}${max ? "/" + max : ""}`;
  $("#vio").classList.toggle("has", S.violations > 0);
}

async function violation(type, detail = "") {
  if (S.done || S.submitting) return;
  const now = Date.now();
  if (now - S.lastVio < 2500) return;      // gộp các sự kiện xảy ra cùng lúc
  S.lastVio = now;
  S.violations++;
  updateVio();
  api("log", { token: S.sess.token, type, detail }).catch(() => {});
  const max = +S.sess.cfg.ViPhamToiDa;
  if (max && S.violations >= max) { submit(true, "Vi phạm quá " + max + " lần (" + type + ")"); return; }
  shield("Đã ghi nhận vi phạm", `${type}. Đây là lần vi phạm thứ ${S.violations}${max ? ", đến lần thứ " + max + " bài sẽ tự động nộp" : ""}. Giáo viên sẽ thấy thông tin này.`);
}

function shield(title, msg) {
  if (S.done) return;
  $("#shieldT").textContent = title; $("#shieldM").textContent = msg;
  $("#shield").classList.remove("hidden"); $("#examGrid").classList.add("blur");
}
$("#shieldBtn").addEventListener("click", async () => {
  if (fsSupported() && !isFs()) await enterFullscreen();
  $("#shield").classList.add("hidden"); $("#examGrid").classList.remove("blur");
});

const AC = {
  on() {
    document.addEventListener("visibilitychange", () => { if (document.hidden) violation("Rời khỏi trang làm bài (chuyển tab / ứng dụng khác)"); });
    window.addEventListener("blur", () => setTimeout(() => { if (!document.hasFocus() && !S.done) violation("Chuyển sang cửa sổ khác"); }, 400));
    const onFs = () => { if (!isFs() && !S.done && fsSupported()) violation("Thoát chế độ toàn màn hình"); };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    ["copy", "cut", "paste", "contextmenu", "dragstart", "selectstart"].forEach(ev =>
      document.addEventListener(ev, e => {
        if (S.done) return;
        const inInput = e.target.closest && e.target.closest("input");
        if (ev === "paste" || ev === "copy" || ev === "cut" || !inInput) e.preventDefault();
      }));
    document.addEventListener("keydown", e => {
      if (S.done) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (mod && ["c", "x", "v", "p", "s", "u", "a"].includes(k))) {
        e.preventDefault();
        if (e.key === "F12" || (mod && e.shiftKey) || k === "u") violation("Mở công cụ nhà phát triển");
      }
    });
    document.addEventListener("keyup", e => {
      if (S.done) return;
      if (e.key === "PrintScreen") { try { navigator.clipboard.writeText(""); } catch (x) {} violation("Chụp màn hình"); }
    });
    if (fsSupported() && !isFs()) shield("Bật toàn màn hình", "Bài thi cần chế độ toàn màn hình. Bấm nút bên dưới để tiếp tục.");
  },
};

/* ---------------- nộp bài ---------------- */
$("#btnSubmit").addEventListener("click", async () => {
  const left = S.order.length - S.order.filter(answered).length;
  const ok = await dialog("Nộp bài?", left ? `Bạn còn <b>${left}</b> câu chưa trả lời đầy đủ. Sau khi nộp sẽ không sửa được nữa.` : "Bạn đã trả lời tất cả các câu. Sau khi nộp sẽ không sửa được nữa.", [["Nộp bài", true, "red"], ["Làm tiếp", false, "ghost"]]);
  if (ok) submit(false, "");
});

async function submit(auto, reason) {
  if (S.submitting || S.done) return;
  S.submitting = true;
  clearInterval(S.timer);
  $("#btnSubmit").disabled = true;
  shield(auto ? "Bài đang được nộp tự động" : "Đang nộp bài", (reason ? reason + ". " : "") + "Vui lòng không đóng trang.");
  $("#shieldBtn").classList.add("hidden");
  const answers = {};
  S.data.questions.forEach(q => { const a = S.answers[q.id]; if (a !== undefined && a !== null && a !== "") answers[q.id] = a; });
  for (let k = 0; ; k++) {
    try {
      const r = await api("submit", { token: S.sess.token, answers, auto, reason }, 3);
      S.done = true;
      try { localStorage.removeItem("bl_" + S.sess.token); } catch (e) {}
      exitFullscreen();
      $("#shield").classList.add("hidden"); $("#examGrid").classList.remove("blur");
      await showResult(r, false);
      return;
    } catch (e) {
      if (e.server) { // máy chủ từ chối (vd. đã nộp rồi)
        S.done = true; exitFullscreen();
        $("#shield").classList.add("hidden");
        await dialog("Không nộp được", esc(e.message), [["Về danh sách đề", 1]]);
        location.href = "./"; return;
      }
      // giãn dần và lệch ngẫu nhiên để hàng trăm máy không cùng gửi lại một lúc
      const wait = Math.min(30000, 3000 * Math.pow(1.6, k)) + Math.random() * 5000;
      $("#shieldM").textContent = `Máy chủ đang bận hoặc mạng chập chờn. Bài làm vẫn được giữ an toàn trên máy, KHÔNG cần làm lại. Tự gửi lại sau ${Math.round(wait / 1000)} giây (lần ${k + 2})…`;
      await new Promise(res => setTimeout(res, wait));
    }
  }
}

/* ---------------- 3. kết quả + xem lại ---------------- */
const fmtScore = x => (Math.round(x * 100) / 100).toString().replace(".", ",");

async function showResult(r, fromReview) {
  const p = r.parts || {};
  const row = (name, t) => p[t] && p[t].max ? `<tr><td>${name}</td><td>${fmtScore(p[t].got)} / ${fmtScore(p[t].max)} điểm</td></tr>` : "";
  $("#resultPanel").innerHTML = `
    <p class="sub"><a href="./">Về danh sách đề</a></p>
    <h1>${esc((S.meta && S.meta.title) || "Kết quả")}</h1>
    <p class="sub">${esc(r.name || "")}${r.lop ? ", lớp " + esc(r.lop) : ""}${r.time ? ", nộp lúc " + esc(r.time) : ""}</p>
    <div class="score">${fmtScore(r.score)}<small> / 10</small></div>
    <table class="parts">${row("Phần I", "MC")}${row("Phần II", "TF")}${row("Phần III", "SA")}
      ${r.minutes !== undefined ? `<tr><td>Thời gian làm</td><td>${String(r.minutes).replace(".", ",")} phút</td></tr>` : ""}
      ${r.violations ? `<tr><td>Số lần vi phạm</td><td>${r.violations}</td></tr>` : ""}</table>
    ${r.reviewNote ? `<div class="msg info">${esc(r.reviewNote)}</div>` : ""}
    ${r.reviewLocked ? `<form id="lgForm" class="lg-lock" autocomplete="off">
      <label class="field"><span>Nhập mật khẩu do thầy cô cung cấp để xem đáp án và lời giải</span>
      <input id="lgPass" type="password" maxlength="60" required></label>
      <div id="lgMsg"></div>
      <button class="btn" id="lgBtn" type="submit">Xem lời giải</button></form>` : ""}
    <div class="actions"><a class="btn ghost" href="./">Về danh sách đề</a>${r.canRetry ? `<a class="btn" href="exam.html?id=${encodeURIComponent(ID)}">Làm lại</a>` : ""}</div>`;
  show("s-result");
  if (r.reviewLocked) bindUnlock(fromReview);
  if (!r.review) return;
  // tải đề (nếu xem lại từ màn hình đăng nhập) + lời giải
  try {
    if (!S.data) S.data = await decryptBin(`data/de/${ID}.bin`, r.review.kDe);
    const sol = await decryptBin(`data/lg/${ID}.bin`, r.review.kLg);
    renderReview(r.review.keys, r.review.answers || S.answers, sol);
  } catch (e) {
    $("#review").innerHTML = `<div class="msg err">Không tải được lời giải: ${esc(e.message)}</div>`;
  }
}

function bindUnlock(fromReview) {
  const form = $("#lgForm");
  if (!form) return;
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const pass = $("#lgPass").value.trim();
    $("#lgBtn").disabled = true; setMsg("#lgMsg", "Đang kiểm tra…", "info");
    try {
      const r = fromReview || !S.sess
        ? await api("review", { ...(S.reviewId || identity()), passLG: pass }, 2)
        : await api("unlock", { token: S.sess.token, pass }, 2);
      if (r.wrongPass || !r.review) {
        setMsg("#lgMsg", "Mật khẩu chưa đúng. Kiểm tra lại với thầy cô.");
        $("#lgBtn").disabled = false; $("#lgPass").select(); return;
      }
      form.remove();
      if (!S.data) S.data = await decryptBin(`data/de/${ID}.bin`, r.review.kDe);
      const sol = await decryptBin(`data/lg/${ID}.bin`, r.review.kLg);
      renderReview(r.review.keys, r.review.answers || S.answers, sol);
      $("#review").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setMsg("#lgMsg", esc(e.message)); $("#lgBtn").disabled = false;
    }
  });
}

function renderReview(keys, ans, sol) {
  let html = "", cur = null, n = 0;
  S.data.questions.forEach(q => {
    if (q.t !== cur) { cur = q.t; n = 0; html += `<h2 class="part-h">${PART_INFO[cur].name}</h2>`; }
    n++;
    const k = keys[q.id], a = ans[q.id];
    let body = "", ok = false;
    if (q.t === "MC") {
      ok = a === k;
      body = `<div class="opts">` + q.opts.map((o, i) => `<div class="opt ${i === k ? "is-key" : ""} ${i === a && a !== k ? "is-wrong" : ""}"><span class="L">${LETTERS[i]}</span><span>${o}</span></div>`).join("") + `</div>`;
      body += `<p class="verdict ${ok ? "ok" : "no"}">${a === undefined || a === null ? "Chưa trả lời" : "Bạn chọn " + LETTERS[a]}. Đáp án: ${LETTERS[k]}.</p>`;
    } else if (q.t === "TF") {
      let c = 0;
      body = `<table class="tf">` + q.opts.map((o, i) => {
        const mine = a ? a[i] : null, right = mine === k[i]; if (right) c++;
        const t = v => v === true ? "Đúng" : v === false ? "Sai" : "—";
        return `<tr><td class="k">${"abcd"[i]})</td><td>${o}</td><td class="c"><span class="${right ? "verdict ok" : "verdict no"}">Bạn: ${t(mine)}</span><br><small>Đáp án: <b>${t(k[i])}</b></small></td></tr>`;
      }).join("") + `</table>`;
      ok = c === 4;
      body += `<p class="verdict ${ok ? "ok" : "no"}">Đúng ${c}/4 ý.</p>`;
    } else {
      ok = !!r_eqShort(a, k);
      body = `<p class="verdict ${ok ? "ok" : "no"}">Bạn trả lời: ${esc(a || "—")}. Đáp án: ${esc(k)}.</p>`;
    }
    const s = sol.solutions[q.id];
    html += `<article class="q ${ok ? "right-a" : "wrong-a"}"><div class="stem"><span class="q-n">Câu ${n}.</span>${q.stem}</div>${body}${s ? `<div class="sol"><b>Lời giải.</b> ${s}</div>` : ""}</article>`;
  });
  const box = $("#review");
  box.innerHTML = `<h2>Xem lại bài làm</h2>` + html;
  attachFigs(box, Object.assign({}, S.data.figs, sol.figs));
  typeset(box);
}
function r_eqShort(a, k) {
  const n = s => String(s ?? "").trim().replace(/\$/g, "").replace(/\{,\}/g, ",").replace(/\s/g, "").replace(/\./g, ",");
  const x = n(a), y = n(k);
  if (!x) return false;
  const fx = parseFloat(x.replace(",", ".")), fy = parseFloat(y.replace(",", "."));
  if (/^-?\d+(,\d+)?$/.test(x) && /^-?\d+(,\d+)?$/.test(y)) return Math.abs(fx - fy) < 1e-9;
  return x.toLowerCase() === y.toLowerCase();
}

init();
