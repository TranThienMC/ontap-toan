/* Hàm dùng chung: gọi Apps Script, giải mã đề, xáo trộn có hạt giống */
const SITE = window.SITE || {};

async function api(action, data = {}, tries = 1) {
  if (!SITE.api || SITE.api.indexOf("http") !== 0) throw new Error("Trang chưa được nối với Google Sheet (thiếu apps_script_url trong cauhinh.json).");
  let lastErr;
  for (let k = 0; k < tries; k++) {
    try {
      // text/plain để không bị chặn CORS (không có preflight)
      const r = await fetch(SITE.api, { method: "POST", body: JSON.stringify({ action, ...data }) });
      const j = await r.json();
      if (!j.ok && j.busy) throw new Error(j.error);   // máy chủ bận → thử lại
      if (!j.ok) throw Object.assign(new Error(j.error || "Lỗi máy chủ"), { server: true, data: j });
      return j;
    } catch (e) {
      lastErr = e;
      if (e.server) throw e;
      if (k < tries - 1) await new Promise(res => setTimeout(res, 1500 * (k + 1) + Math.random() * 2500));
    }
  }
  throw new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại. (" + (lastErr && lastErr.message) + ")");
}

function b64ToBytes(b64) {
  const s = atob(b64); const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

async function decryptBin(url, keyB64) {
  const buf = new Uint8Array(await (await fetch(url, { cache: "no-cache" })).arrayBuffer());
  const key = await crypto.subtle.importKey("raw", b64ToBytes(keyB64), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function show(id) { $all(".screen").forEach(e => e.classList.add("hidden")); $("#" + id).classList.remove("hidden"); window.scrollTo(0, 0); }

function attachFigs(root, figs) {
  $all("img[data-fig]", root).forEach(img => {
    const svg = figs && figs[img.dataset.fig];
    if (!svg) { img.replaceWith(document.createTextNode("[Hình vẽ chưa hiển thị được]")); return; }
    img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  });
}

function typeset(root) {
  if (window.MathJax && MathJax.typesetPromise) return MathJax.typesetPromise([root]).catch(() => {});
  return new Promise(res => { window.__mjQueue = (window.__mjQueue || []).concat([() => MathJax.typesetPromise([root]).then(res)]); });
}

const PART_INFO = {
  MC: { name: "Phần I. Trắc nghiệm nhiều phương án lựa chọn", hint: "Mỗi câu chọn một phương án." },
  TF: { name: "Phần II. Trắc nghiệm đúng sai", hint: "Ở mỗi ý a), b), c), d) chọn Đúng hoặc Sai." },
  SA: { name: "Phần III. Trả lời ngắn", hint: "Mỗi câu ghi đáp số tối đa 4 ký tự, ví dụ: -1,5 hoặc 2357. Dấu chấm hay dấu phẩy đều được hiểu là dấu phẩy thập phân." },
};
const LETTERS = ["A", "B", "C", "D", "E", "F"];
