'use strict';
/* =========================================================================
   Home Material Spec
   ตั้งค่า backend: ใส่ supabaseUrl และ supabaseKey เมื่อพร้อมใช้ฐานข้อมูลกลาง
   (ถ้าเว้นว่าง ข้อมูลจะเก็บในเบราว์เซอร์ของเครื่องนั้น)
   ========================================================================= */
/* anon key = public by design (safe in browser code); access is governed by the RLS policies in setup.sql.
   Never put the service_role key here. */
const CONFIG = {
  supabaseUrl: 'https://czyefarlcanffczymewb.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6eWVmYXJsY2FuZmZjenltZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NjAzMTcsImV4cCI6MjExMDMzNjMxN30.1BDNW0KWKxejxbXT5iazqYDW8aNPSwsrSHL83UyUbJo',
  bucket: 'hms'
};

const LIB = {
  pdf: { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e' },
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  supabase: { src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js', sri: 'sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug' }
};
const MAX_FILE = 25 * 1024 * 1024, MAX_PICK = 30, LOCK_TRIES = 5, LOCK_MS = 30000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
const ROLES = { owner: 'Homeowner (เจ้าของบ้าน)', contractor: 'Contractor (ผู้รับเหมา)', other: 'Other (อื่นๆ)' };
const META = [['owner', 'Owner (เจ้าของ)', 'user'], ['contractor', 'Contractor (ผู้รับเหมา)', 'tool'], ['location', 'Site (สถานที่)', 'pin']];
const TABS = [['photos', 'Site Photos', 'รูปวัสดุหน้างาน', 'camera'], ['plans', 'Drawings', 'แบบก่อสร้าง', 'doc'], ['chat', 'Chat', 'แชท', 'chat']];

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t, o) => t ? new Date(t).toLocaleString('th-TH', o) : '-';
const rid = p => p + Date.now().toString(36) + crypto.getRandomValues(new Uint32Array(2)).reduce((a, n) => a + n.toString(36), '');
const parentOf = p => p.slice(0, p.lastIndexOf('/'));
const leafOf = p => p.slice(p.lastIndexOf('/') + 1);
const safeName = s => (s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\.(jpe?g|png|webp|gif|pdf|zip)$/i, '').trim();
const icon = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const val = id => ($('#' + id)?.value || '').trim();
const toLocal = t => { const d = new Date(t || Date.now()); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const coarse = () => matchMedia('(pointer: coarse)').matches;
const store = k => ({ get(n) { try { return window[k].getItem(n); } catch { return null; } }, set(n, v) { try { window[k].setItem(n, v); } catch { } }, del(n) { try { window[k].removeItem(n); } catch { } } });
const LS = store('localStorage'), SS = store('sessionStorage');
const UID = LS.get('hms_uid') || (() => { const u = rid('u'); LS.set('hms_uid', u); return u; })();
const errMsg = (e, d = 'เกิดข้อผิดพลาด ลองอีกครั้ง') => (e && /[ก-๙]/.test(e.message || '')) ? e.message : d;
const empty = (ic, t, s = '') => `<div class="empty">${icon(ic, 'xl')}<b>${t}</b>${s ? `<p>${s}</p>` : ''}</div>`;
const field = (id, label, input, hint = '') => `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<small class="hint">${hint}</small>` : ''}<small class="ferr" id="${id}-err" role="alert"></small></div>`;
const transition = fn => (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) ? document.startViewTransition(fn) : fn();

function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3200);
}
function busy(b, on) { if (b) { b.disabled = on; b.classList.toggle('loading', on); } }
function invalid(id, msg) { const i = $('#' + id), e = $('#' + id + '-err'); if (e) e.textContent = msg; if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); } }
function loadJs({ src, sri }) {
  return new Promise((ok, no) => {
    const e = document.createElement('script'); e.src = src;
    if (sri) { e.integrity = sri; e.crossOrigin = 'anonymous'; }
    e.onload = ok; e.onerror = () => no(new Error('โหลดไลบรารีไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต')); document.head.append(e);
  });
}
function persist() { if (!persist.done && navigator.storage?.persist) { persist.done = 1; navigator.storage.persist().catch(() => { }); } }

/* ---------- security: hashed 4-digit code + lockout ---------- */
async function hashCode(code, salt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + code));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const checkCode = async (p, c) => /^\d{4}$/.test(c) && (p.codeHash ? (await hashCode(c, p.salt)) === p.codeHash : p.code === c);
const lockLeft = id => Math.max(0, +(LS.get('hms_lock_' + id) || 0) - Date.now());
function failCode(id) {
  const n = +(LS.get('hms_fail_' + id) || 0) + 1;
  if (n >= LOCK_TRIES) { LS.set('hms_lock_' + id, Date.now() + LOCK_MS); LS.del('hms_fail_' + id); return 0; }
  LS.set('hms_fail_' + id, n); return LOCK_TRIES - n;
}
function lockMsg(id, errId) {
  const e = $('#' + errId), left = lockLeft(id); if (!e) return;
  clearTimeout(lockMsg.t);
  if (!left) { e.textContent = ''; return; }
  e.textContent = `ใส่รหัสผิดหลายครั้ง กรุณารอ ${Math.ceil(left / 1000)} วินาที`;
  lockMsg.t = setTimeout(() => lockMsg(id, errId), 1000);
}

/* ---------- images & files ---------- */
let webpOk;
async function canWebp() {
  if (webpOk === undefined) { const c = document.createElement('canvas'); c.width = c.height = 1; const b = await new Promise(r => c.toBlob(r, 'image/webp', .8)); webpOk = b?.type === 'image/webp'; }
  return webpOk;
}
async function encode(bmp, max, q) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
  const type = (await canWebp()) ? 'image/webp' : 'image/jpeg';
  const b = await new Promise(r => c.toBlob(r, type, q));
  if (!b) throw new Error('แปลงรูปไม่สำเร็จ'); return b;
}
async function prepImage(f, max = 1600, thumb = 480) {
  if (f.size > MAX_FILE) throw new Error('ไฟล์ใหญ่เกิน 25 MB');
  let bmp;
  try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
  catch { try { bmp = await createImageBitmap(f); } catch { throw new Error(/hei[cf]/i.test(f.type + f.name) ? 'อ่านรูป HEIC ไม่ได้ กรุณาเปลี่ยนเป็น JPG ก่อน' : 'ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ'); } }
  try { return { full: await encode(bmp, max, .82), th: thumb ? await encode(bmp, thumb, .72) : null }; }
  finally { bmp.close?.(); }
}
async function isPdf(f) { return new TextDecoder().decode(await f.slice(0, 5).arrayBuffer()) === '%PDF-'; }
const ids = x => x.assets?.length ? x.assets : [x.asset].filter(Boolean);
const tids = x => x.thumbs?.length === ids(x).length ? x.thumbs : ids(x);
const fileIds = x => [...new Set([...ids(x), ...(x.thumbs || [])])];

async function saveBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (coarse() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

/* ---------- data layer (IndexedDB now, Supabase when configured) ---------- */
function makeHub(list) {
  const subs = new Map(), kick = p => subs.get(p)?.forEach(f => f());
  function watch(parent, cb, onErr) {
    let alive = true, running = false, again = false, last = null, failed = false;
    const run = async () => {
      if (!alive) return; if (running) { again = true; return; } running = true;
      try { const rows = await list(parent), sg = JSON.stringify(rows); failed = false; if (alive && sg !== last) { last = sg; cb(rows); } }
      catch (e) { if (alive && !failed) onErr?.(e); failed = true; }
      running = false; if (again) { again = false; run(); }
    };
    if (!subs.has(parent)) subs.set(parent, new Set()); subs.get(parent).add(run); run();
    return () => { alive = false; subs.get(parent)?.delete(run); };
  }
  return { kick, watch, kickAll: () => subs.forEach(s => s.forEach(f => f())) };
}

async function localBackend() {
  if (!window.indexedDB) throw new Error('no indexedDB');
  const db = await new Promise((ok, no) => {
    const r = indexedDB.open('hms', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('docs', { keyPath: 'path' }).createIndex('parent', 'parent'); d.createObjectStore('files', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  const tx = (st, mode, fn) => new Promise((ok, no) => {
    const t = db.transaction(st, mode), q = fn(t.objectStore(st)); let out;
    if (q) q.onsuccess = () => { out = q.result; };
    t.oncomplete = () => ok(out); t.onerror = t.onabort = () => no(t.error);
  });
  const urls = new Map();
  for (const f of await tx('files', 'readonly', s => s.getAll())) urls.set(f.id, URL.createObjectURL(f.blob));
  const hub = makeHub(async parent => (await tx('docs', 'readonly', s => s.index('parent').getAll(parent))).map(r => ({ id: leafOf(r.path), ...r.data })));
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('hms') : null;
  let q = Promise.resolve();
  if (bc) bc.onmessage = e => {
    const m = e.data || {};
    q = q.then(async () => {
      if (m.file && !urls.has(m.file)) { const f = await tx('files', 'readonly', s => s.get(m.file)); if (f) urls.set(f.id, URL.createObjectURL(f.blob)); }
      if (m.parent) hub.kick(m.parent);
    }).catch(() => { });
  };
  const changed = p => { hub.kick(p); bc?.postMessage({ parent: p }); };
  return {
    doc: path => ({
      set: async data => { await tx('docs', 'readwrite', s => s.put({ path, parent: parentOf(path), data })); changed(parentOf(path)); },
      delete: async () => { await tx('docs', 'readwrite', s => s.delete(path)); changed(parentOf(path)); }
    }),
    watch: hub.watch,
    url: id => urls.get(id) || '',
    async put(blob) { const id = rid('f'); await tx('files', 'readwrite', s => s.put({ id, blob })); urls.set(id, URL.createObjectURL(blob)); bc?.postMessage({ file: id }); return id; },
    async remove(id) { await tx('files', 'readwrite', s => s.delete(id)); const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } }
  };
}

async function supabaseBackend() {
  if (!window.supabase) await loadJs(LIB.supabase);
  const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const hub = makeHub(async parent => {
    const { data, error } = await sb.from('docs').select('path,data').eq('parent', parent).limit(5000);
    if (error) throw error; return data.map(r => ({ id: leafOf(r.path), ...r.data }));
  });
  sb.channel('hms-docs').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, pl => { const p = pl.new?.path || pl.old?.path; if (p) hub.kick(parentOf(p)); }).subscribe();
  setInterval(hub.kickAll, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) hub.kickAll(); });
  const base = `${CONFIG.supabaseUrl}/storage/v1/object/public/${CONFIG.bucket}/`;
  const ok = ({ error }) => { if (error) throw error; };
  return {
    doc: path => ({
      set: async data => { ok(await sb.from('docs').upsert({ path, parent: parentOf(path), data })); hub.kick(parentOf(path)); },
      delete: async () => { ok(await sb.from('docs').delete().eq('path', path)); hub.kick(parentOf(path)); }
    }),
    watch: hub.watch,
    url: id => id ? base + encodeURIComponent(id) : '',
    async put(blob) { const id = rid('f') + '.' + (EXT[blob.type] || 'bin'); ok(await sb.storage.from(CONFIG.bucket).upload(id, blob, { contentType: blob.type, cacheControl: '31536000' })); return id; },
    async remove(id) { ok(await sb.storage.from(CONFIG.bucket).remove([id])); }
  };
}

/* ---------- state ---------- */
let api;
const S = { projects: [], proj: null, tab: 'photos', cat: -1, photos: [], plans: [], chat: [], ready: {}, subs: [], role: null, q: '' };
const item = id => S[S.tab]?.find?.(x => x.id === id);
const loadRole = id => { try { const r = JSON.parse(LS.get('hms_role_' + id) || 'null'); return r && ROLES[r.r] ? r : null; } catch { return null; } };
const readTs = () => +(LS.get('hms_read_' + S.proj?.id) || 0);
const unread = () => S.chat.filter(m => m.u !== UID && (m.at || 0) > readTs()).length;
function markSeen() { if (S.proj && S.tab === 'chat' && S.chat.length) { LS.set('hms_read_' + S.proj.id, String(Math.max(...S.chat.map(m => m.at || 0)))); drawTabs(); } }

/* ---------- dialogs ---------- */
const dlg = () => $('#dlg');
let covUrl = '', pendCover, picked = [], pdfTok = 0;
function openModal(html, cls = '') {
  const d = dlg(); d.className = 'dlg ' + cls; d.innerHTML = html;
  if (!d.open) d.showModal();
  (d.querySelector('[autofocus]') || (coarse() ? d : d.querySelector('input:not([type=file]),textarea,select')) || d).focus?.({ preventScroll: true });
}
function closeModal() { const d = dlg(); if (d.open) d.close(); }
/* Full text of a truncated "…" line, in its own dialog stacked on top, so an open form underneath keeps its input. */
function showFull(text) {
  const d = $('#txt');
  d.innerHTML = `<div><div class="dhead"><h2>Details <small>(รายละเอียด)</small></h2><button class="icbtn" data-a="txtx" aria-label="Close (ปิด)">${icon('x')}</button></div><div class="dbody"><p class="fulltext"></p></div></div>`;
  $('.fulltext', d).textContent = text.trim();
  if (!d.open) d.showModal();
}
function cleanupModal() {
  picked.forEach(p => p.u && URL.revokeObjectURL(p.u)); picked = [];
  if (covUrl) { URL.revokeObjectURL(covUrl); covUrl = ''; }
  pdfTok++; dlg().innerHTML = '';
}

/* ---------- home ---------- */
function home() {
  S.subs.forEach(f => f()); S.subs = []; S.proj = null; document.body.classList.remove('in-proj');
  $('#app').innerHTML = `<section class="wrap home">
    <div class="pagehead"><button class="btn pri lg" data-a="newp">${icon('plus')}<span>Create Project <small>(สร้างโครงการ)</small></span></button>
      <div class="ptitle"><h1>My Projects <small>(โครงการของฉัน)</small></h1><p class="mu" id="pcount"></p></div></div>
    <label class="search" hidden>${icon('search')}<input id="pq" type="search" placeholder="Search projects (ค้นหาโครงการ)" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search" aria-label="Search projects"></label>
    <div id="plist" class="pgrid">${'<div class="pc sk"></div>'.repeat(3)}</div></section>`;
  if (S.loaded) drawProjects();
  window.scrollTo(0, 0);
}
const metaLines = p => META.map(([k, l, i]) => `<span class="meta">${icon(i, 'xs')}<span class="clip1 expand"><span class="mu">${l}:</span> ${p[k] ? esc(p[k]) : '-'}</span></span>`).join('');
function drawProjects() {
  const el = $('#plist'); if (!el) return;
  const q = S.q.trim().toLowerCase(), rows = S.projects.filter(p => !q || [p.name, p.owner, p.contractor, p.location].some(v => (v || '').toLowerCase().includes(q)));
  $('#pcount').textContent = S.projects.length ? `${S.projects.length} project${S.projects.length > 1 ? 's' : ''} (${S.projects.length} โครงการ)` : '';
  $('.search').hidden = S.projects.length < 4;
  if (!S.projects.length) { el.innerHTML = empty('folder', 'No projects yet (ยังไม่มีโครงการ)', 'Tap “Create Project” to start (กดสร้างโครงการเพื่อเริ่มต้น)'); return; }
  if (!rows.length) { el.innerHTML = empty('search', 'No matching projects (ไม่พบโครงการ)'); return; }
  el.innerHTML = rows.map(p => `<article class="pc">
    <div class="pc-cover">${p.cover ? `<img src="${esc(api.url(p.cover))}" alt="" loading="lazy" decoding="async">` : icon('home', 'xl')}<span class="pc-lock">${icon('lock', 'xs')}</span></div>
    <div class="pc-body"><h2 class="pc-name clip1 expand">${esc(p.name)}</h2>${metaLines(p)}<small class="mu">Created ${fmt(p.createdAt, { dateStyle: 'medium' })} (สร้างเมื่อ)</small>
      <button class="btn pri pc-open" data-a="open" data-id="${esc(p.id)}">${icon('lock')}<span>Open project <small>(เข้าโครงการ)</small></span></button></div></article>`).join('');
}

/* ---------- project form / gate ---------- */
function drawCov(u) {
  const w = $('#covw'); if (!w) return;
  w.innerHTML = u ? `<img src="${esc(u)}" alt="">` : `<span>${icon('image', 'lg')}No photo (ยังไม่มีรูป)</span>`;
  $('#covrm')?.toggleAttribute('hidden', !u);
}
function projForm(p) {
  const edit = !!p; pendCover = edit ? undefined : null;
  const inp = (id, v, ph, max = 80) => `<input id="${id}" maxlength="${max}" value="${esc(v || '')}" placeholder="${ph}" autocomplete="off">`;
  openModal(`<form class="form" data-f="${edit ? 'editp' : 'newp'}" novalidate>
    <div class="dhead"><h2>${edit ? 'Edit project <small>(แก้ไขโครงการ)</small>' : 'New Project <small>(สร้างโครงการใหม่)</small>'}</h2><button type="button" class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div class="dbody">
    ${field('fname', 'Project name (ชื่อโครงการ) *', inp('fname', p?.name, 'เช่น บ้านคุณสมชาย ซอยลาดพร้าว 71', 60))}
    ${edit ? '' : field('fcode', 'Project code, 4 digits (รหัสโครงการ 4 หลัก) *', '<input id="fcode" class="code" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">', 'ใช้รหัสนี้ทุกครั้งที่เข้าโครงการ กรุณาจดไว้ (Keep this code safe)')}
    <div class="field"><span class="lbl">Project photo (รูปโครงการ)</span><div class="covpick" id="covw"></div>
      <div class="row"><label class="btn ghost sm">${icon('image')}<span>Choose photo (เลือกรูป)</span><input id="pcov" class="vh" type="file" accept="image/*"></label>
      <button type="button" class="btn ghost sm" id="covrm" data-a="covrm" hidden>${icon('trash')}Remove (ลบรูป)</button></div></div>
    ${field('fowner', 'Owner name (ชื่อเจ้าของโครงการ)', inp('fowner', p?.owner, 'เช่น คุณสมชาย ใจดี'))}
    ${field('fcon', 'Contractor name (ชื่อผู้รับเหมา)', inp('fcon', p?.contractor, 'เช่น บริษัท รับเหมา จำกัด'))}
    ${field('floc', 'Site location (สถานที่ก่อสร้าง)', inp('floc', p?.location, 'เช่น ซอยลาดพร้าว 71 กรุงเทพฯ', 120))}
    </div>
    <div class="dfoot"><button type="button" class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn pri">${edit ? 'Save (บันทึก)' : 'Create (สร้างโครงการ)'}</button></div></form>`, 'wide');
  drawCov(p?.cover ? api.url(p.cover) : '');
}
async function createProject(btn) {
  const n = val('fname'), c = val('fcode');
  if (!n) return invalid('fname', 'กรุณาตั้งชื่อโครงการ');
  if (!/^\d{4}$/.test(c)) return invalid('fcode', 'รหัสต้องเป็นตัวเลข 4 หลัก');
  busy(btn, true); let cover = null;
  try {
    if (pendCover) cover = await api.put((await prepImage(pendCover, 1200, 0)).full);
    const id = rid('p'), salt = rid('s');
    const p = { name: n, codeHash: await hashCode(c, salt), salt, owner: val('fowner'), contractor: val('fcon'), location: val('floc'), cover, createdAt: Date.now() };
    await api.doc('projects/' + id).set(p); persist();
    SS.set('hms_ok_' + id, '1'); closeModal(); enter({ id, ...p }); toast('Project created (สร้างโครงการแล้ว)', 'ok');
  } catch (e) { if (cover) api.remove(cover).catch(() => { }); toast(errMsg(e, 'สร้างโครงการไม่สำเร็จ'), 'err'); busy(btn, false); }
}
async function saveProject(btn) {
  const n = val('fname'); if (!n) return invalid('fname', 'กรุณาตั้งชื่อโครงการ');
  busy(btn, true); const { id, ...old } = S.proj; let added = null;
  try {
    let cover = old.cover || null;
    if (pendCover !== undefined) { cover = pendCover ? (added = await api.put((await prepImage(pendCover, 1200, 0)).full)) : null; }
    const data = { ...old, name: n, owner: val('fowner'), contractor: val('fcon'), location: val('floc'), cover };
    await api.doc('projects/' + id).set(data);
    if (old.cover && old.cover !== cover) api.remove(old.cover).catch(() => { });
    S.proj = { id, ...data }; drawTop(); closeModal(); toast('Saved (บันทึกเรียบร้อย)', 'ok');
  } catch (e) { if (added) api.remove(added).catch(() => { }); toast(errMsg(e, 'บันทึกไม่สำเร็จ'), 'err'); busy(btn, false); }
}
function gate(id) {
  const p = S.projects.find(x => x.id === id); if (!p) return;
  if (SS.get('hms_ok_' + id)) { transition(() => enter(p)); return; }
  openModal(`<form class="form gate" data-f="gate" data-id="${esc(id)}" novalidate>
    <button type="button" class="icbtn close" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button>
    <div class="gate-ic">${icon('lock', 'lg')}</div><h2 class="clip1 expand">${esc(p.name)}</h2>
    <p class="mu">Enter the 4-digit project code<br>(ใส่รหัส 4 หลักเพื่อเข้าโครงการ)</p>
    <input id="gc" class="code big" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" aria-label="Project code (รหัสโครงการ)" enterkeyhint="go" autofocus>
    <p class="ferr center" id="ge" role="alert"></p>
    <div class="dfoot"><button type="button" class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn pri">Open (เข้าสู่โครงการ)</button></div></form>`, 'narrow');
  lockMsg(id, 'ge');
}
async function tryGate(id) {
  const p = S.projects.find(x => x.id === id), inp = $('#gc'); if (!p || !inp) return;
  if (lockLeft(id)) return lockMsg(id, 'ge');
  if (await checkCode(p, inp.value.trim())) { LS.del('hms_fail_' + id); SS.set('hms_ok_' + id, '1'); closeModal(); transition(() => enter(p)); return; }
  const left = failCode(id); inp.value = ''; inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
  if (left) $('#ge').textContent = `รหัสไม่ถูกต้อง (เหลืออีก ${left} ครั้ง)`; else lockMsg(id, 'ge');
}
function delProjForm() {
  openModal(`<form class="form" data-f="delp" novalidate>
    <div class="dhead"><h2>Delete project <small>(ลบโครงการ)</small></h2><button type="button" class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div class="dbody"><div class="warn">${icon('alert')}<p>รูป แบบก่อสร้าง และแชททั้งหมดของ<b class="clip1 expand">${esc(S.proj.name)}</b>จะถูกลบถาวร กู้คืนไม่ได้</p></div>
    ${field('dc', 'Enter project code to confirm (ใส่รหัส 4 หลักเพื่อยืนยัน)', '<input id="dc" class="code" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" enterkeyhint="done">')}</div>
    <div class="dfoot"><button type="button" class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn danger-fill">${icon('trash')}Delete (ลบ)</button></div></form>`, 'narrow');
  lockMsg(S.proj.id, 'dc-err');
}
async function delProject(btn) {
  const p = S.proj;
  if (lockLeft(p.id)) return lockMsg(p.id, 'dc-err');
  if (!(await checkCode(p, val('dc')))) { const l = failCode(p.id); return l ? invalid('dc', `รหัสไม่ถูกต้อง (เหลืออีก ${l} ครั้ง)`) : lockMsg(p.id, 'dc-err'); }
  if (!S.ready.photos || !S.ready.plans || !S.ready.chat) return invalid('dc', 'กำลังโหลดข้อมูล กรุณารอสักครู่แล้วลองใหม่');
  busy(btn, true);
  try {
    for (const k of ['photos', 'plans', 'chat']) for (const x of S[k]) {
      await api.doc(`projects/${p.id}/${k}/${x.id}`).delete();
      for (const a of fileIds(x)) await api.remove(a).catch(() => { });
    }
    if (p.cover) await api.remove(p.cover).catch(() => { });
    await api.doc('projects/' + p.id).delete();
    ['hms_role_', 'hms_read_', 'hms_fail_', 'hms_lock_'].forEach(k => LS.del(k + p.id)); SS.del('hms_ok_' + p.id);
    closeModal(); transition(home); toast('Project deleted (ลบโครงการแล้ว)', 'ok');
  } catch { toast('ลบไม่สำเร็จ ลองอีกครั้ง', 'err'); busy(btn, false); }
}

/* ---------- project screen ---------- */
function enter(p) {
  S.subs.forEach(f => f());
  Object.assign(S, { proj: p, projSeen: S.projects.some(x => x.id === p.id), tab: 'photos', cat: -1, photos: [], plans: [], chat: [], ready: {}, role: loadRole(p.id) });
  document.body.classList.add('in-proj');
  $('#app').innerHTML = `<section class="wrap ptop" id="ptop"></section>
    <nav class="tabs" id="tabs" role="tablist" aria-label="Project sections"></nav>
    <section class="wrap view" id="view"></section>
    <button class="fab" id="fab" data-a="add" aria-label="Add (เพิ่ม)">${icon('plus')}</button>`;
  drawTop(); drawTabs(); drawView(); window.scrollTo(0, 0);
  S.subs = ['photos', 'plans', 'chat'].map(k => api.watch(`projects/${p.id}/${k}`, rows => { S[k] = rows; S.ready[k] = true; onData(k); }, () => toast('โหลดข้อมูลไม่สำเร็จ', 'err')));
}
function onData(k) {
  if (k === 'chat') { S.chat.sort((a, b) => (a.at || 0) - (b.at || 0)); if (S.tab === 'chat') { drawMsgs(); markSeen(); } }
  else if (S.tab === k) { if (k === 'photos') drawCats(); drawList(); }
  drawTabs();
}
function drawTop() {
  const p = S.proj, el = $('#ptop'); if (!el) return;
  el.innerHTML = `<div class="phead">
    <button class="icbtn" data-a="home" aria-label="Back to projects (กลับ)">${icon('back')}</button>
    ${p.cover ? `<img class="pthumb" src="${esc(api.url(p.cover))}" alt="" data-a="zoom" data-src="${esc(api.url(p.cover))}">` : ''}
    <div class="ph-info"><h1 class="clip1 expand">${esc(p.name)}</h1><div class="ph-meta">${metaLines(p)}</div></div>
    <button class="btn ghost sm" data-a="editp" aria-label="Edit project (แก้ไขโครงการ)">${icon('edit')}<span class="hide-sm">Edit (แก้ไข)</span></button>
    <button class="btn danger sm" data-a="delp" aria-label="Delete project (ลบโครงการ)">${icon('trash')}<span>Delete <small class="hide-sm">(ลบโครงการ)</small></span></button></div>`;
}
function drawTabs() {
  const el = $('#tabs'); if (!el) return; const n = unread();
  el.innerHTML = TABS.map(([k, en, th, ic]) => {
    const extra = k === 'chat' ? (n ? `<span class="badge${n > (drawTabs.prev || 0) ? ' pop' : ''}">${n > 99 ? '99+' : n}</span>` : '') : (S.ready[k] ? `<span class="cnt">${S[k].length}</span>` : '');
    return `<button role="tab" aria-selected="${S.tab === k}" class="tab" data-a="tab" data-t="${k}">${icon(ic)}<span class="tl">${en}<small>${th}</small></span>${extra}</button>`;
  }).join('');
  drawTabs.prev = n; $('#fab').hidden = S.tab === 'chat';
}
function drawView() {
  const v = $('#view'); if (!v) return;
  if (S.tab === 'chat') return drawChat();
  const ph = S.tab === 'photos';
  v.innerHTML = `<div class="toolbar"><h2>${ph ? 'Site Photos <small>(รูปวัสดุหน้างาน)</small>' : 'Drawings <small>(แบบก่อสร้าง)</small>'}</h2>
    <button class="btn pri hide-sm" data-a="add">${icon('plus')}<span>${ph ? 'Add Photos (เพิ่มรูปวัสดุ)' : 'Attach Drawing (แนบแบบ)'}</span></button></div>
    <div class="layout${ph ? '' : ' one'}">${ph ? '<nav class="cats" id="cats" aria-label="Categories (หมวดงาน)"></nav>' : ''}<div id="list"></div></div>`;
  if (ph) drawCats(); drawList();
}
function drawCats() {
  const el = $('#cats'); if (!el) return;
  el.innerHTML = [[-1, 'All (ทั้งหมด)'], ...CATS.map((c, i) => [i, c])].map(([i, c]) =>
    `<button class="chip" data-a="cat" data-i="${i}" aria-pressed="${S.cat === i}"><span>${esc(c)}</span><span class="cnt">${i < 0 ? S.photos.length : S.photos.filter(x => x.cat === i).length}</span></button>`).join('');
}
function media(x) {
  const f = ids(x), t = tids(x);
  const one = k => `<img src="${esc(api.url(t[k]))}" alt="${esc(x.item || '')}" loading="lazy" decoding="async" data-a="zoom" data-src="${esc(api.url(f[k]))}">`;
  if (f.length < 2) return `<div class="media">${one(0)}</div>`;
  return `<div class="media gal"><div class="gtrack">${f.map((_, k) => one(k)).join('')}</div>
    <button class="gnav gl" data-a="gprev" aria-label="Previous (ก่อนหน้า)">${icon('chev-l')}</button><button class="gnav gr" data-a="gnext" aria-label="Next (ถัดไป)">${icon('chev-r')}</button><span class="gcnt">1/${f.length}</span></div>`;
}
function card(x, ph) {
  const pdf = x.kind === 'pdf', i = `data-id="${esc(x.id)}"`;
  return `<article class="item" ${i}>
    ${pdf ? `<button class="media pdfph" data-a="viewpdf" ${i} aria-label="View PDF (เปิดดู)">${icon('doc', 'xl')}<span>PDF</span></button>` : media(x)}
    <div class="in">${ph && CATS[x.cat] ? `<span class="tag clip1">${esc(CATS[x.cat])}</span>` : ''}
      <b class="clip1 expand">${esc(x.item || '(ไม่ระบุชื่อ)')}</b><time class="mu">${fmt(x.at, { dateStyle: 'medium', timeStyle: 'short' })}</time>
      ${x.note ? `<p class="note clip2 expand">${esc(x.note)}</p>` : ''}
      <div class="acts">${pdf ? `<button class="btn ghost sm" data-a="viewpdf" ${i}>${icon('eye')}View (เปิดดู)</button>` : `<button class="btn ghost sm" data-a="dl" ${i}>${icon('download')}<span><span class="hide-sm">Save </span>PDF<small class="hide-sm"> (บันทึก)</small></span></button>`}
      <button class="icbtn" data-a="more" ${i} aria-label="More actions (ตัวเลือกเพิ่มเติม)">${icon('more')}</button></div></div></article>`;
}
function drawList() {
  const el = $('#list'); if (!el) return; const ph = S.tab === 'photos';
  if (!S.ready[S.tab]) { el.innerHTML = `<div class="grid">${'<div class="item sk"></div>'.repeat(3)}</div>`; return; }
  const keep = {}; $$('.gtrack', el).forEach(t => { if (t.scrollLeft) keep[t.closest('[data-id]').dataset.id] = t.scrollLeft; });
  const rows = S[S.tab].filter(x => !ph || S.cat < 0 || x.cat === S.cat).sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!rows.length) { el.innerHTML = empty(ph ? 'camera' : 'doc', ph ? 'No photos yet (ยังไม่มีรูปในหมวดนี้)' : 'No drawings yet (ยังไม่มีแบบก่อสร้าง)', 'Tap + to add (กด + เพื่อเพิ่ม)'); return; }
  let h = '', day = '';
  if (ph) { for (const x of rows) { const k = fmt(x.at, { dateStyle: 'full' }); if (k !== day) { h += (day ? '</div>' : '') + `<h3 class="day">${k}</h3><div class="grid">`; day = k; } h += card(x, true); } h += '</div>'; }
  else h = `<div class="grid">${rows.map(x => card(x, false)).join('')}</div>`;
  el.innerHTML = h;
  for (const id in keep) { const t = el.querySelector(`[data-id="${CSS.escape(id)}"] .gtrack`); if (t) t.scrollLeft = keep[id]; }
}
function moreSheet(x) {
  const ph = S.tab === 'photos', pdf = x.kind === 'pdf', n = ids(x).length, i = `data-id="${esc(x.id)}"`;
  openModal(`<div class="sheet"><div class="dhead"><h2 class="clip1 expand">${esc(x.item || '(ไม่ระบุชื่อ)')}</h2><button class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div><div class="menu">
    <button data-a="dl" ${i}>${icon('download')}Save PDF (บันทึกเป็น PDF${!pdf && n > 1 ? ` ทั้ง ${n} รูป` : ''})</button>
    ${ph ? `<button data-a="addph" ${i}>${icon('plus')}Add photos (เพิ่มรูป)</button>` : ''}
    <button data-a="edititem" ${i}>${icon('edit')}${ph ? 'Edit details (แก้ไขรายละเอียด)' : 'Rename (แก้ไขชื่อ)'}</button>
    <button class="danger" data-a="del" ${i}>${icon('trash')}Delete (ลบ)</button></div></div>`, 'narrow');
}

/* ---------- add / edit items ---------- */
const combo = (v = '') => `<div class="combo"><input id="fi" maxlength="80" autocomplete="off" value="${esc(v)}" role="combobox" aria-expanded="false" aria-controls="cl" aria-autocomplete="list" placeholder="พิมพ์หรือเลือกจากรายการ"><button type="button" class="cbtn" data-a="cbtn" aria-label="Show list (แสดงรายการ)">${icon('chev-d')}</button><div id="cl" class="clist" role="listbox" hidden></div></div>`;
const catSel = c => `<select id="fc">${CATS.map((x, i) => `<option value="${i}"${i === c ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
function showList(all) {
  const sel = $('#fc'), cl = $('#cl'), fi = $('#fi'); if (!sel || !cl) return;
  const q = all ? '' : fi.value.trim().toLowerCase(), items = HINT[+sel.value].filter(h => !q || h.toLowerCase().includes(q));
  cl.innerHTML = items.map(h => `<button type="button" role="option" class="copt" data-a="copt" data-v="${esc(h)}">${esc(h)}</button>`).join('');
  cl.hidden = !items.length; fi.setAttribute('aria-expanded', String(!cl.hidden));
}
function hideList() { const c = $('#cl'); if (c && !c.hidden) { c.hidden = true; $('#fi')?.setAttribute('aria-expanded', 'false'); } }
function pickZone(ph) {
  return `<div class="field"><span class="lbl">${ph ? 'Photos (รูปถ่าย เลือกได้หลายรูป)' : 'Files (รูปภาพหรือ PDF)'}</span>
    <label class="drop" id="drop">${icon(ph ? 'camera' : 'upload', 'xl')}<b>${ph ? 'Take or choose photos' : 'Choose files'}</b><span class="mu">${ph ? 'แตะเพื่อถ่ายหรือเลือกรูป' : 'แตะเพื่อเลือกไฟล์'} · max 25 MB</span>
    <input id="ff" class="vh" type="file" multiple accept="${ph ? 'image/*' : 'image/*,application/pdf,.pdf'}"></label><div id="pv" class="pv"></div><small class="ferr" id="ff-err" role="alert"></small></div>`;
}
function addForm() {
  const ph = S.tab === 'photos'; picked = [];
  openModal(`<form class="form" data-f="add" novalidate>
    <div class="dhead"><h2>${ph ? 'Add Photos <small>(เพิ่มรูปวัสดุ)</small>' : 'Attach Drawing <small>(แนบแบบก่อสร้าง)</small>'}</h2><button type="button" class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div class="dbody">${pickZone(ph)}
    ${ph ? field('fc', 'Category (หมวดงาน)', catSel(S.cat < 0 ? 0 : S.cat)) : ''}
    ${field('fi', ph ? 'Material (รายการวัสดุ)' : 'Drawing name (ชื่อแบบ) – optional', ph ? combo() : '<input id="fi" maxlength="80" autocomplete="off" placeholder="ถ้าไม่ใส่ จะใช้ชื่อไฟล์">')}
    ${ph ? field('fd', 'Date & time (วันและเวลา)', `<input id="fd" type="datetime-local" value="${toLocal()}">`) + field('fn', 'Remark (หมายเหตุ)', '<textarea id="fn" maxlength="500" rows="3" placeholder="เช่น ขนาด ยี่ห้อ ล็อตที่ส่งมา ตำแหน่งที่ใช้"></textarea>') : ''}</div>
    <div class="dfoot"><div class="prog" id="prog" hidden><i></i></div><button type="button" class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn pri">Save (บันทึก)</button></div></form>`, 'wide');
}
function addPhForm(x) {
  picked = [];
  openModal(`<form class="form" data-f="addph" data-id="${esc(x.id)}" novalidate>
    <div class="dhead"><h2>Add photos <small>(เพิ่มรูป)</small></h2><button type="button" class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div class="dbody"><p class="mu">${esc(x.item || '(ไม่ระบุชื่อ)')} · ${ids(x).length} photo(s) now (ตอนนี้มี ${ids(x).length} รูป)</p>${pickZone(true)}</div>
    <div class="dfoot"><div class="prog" id="prog" hidden><i></i></div><button type="button" class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn pri">Save (บันทึก)</button></div></form>`, 'wide');
}
function editItem(x) {
  const ph = S.tab === 'photos';
  openModal(`<form class="form" data-f="edititem" data-id="${esc(x.id)}" novalidate>
    <div class="dhead"><h2>${ph ? 'Edit details <small>(แก้ไขรายละเอียด)</small>' : 'Rename <small>(แก้ไขชื่อ)</small>'}</h2><button type="button" class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div class="dbody">${ph ? field('fc', 'Category (หมวดงาน)', catSel(x.cat ?? 0)) : ''}
    ${field('fi', ph ? 'Material (รายการวัสดุ)' : 'Drawing name (ชื่อแบบ)', ph ? combo(x.item) : `<input id="fi" maxlength="80" autocomplete="off" value="${esc(x.item || '')}">`)}
    ${ph ? field('fd', 'Date & time (วันและเวลา)', `<input id="fd" type="datetime-local" value="${toLocal(x.at)}">`) + field('fn', 'Remark (หมายเหตุ)', `<textarea id="fn" maxlength="500" rows="3">${esc(x.note || '')}</textarea>`) : ''}</div>
    <div class="dfoot"><button type="button" class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn pri">Save (บันทึก)</button></div></form>`, 'wide');
}
function addPicked(files) {
  const ph = S.tab === 'photos', err = $('#ff-err'); let bad = 0;
  for (const f of files) {
    const img = f.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp|gif)$/i.test(f.name), pdf = !ph && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if ((!img && !pdf) || f.size > MAX_FILE || picked.length >= MAX_PICK) { bad++; continue; }
    picked.push({ f, u: img ? URL.createObjectURL(f) : '' });
  }
  if (err) err.textContent = bad ? `ข้ามไป ${bad} ไฟล์ (ชนิดไม่รองรับ ใหญ่เกิน 25 MB หรือเกิน ${MAX_PICK} ไฟล์)` : '';
  drawPv();
}
function drawPv() {
  const el = $('#pv'); if (!el) return;
  el.innerHTML = picked.map((p, i) => `<div class="pvi">${p.u ? `<img src="${p.u}" alt="">` : `${icon('doc')}<span>PDF</span>`}<button type="button" data-a="pvrm" data-i="${i}" aria-label="Remove (เอาออก)">${icon('x', 'xs')}</button></div>`).join('')
    + (picked.length ? `<p class="pvc mu">Selected ${picked.length} (เลือกแล้ว ${picked.length} ไฟล์) · tap above to add more</p>` : '');
  $('#drop')?.classList.toggle('has', picked.length > 0);
}
function prog(i, n) { const p = $('#prog'); if (!p) return; p.hidden = false; p.firstElementChild.style.width = Math.round((i / n) * 100) + '%'; }
async function uploadPhotos(files, onStep) {
  const full = [], th = [];
  try {
    for (let i = 0; i < files.length; i++) {
      onStep(i, files.length); const r = await prepImage(files[i]);
      full.push(await api.put(r.full)); th.push(await api.put(r.th));
    }
    onStep(files.length, files.length); return { full, th };
  } catch (e) { [...full, ...th].forEach(a => api.remove(a).catch(() => { })); throw e; }
}
async function saveAdd(btn) {
  const ph = S.tab === 'photos', files = picked.map(p => p.f), pid = S.proj.id;
  if (!files.length) { $('#ff-err').textContent = 'กรุณาเลือกไฟล์ก่อน'; return; }
  busy(btn, true);
  try {
    if (ph) {
      const { full, th } = await uploadPhotos(files, prog);
      await api.doc(`projects/${pid}/photos/${rid('i')}`).set({ cat: +$('#fc').value, item: val('fi'), note: val('fn'), asset: full[0], assets: full, thumbs: th, kind: 'img', fname: files[0].name, at: new Date($('#fd').value).getTime() || Date.now() });
    } else {
      for (let i = 0; i < files.length; i++) {
        prog(i, files.length); const f = files[i], name = val('fi') || f.name.replace(/\.[^.]+$/, ''), row = { item: files.length > 1 && val('fi') ? `${name} (${i + 1})` : name, fname: f.name, at: Date.now() };
        if (await isPdf(f)) { const a = await api.put(new Blob([f], { type: 'application/pdf' })); try { await api.doc(`projects/${pid}/plans/${rid('i')}`).set({ ...row, kind: 'pdf', asset: a }); } catch (e) { api.remove(a).catch(() => { }); throw e; } }
        else { const r = await prepImage(f, 2400, 480), a = await api.put(r.full), b = await api.put(r.th); try { await api.doc(`projects/${pid}/plans/${rid('i')}`).set({ ...row, kind: 'img', asset: a, assets: [a], thumbs: [b] }); } catch (e) { api.remove(a).catch(() => { }); api.remove(b).catch(() => { }); throw e; } }
      }
    }
    persist(); closeModal(); toast('Saved (บันทึกเรียบร้อย)', 'ok');
  } catch (e) { toast(errMsg(e, 'บันทึกไม่สำเร็จ'), 'err'); busy(btn, false); $('#prog')?.setAttribute('hidden', ''); }
}
async function saveAddPh(id, btn) {
  const files = picked.map(p => p.f); if (!files.length) { $('#ff-err').textContent = 'กรุณาเลือกรูปก่อน'; return; }
  busy(btn, true);
  try {
    const { full, th } = await uploadPhotos(files, prog), cur = S.photos.find(y => y.id === id);
    if (!cur) { [...full, ...th].forEach(a => api.remove(a).catch(() => { })); throw new Error('รายการนี้ถูกลบไปแล้ว'); }
    const { id: _, ...data } = cur, all = [...ids(cur), ...full];
    await api.doc(`projects/${S.proj.id}/photos/${id}`).set({ ...data, asset: all[0], assets: all, thumbs: [...tids(cur), ...th] });
    closeModal(); toast('Saved (บันทึกเรียบร้อย)', 'ok');
  } catch (e) { toast(errMsg(e, 'บันทึกไม่สำเร็จ'), 'err'); busy(btn, false); $('#prog')?.setAttribute('hidden', ''); }
}
async function saveItem(id, btn) {
  const cur = item(id); if (!cur) return closeModal();
  const ph = S.tab === 'photos', n = val('fi');
  if (!ph && !n) return invalid('fi', 'กรุณาใส่ชื่อ');
  busy(btn, true);
  try {
    const { id: _, ...d } = cur, nd = { ...d, item: n };
    if (ph) { nd.cat = +$('#fc').value; nd.note = val('fn'); nd.at = new Date($('#fd').value).getTime() || d.at; }
    await api.doc(`projects/${S.proj.id}/${S.tab}/${id}`).set(nd); closeModal(); toast('Saved (บันทึกเรียบร้อย)', 'ok');
  } catch { toast('บันทึกไม่สำเร็จ', 'err'); busy(btn, false); }
}
function confirmDel(x) {
  openModal(`<div class="confirm"><div class="gate-ic danger">${icon('trash', 'lg')}</div><h2>Delete this item? <small>(ลบรายการนี้?)</small></h2>
    <b class="clip1 expand">${esc(x.item || '(ไม่ระบุชื่อ)')}</b><p class="mu">รายการนี้และไฟล์ทั้งหมดจะถูกลบถาวร กู้คืนไม่ได้</p>
    <div class="dfoot"><button class="btn ghost" data-a="mclose">Cancel (ยกเลิก)</button><button class="btn danger-fill" data-a="delok" data-id="${esc(x.id)}">${icon('trash')}Delete (ลบ)</button></div></div>`, 'narrow');
}
async function delItem(x, btn) {
  busy(btn, true);
  try { await api.doc(`projects/${S.proj.id}/${S.tab}/${x.id}`).delete(); fileIds(x).forEach(a => api.remove(a).catch(() => { })); closeModal(); toast('Deleted (ลบแล้ว)', 'ok'); }
  catch { toast('ลบไม่สำเร็จ', 'err'); busy(btn, false); }
}

/* ---------- downloads & viewers ---------- */
/* PDF export: every saved file is a PDF. Each photo becomes one A4 page, drawn on a canvas with the
   page's own Sarabun font (so Thai renders exactly as on screen) and embedded as a JPEG in a small
   hand-written PDF, with no library or font embedding needed. Uploaded PDF drawings are saved as the original. */
const A4 = { w: 595.28, h: 841.89 }, PX = 1240, PY = Math.round(PX * A4.h / A4.w);
function wrapText(g, para, maxW) {
  const parts = window.Intl?.Segmenter ? [...new Intl.Segmenter('th', { granularity: 'word' }).segment(para)].map(s => s.segment) : [...para];
  const lines = []; let cur = '';
  for (const part of parts) {
    if (g.measureText(cur + part).width <= maxW) { cur += part; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    for (const ch of part.trimStart()) { if (g.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch; }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}
async function pdfPage(x, bmp, k, n) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), M = 70, W = PX - M * 2;
  c.width = PX; c.height = PY; g.fillStyle = '#fff'; g.fillRect(0, 0, PX, PY); g.textBaseline = 'top';
  let y = M;
  const text = (s, size, weight, color, maxLines) => {
    g.font = `${weight} ${size}px Sarabun, "Noto Sans Thai", sans-serif`; g.fillStyle = color;
    const lines = String(s).split('\n').flatMap(p => wrapText(g, p, W)).slice(0, maxLines);
    for (const line of lines) { g.fillText(line, M, y); y += size * 1.5; }
    y += 6;
  };
  text(`Home Material Spec · ${S.proj?.name || ''}`, 24, 600, '#5b6b80', 2);
  g.fillStyle = '#e0a43a'; g.fillRect(M, y, W, 4); y += 24;
  text(x.item || '(ไม่ระบุชื่อ)', 44, 700, '#0b1a2e', 3);
  const cat = Number.isInteger(x.cat) && CATS[x.cat] ? `หมวดงาน: ${CATS[x.cat]}` : '';
  text([cat, `วันเวลา: ${fmt(x.at, { dateStyle: 'long', timeStyle: 'short' })}`, n > 1 ? `รูปที่ ${k + 1} จาก ${n}` : ''].filter(Boolean).join('    ·    '), 26, 400, '#33465c', 3);
  if (x.note && k === 0) text(`หมายเหตุ: ${x.note}`, 26, 400, '#33465c', 6);
  y += 12;
  const foot = 50, boxH = PY - y - M - foot, s = Math.min(W / bmp.width, boxH / bmp.height), iw = bmp.width * s, ih = bmp.height * s;
  g.drawImage(bmp, M + (W - iw) / 2, y + (boxH - ih) / 2, iw, ih);
  g.font = '400 20px Sarabun, sans-serif'; g.fillStyle = '#8a97a8';
  g.fillText(`พิมพ์เมื่อ ${fmt(Date.now(), { dateStyle: 'medium', timeStyle: 'short' })}${n > 1 ? `   ·   หน้า ${k + 1}/${n}` : ''}`, M, PY - M - 20);
  return { w: PX, h: PY, jpg: new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', .88))).arrayBuffer()) };
}
function makePdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const put = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (id, head, stream) => { offs[id] = len; put(`${id} 0 obj\n${head}\n`); if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); } put('endobj\n'); };
  put('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const id = 3 + i * 3, draw = enc.encode(`q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`);
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, `<< /Length ${draw.length} >>`, draw);
    obj(id + 2, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>`, p.jpg);
  });
  const size = 3 + pages.length * 3, xref = len;
  put(`xref\n0 ${size}\n0000000000 65535 f \n${offs.slice(1, size).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function savePdf(x, btn) {
  busy(btn, true);
  try {
    const base = safeName(x.item || x.fname) || (x.kind === 'pdf' ? 'drawing' : 'photo');
    if (x.kind === 'pdf') await saveBlob(await (await fetch(api.url(x.asset))).blob(), base + '.pdf');
    else {
      await Promise.all(['700 44px Sarabun', '400 26px Sarabun', '600 24px Sarabun'].map(f => document.fonts?.load(f))).catch(() => { });
      const all = ids(x), pages = [];
      for (let k = 0; k < all.length; k++) {
        const bmp = await createImageBitmap(await (await fetch(api.url(all[k]))).blob());
        pages.push(await pdfPage(x, bmp, k, all.length)); bmp.close?.();
      }
      await saveBlob(makePdf(pages), base + '.pdf');
    }
    toast('Saved PDF (บันทึก PDF แล้ว)', 'ok');
  } catch (e) { toast(errMsg(e, 'บันทึก PDF ไม่สำเร็จ'), 'err'); }
  busy(btn, false);
}
async function pdfView(x) {
  const tok = ++pdfTok + 0;
  openModal(`<div class="pdfv"><div class="dhead"><h2 class="clip1 expand">${esc(x.item || x.fname || 'PDF')}</h2>
    <button class="btn ghost sm" data-a="dl" data-id="${esc(x.id)}">${icon('download')}<span class="hide-sm">Download (ดาวน์โหลด)</span></button><button class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div id="pgs" class="pgs"><p class="mu center"><span class="spin"></span> Loading… (กำลังโหลด)</p></div></div>`, 'full');
  const box = $('#pgs'), live = () => tok === pdfTok && box.isConnected;
  try {
    if (!window.pdfjsLib) { await loadJs(LIB.pdf); pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker; }
    const buf = await (await fetch(api.url(x.asset))).arrayBuffer(), doc = await pdfjsLib.getDocument({ data: buf }).promise;
    if (!live()) return; box.innerHTML = '';
    const w = Math.max(280, box.clientWidth - 16), dpr = Math.min(2, devicePixelRatio || 1);
    for (let n = 1; n <= doc.numPages; n++) {
      if (!live()) return;
      const pg = await doc.getPage(n), v1 = pg.getViewport({ scale: 1 }); let sc = w / v1.width * dpr;
      const area = v1.width * v1.height * sc * sc; if (area > 8e6) sc *= Math.sqrt(8e6 / area);
      const v = pg.getViewport({ scale: sc }), c = document.createElement('canvas');
      c.width = Math.floor(v.width); c.height = Math.floor(v.height); box.append(c);
      await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise; pg.cleanup();
    }
  } catch { if (live()) box.innerHTML = '<p class="ferr center">เปิดดูไฟล์นี้ไม่ได้ ลองกดดาวน์โหลดแทน (Cannot preview, try Download)</p>'; }
}
function about() {
  openModal(`<div class="aboutbox"><div class="dhead"><h2>About <small>(เกี่ยวกับ)</small></h2><button class="icbtn" data-a="mclose" aria-label="Close (ปิด)">${icon('x')}</button></div>
    <div class="dbody"><img src="logo.png" width="96" height="96" alt="" class="about-logo"><h3>Home Material Spec</h3><p class="mu sub">Material & Spec Check<br>(ตรวจวัสดุและสเปกงานก่อสร้าง)</p>
    <dl class="credits"><div><dt>Advisor (อาจารย์ที่ปรึกษา)</dt><dd>อาจารย์ศรันยู พรมศร</dd></div><div><dt>Developed by (จัดทำโดย)</dt><dd>นายวสุพล เปี่ยมจิตร</dd><dd>นายสุชาวัฒน์ นิสังกาศ</dd></div></dl></div></div>`, 'narrow');
}

/* ---------- chat ---------- */
function drawChat() {
  const v = $('#view');
  if (!S.role) {
    v.innerHTML = `<div class="chat-role card"><div class="gate-ic">${icon('chat', 'lg')}</div><h2>Who are you? <small>(คุณคือใคร)</small></h2>
      <p class="mu">Choose your role to join this project's chat (เลือกบทบาทก่อนเข้าแชทของโครงการนี้)</p>
      ${field('cn', 'Your name – optional (ชื่อของคุณ – ไม่บังคับ)', '<input id="cn" maxlength="30" autocomplete="nickname">')}
      <div class="rolegrid">${Object.entries(ROLES).map(([k, l]) => `<button class="btn ghost role" data-a="role" data-r="${k}"><span class="dot rt-${k}"></span>${l}</button>`).join('')}</div></div>`;
    return;
  }
  v.innerHTML = `<div class="chat card"><div class="chhead"><span class="rtag rt-${S.role.r}">${ROLES[S.role.r]}</span>${S.role.n ? `<b class="clip1 expand">${esc(S.role.n)}</b>` : ''}
    <button class="btn ghost sm" data-a="crole">Change role (เปลี่ยนบทบาท)</button></div>
    <div id="cmsgs" class="cmsgs" role="log" aria-live="polite"></div>
    <form class="csend" data-f="chat"><textarea id="ct" maxlength="1000" rows="1" placeholder="Type a message… (พิมพ์ข้อความ)" enterkeyhint="send" aria-label="Message (ข้อความ)"></textarea>
    <button class="btn pri sendbtn" aria-label="Send (ส่ง)">${icon('send')}</button></form></div>`;
  drawMsgs(true); markSeen();
}
function drawMsgs(force) {
  const el = $('#cmsgs'); if (!el) return;
  const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80, rows = S.chat.slice(-200); let h = '', day = '';
  if (!S.ready.chat) h = '<p class="mu center"><span class="spin"></span></p>';
  else if (!rows.length) h = empty('chat', 'No messages yet (ยังไม่มีข้อความ)', 'Start the conversation with your team (เริ่มคุยกับทีมได้เลย)');
  else {
    if (S.chat.length > 200) h = '<p class="mu center sm">Showing latest 200 (แสดง 200 ข้อความล่าสุด)</p>';
    for (const m of rows) {
      const d = fmt(m.at, { dateStyle: 'medium' }), mine = m.u === UID, r = ROLES[m.role] ? m.role : 'other';
      if (d !== day) { h += `<div class="cday"><span>${d}</span></div>`; day = d; }
      h += `<div class="msg${mine ? ' me' : ''}"><div class="mh"><span class="rtag rt-${r}">${ROLES[r]}</span>${m.name ? `<b>${esc(m.name)}</b>` : ''}<time>${fmt(m.at, { hour: '2-digit', minute: '2-digit' })}</time>
        ${mine ? `<button class="cdel" data-a="cdel" data-id="${esc(m.id)}" aria-label="Delete message (ลบข้อความ)">${icon('x', 'xs')}</button>` : ''}</div><div class="mt">${esc(m.text)}</div></div>`;
    }
  }
  el.innerHTML = h; if (force || near) el.scrollTop = el.scrollHeight;
}
function grow(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }
async function chatSend() {
  const t = $('#ct'), v = t?.value.trim(), b = $('.sendbtn'); if (!v || !S.role || b.disabled) return;
  busy(b, true);
  try { await api.doc(`projects/${S.proj.id}/chat/${rid('m')}`).set({ role: S.role.r, name: S.role.n || '', text: v, u: UID, at: Date.now() }); t.value = ''; grow(t); persist(); }
  catch { toast('ส่งข้อความไม่สำเร็จ', 'err'); }
  busy(b, false); if (!coarse()) t.focus();
}

/* ---------- events ---------- */
const A = {
  home: () => transition(home), about, newp: () => projForm(), open: d => gate(d.id), editp: () => projForm(S.proj), delp: delProjForm,
  covrm: () => { pendCover = null; drawCov(''); },
  tab: d => { if (S.tab === d.t) return; S.tab = d.t; drawTabs(); drawView(); if (coarse()) window.scrollTo(0, 0); },
  cat: d => { S.cat = +d.i; drawCats(); drawList(); $('#cats [aria-pressed=true]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); },
  add: () => addForm(),
  more: d => { const x = item(d.id); if (x) moreSheet(x); },
  addph: d => { const x = item(d.id); if (x) addPhForm(x); },
  edititem: d => { const x = item(d.id); if (x) editItem(x); },
  del: d => { const x = item(d.id); if (x) confirmDel(x); },
  delok: (d, el) => { const x = item(d.id); if (x) delItem(x, el); },
  dl: (d, el) => { const x = item(d.id); if (x) savePdf(x, el); },
  viewpdf: d => { const x = item(d.id); if (x) pdfView(x); },
  zoom: d => { const lb = $('#lb'); $('img', lb).src = d.src; lb.showModal(); },
  lbx: () => $('#lb').close(),
  gprev: (d, el) => { const t = el.parentElement.querySelector('.gtrack'); t.scrollBy({ left: -t.clientWidth, behavior: 'smooth' }); },
  gnext: (d, el) => { const t = el.parentElement.querySelector('.gtrack'); t.scrollBy({ left: t.clientWidth, behavior: 'smooth' }); },
  mclose: closeModal,
  txtx: () => $('#txt').close(),
  pvrm: d => { const p = picked.splice(+d.i, 1)[0]; if (p?.u) URL.revokeObjectURL(p.u); drawPv(); },
  cbtn: () => { const c = $('#cl'); if (c && !c.hidden) hideList(); else showList(true); },
  copt: d => { $('#fi').value = d.v; hideList(); },
  role: d => { S.role = { r: d.r, n: val('cn') }; LS.set('hms_role_' + S.proj.id, JSON.stringify(S.role)); drawChat(); },
  crole: () => { S.role = null; LS.del('hms_role_' + S.proj.id); drawChat(); },
  cdel: async (d, el) => {
    if (!el.dataset.arm) { el.dataset.arm = 1; el.classList.add('armed'); el.textContent = 'Delete? (ลบ?)'; setTimeout(() => { if (el.isConnected) { delete el.dataset.arm; el.classList.remove('armed'); el.innerHTML = icon('x', 'xs'); } }, 3000); return; }
    try { await api.doc(`projects/${S.proj.id}/chat/${d.id}`).delete(); } catch { toast('ลบไม่สำเร็จ', 'err'); }
  }
};
document.addEventListener('click', e => {
  if (!e.target.closest('.combo')) hideList();
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled) { A[el.dataset.a]?.(el.dataset, el); return; }
  const t = e.target.closest('.expand');
  if (t && (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1)) {
    showFull(t.textContent);
  }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-f]'); if (!f) return; e.preventDefault();
  const b = f.querySelector('button:not([type=button])'); if (b?.disabled) return;
  ({ newp: () => createProject(b), editp: () => saveProject(b), gate: () => tryGate(f.dataset.id), delp: () => delProject(b), add: () => saveAdd(b), addph: () => saveAddPh(f.dataset.id, b), edititem: () => saveItem(f.dataset.id, b), chat: chatSend })[f.dataset.f]?.();
});
document.addEventListener('input', e => {
  const t = e.target; t.removeAttribute('aria-invalid'); const fe = $('#' + t.id + '-err'); if (fe) fe.textContent = '';
  if (t.classList.contains('code')) { t.value = t.value.replace(/\D/g, '').slice(0, 4); if (t.id === 'gc' && t.value.length === 4) t.form.requestSubmit(); }
  else if (t.id === 'pq') { S.q = t.value; drawProjects(); }
  else if (t.id === 'fi' && $('#cl')) showList();
  else if (t.id === 'ct') grow(t);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'ff') { addPicked(t.files); t.value = ''; }
  else if (t.id === 'pcov') { const f = t.files[0]; t.value = ''; if (!f) return; if (!f.type.startsWith('image/') || f.size > MAX_FILE) return toast('กรุณาเลือกรูปภาพขนาดไม่เกิน 25 MB', 'err'); pendCover = f; if (covUrl) URL.revokeObjectURL(covUrl); covUrl = URL.createObjectURL(f); drawCov(covUrl); }
  else if (t.id === 'fc') hideList();
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'ct' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse()) { e.preventDefault(); chatSend(); }
  if (e.key === 'Escape') hideList();
});
document.addEventListener('dragover', e => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => e.target.closest?.('#drop')?.classList.remove('over'));
document.addEventListener('drop', e => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); d.classList.remove('over'); addPicked(e.dataTransfer.files); } });
let gtRaf = 0;
document.addEventListener('scroll', e => {
  const t = e.target; if (!t.classList?.contains('gtrack') || gtRaf) return;
  gtRaf = requestAnimationFrame(() => { gtRaf = 0; const c = t.parentElement.querySelector('.gcnt'); if (c) c.textContent = (Math.round(t.scrollLeft / t.clientWidth) + 1) + '/' + t.children.length; });
}, { capture: true, passive: true });

/* ---------- boot ---------- */
(async () => {
  const d = dlg();
  d.addEventListener('close', cleanupModal);
  d.addEventListener('click', e => { if (e.target === d) closeModal(); });
  $('#txt').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('#lb').addEventListener('click', e => { if (!e.target.closest('[data-a]') || e.target === $('#lb')) $('#lb').close(); });
  try { api = CONFIG.supabaseUrl && CONFIG.supabaseKey ? await supabaseBackend() : await localBackend(); }
  catch {
    $('#app').innerHTML = `<section class="wrap">${empty('alert', 'Cannot open the app (เปิดใช้งานไม่ได้)', CONFIG.supabaseUrl ? 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า' : 'เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ ลองปิดโหมดไม่ระบุตัวตน (Private) แล้วเปิดใหม่')}</section>`;
    return;
  }
  home();
  api.watch('projects', rows => {
    S.loaded = true; S.projects = rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!S.proj) return drawProjects();
    const cur = rows.find(x => x.id === S.proj.id);
    // gone from the list after we had seen it = deleted on another device (the age check covers a just-created project not listed yet)
    if (!cur) { if (S.projSeen || Date.now() - (S.proj.createdAt || 0) > 60000) { toast('โครงการนี้ถูกลบแล้ว (Project deleted)'); closeModal(); home(); } }
    else { S.projSeen = true; if (JSON.stringify(cur) !== JSON.stringify(S.proj)) { S.proj = cur; drawTop(); } }
  }, () => toast('โหลดโครงการไม่สำเร็จ', 'err'));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
