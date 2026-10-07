#!/usr/bin/env node
// ประกอบ index.html จากไฟล์ใน repo: src/base.html (ตัวแอปตั้งต้น ตัด SEED แล้ว) + src/shim.html (ชั้น Supabase)
// + patch ทั้งหมดใน tools/ — ไม่ต้องพึ่งไฟล์นอก repo
//
//   node tools/rebuild.js                    -> index.html (เว็บหลัก)
//   node tools/rebuild.js --staging          -> staging/index.html (เว็บทดลอง)
//   node tools/rebuild.js --check [--staging]  ไม่เขียนไฟล์ แค่เทียบกับไฟล์ที่มีอยู่ (ไม่ตรง = exit 1)
//   node tools/rebuild.js <ไฟล์ export.html>  ใช้ไฟล์ export ใหม่แทน src/base.html (ถ้ามี export ใหม่จาก host เดิม)
//
// - ขั้นที่ส่ง { staging: true } เข้าเฉพาะเว็บทดลอง — ผ่านแล้วค่อยลบ flag ออกเพื่อเข้าเว็บหลัก
// - เว็บทดลองเก็บข้อมูลแยกด้วย key ขึ้นต้น stg_ (แตะข้อมูลเว็บหลักไม่ได้)
// - ชั้น Supabase (shim) อยู่ที่ src/shim.html — แก้ shim ที่นั่น ไม่ใช่ใน index.html
// - ทุก patch มี "marker" ถ้าไฟล์ใหม่มีอยู่แล้ว (เช่นคุณย้าย fix ไปใส่ฝั่ง host เอง) จะข้ามให้
// - ถ้า anchor ไม่เจอ = โครงสร้างไฟล์เปลี่ยน สคริปต์จะหยุดพร้อมบอกว่าขั้นไหน ไม่เขียนทับครึ่งๆ กลางๆ

const fs = require('fs');
const path = require('path');

// anchor ทุกตัวเขียนด้วย \n — clone บน Windows (autocrlf) ได้ไฟล์ \r\n แล้วหา anchor ไม่เจอ
// อ่านไฟล์ข้อความทุกไฟล์ในสคริปต์นี้เป็น \n เสมอ (.gitattributes บังคับ LF อีกชั้น)
const readRaw = fs.readFileSync;
fs.readFileSync = (p, enc) => { const r = readRaw(p, enc); return typeof r === 'string' ? r.replace(/\r\n/g, '\n') : r; };

const ROOT = path.resolve(__dirname, '..');
const CUR = path.join(ROOT, 'index.html');
const ARGS = process.argv.slice(2);
const STAGING = ARGS.includes('--staging');
const CHECK = ARGS.includes('--check');
const NEW = ARGS.find(a => !a.startsWith('--')) || path.join(ROOT, 'src', 'base.html');
const OUT = STAGING ? path.join(ROOT, 'staging', 'index.html') : CUR;
if (!fs.existsSync(NEW)) {
  console.error('ไม่เจอ ' + NEW + '\nใช้: node tools/rebuild.js [ไฟล์ export.html] [--staging] [--check]');
  process.exit(1);
}

let s = fs.readFileSync(NEW, 'utf8').replace(/\r\n/g, '\n');
const done = [], skipped = [];
let group = null;

function rep(a, b, label, all) {
  if (!s.includes(a)) throw new Error('[' + (group || label) + '] หา anchor ไม่เจอ: ' + label);
  if (all) { while (s.includes(a)) s = s.replace(a, b); } else s = s.replace(a, b);
}
// ทำทั้งกลุ่ม หรือข้ามทั้งกลุ่มถ้าไฟล์มี marker อยู่แล้ว
function step(label, marker, fn, opts) {
  group = label;
  if (opts && opts.staging && !STAGING) { skipped.push(label + ' (เฉพาะเว็บทดลอง)'); return; }
  if (marker && s.includes(marker)) { skipped.push(label); return; }
  fn();
  done.push(label);
}

// ================= 1) shim Supabase =================
// shim อยู่ใน src/shim.html (ตัวตั้งต้น ก่อน patch ของขั้นหลังๆ เช่น setIfUnchanged)
// เดิมก๊อปจาก index.html ปัจจุบัน -> ผลลัพธ์วนกลับมาเป็น input ตัวเอง แล้ว marker ของขั้นหลังพาข้ามโดยไม่ตั้งใจ
step('shim Supabase', '<!-- ============================================================\n     Supabase storage shim', () => {
  const shim = fs.readFileSync(path.join(ROOT, 'src', 'shim.html'), 'utf8').replace(/\r\n/g, '\n');
  if (!shim.includes('Supabase storage shim')) throw new Error('src/shim.html ไม่ใช่ shim');
  const app = s.indexOf('<script>\nconst SEED_RECURRING');
  if (app < 0) throw new Error('ไม่เจอจุดเริ่ม script ของแอป');
  s = s.slice(0, app) + shim + s.slice(app);
});

// ================= 2) ตัด SEED =================
step('ตัด SEED (ข้อมูลจริงอยู่ Supabase)', 'const SEED_RECURRING = [];', () => {
  for (const [k, empty] of Object.entries({ SEED_RECURRING: '[]', SEED_NEW: '[]', CODE_GDRIVE_MAP: '{}', CODE_PENDING_MAP: '{}', SEED_EXPENSES: '[]', SEED_SCHEDULE: '[]' })) {
    const re = new RegExp('^const ' + k + ' = .*$', 'm');
    if (!re.test(s)) throw new Error('ไม่เจอ ' + k);
    s = s.replace(re, 'const ' + k + ' = ' + empty + '; // ข้อมูลจริงย้ายไป Supabase แล้ว (backup: seed-backup.json)');
  }
});

// ================= 3) safeUrl =================
step('safeUrl กัน javascript: ใน href', 'function safeUrl(', () => {
  const safeUrl = fs.readFileSync(path.join(__dirname, 'safeurl.js'), 'utf8').replace(/\n$/, '');
  rep(
    "function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }",
    "function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }\n" +
    "// ลิงก์ที่ผู้ใช้กรอกเอง: อนุญาตแค่ http/https/mailto — กัน javascript: ที่กดแล้วรันโค้ด\n" + safeUrl, 'esc()');
  for (const v of ['l.url', 'item.link', 'item.gdrive', 'e.link']) rep('href="${esc(' + v + ')}"', 'href="${safeUrl(' + v + ')}"', 'href ' + v, true);
  for (const v of ['item.link', 'item.gdrive']) rep("href=\"${esc(" + v + ")||'#'}\"", 'href="${safeUrl(' + v + ')}"', 'href ' + v + ' ||#', true);
  if (s.includes('href="${esc(')) throw new Error('ยังมี href ที่ไม่ผ่าน safeUrl');
});

// ================= 4) pruneTrash =================
step('pruneTrash (cap ถังขยะ)', 'function pruneTrash(', () => {
  rep('    item\n  });\n  await persistTrash();', '    item\n  });\n  pruneTrash();\n  await persistTrash();', 'moveToTrash');
  rep('async function moveToTrash(coll, item){',
`// ถังขยะโตไม่จำกัด = ทุกครั้งที่เซฟต้องเขียน blob ใหญ่ขึ้นเรื่อยๆ
const TRASH_MAX = 200;      // เก็บมากสุดกี่รายการ
const TRASH_KEEP_DAYS = 30; // เก็บนานกี่วัน
function pruneTrash(){
  const cutoff = Date.now() - TRASH_KEEP_DAYS * 86400000;
  trash = trash.filter(t=>{
    const ts = t.deletedAt ? Date.parse(t.deletedAt) : NaN;
    return isNaN(ts) ? true : ts >= cutoff;   // ไม่มีวันที่/อ่านไม่ออก = เก็บไว้ก่อน
  });
  if(trash.length > TRASH_MAX) trash = trash.slice(-TRASH_MAX);
}

async function moveToTrash(coll, item){`, 'pruneTrash def');
});

// ================= 5) debounce + flush + retry =================
step('debounce 700ms + flushSaveNow + retry', 'SAVE_DEBOUNCE_MS', () => {
  rep(
`let saveChain = Promise.resolve();
let saveInFlight = 0; // >0 = กำลังเซฟ (poll ต้องไม่เอา remote มาทับข้อมูลในเครื่องช่วงนี้)
function persistData(toast){
  saveInFlight++;
  saveChain = saveChain.then(()=>persistDataNow(toast)).catch(()=>{}).finally(()=>{ saveInFlight--; });
  return saveChain;
}`,
`let saveChain = Promise.resolve();
let saveInFlight = 0; // >0 = กำลังเซฟ (poll ต้องไม่เอา remote มาทับข้อมูลในเครื่องช่วงนี้)

// รวบการแก้ที่ติดๆ กันเป็นการเขียนครั้งเดียว (ติ๊ก 4 ช่องรวด = เขียน 1 ครั้ง ไม่ใช่ 4)
const SAVE_DEBOUNCE_MS = 700;
let saveTimer = null;
let saveWaiter = null;   // {promise, resolve} ของรอบที่กำลังรออยู่
let saveToastWanted = false;

function persistData(toast){
  if(toast) saveToastWanted = true;
  if(!saveWaiter){
    let resolve;
    const promise = new Promise(r=>{ resolve = r; });
    saveWaiter = { promise, resolve };
  }
  const waiter = saveWaiter;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(runQueuedSave, SAVE_DEBOUNCE_MS);
  return waiter.promise;
}

function runQueuedSave(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  const waiter = saveWaiter;
  if(!waiter) return saveChain;
  saveWaiter = null;
  const toast = saveToastWanted;
  saveToastWanted = false;
  saveInFlight++;
  saveChain = saveChain.then(()=>persistDataNow(toast)).catch(()=>{}).finally(()=>{ saveInFlight--; });
  saveChain.then(()=>waiter.resolve(), ()=>waiter.resolve());
  return saveChain;
}

// เขียนทันทีไม่ต้องรอ debounce — ใช้ตอนปิดหน้า/สลับแท็บ/ก่อนกู้คืนข้อมูล
function flushSaveNow(){
  return saveWaiter ? runQueuedSave() : saveChain;
}

// ลองเขียนใหม่เองเมื่อเน็ตกลับมา (ไม่ซ้อนกัน — มีตัวจับเวลาเดียว)
let saveRetryTimer = null;
function scheduleSaveRetry(){
  if(saveRetryTimer) return;
  saveRetryTimer = setTimeout(()=>{ saveRetryTimer = null; persistData(false); }, 5000);
}`, 'persistData');
});

// ================= 6) persistDataNow: ห้ามเขียนถ้าอ่านของเดิมไม่ได้ =================
step('persistDataNow ไม่เขียนเมื่ออ่านไม่ได้', 'อ่านของปัจจุบันไม่ได้ = ไม่รู้ว่ากำลังจะทับอะไร', () => {
  rep(
`async function persistDataNow(toast){
  try{
    let remote = null;
    try{
      const res = await window.storage.get('appdata', true);
      if(res && res.value) remote = JSON.parse(res.value);
    }catch(e){ remote = null; }
    let pulledExternal = false;`,
`async function persistDataNow(toast){
  try{
    let remote = null;
    let readFailed = false;
    try{
      const res = await window.storage.get('appdata', true);
      if(res && res.value) remote = JSON.parse(res.value);
    }catch(e){ readFailed = true; }
    // อ่านของปัจจุบันไม่ได้ = ไม่รู้ว่ากำลังจะทับอะไร -> ไม่เขียน เก็บงานไว้ในเครื่องแล้วลองใหม่
    if(readFailed){
      showToast('เชื่อมต่อไม่ได้ ยังไม่ได้บันทึก — จะลองใหม่ให้เอง');
      scheduleSaveRetry();
      return;
    }
    let pulledExternal = false;`, 'persistDataNow head');
  rep(
`  }catch(e){ showToast('บันทึกไม่สำเร็จ — จะลองใหม่ตอนแก้ครั้งถัดไป'); }
}`,
`  }catch(e){
    showToast('บันทึกไม่สำเร็จ — จะลองใหม่ให้เอง');
    scheduleSaveRetry();
  }
}`, 'persistDataNow catch');
});

// ================= 7) pollOnce ข้ามเมื่อมีงานรอเซฟ =================
step('pollOnce ข้ามเมื่อมีงานรอเซฟ', 'saveWaiter || saveTimer || saveInFlight', () => {
  rep(
`async function pollOnce(){
  let changed = false;`,
`async function pollOnce(){
  // มีงานรอเซฟ (debounce) หรือกำลังเซฟ -> ข้ามรอบนี้ กัน setColl() ทับการแก้ที่ยังไม่ได้ส่ง
  if(saveWaiter || saveTimer || saveInFlight) return;
  let changed = false;`, 'pollOnce');
});

// ================= 8) อ่านไม่ได้ตอนบูต = หยุด ไม่ seed =================
step('getAppData/loadAll ไม่ seed เมื่ออ่านไม่ได้', "throw new Error('READ_FAILED')", () => {
  rep(
`async function getAppData(){
  let obj = null;
  try{
    const res = await window.storage.get('appdata', true);
    if(res && res.value) obj = JSON.parse(res.value);
  }catch(e){ obj = null; }
  if(obj && typeof obj==='object') return obj;`,
`// โยน READ_FAILED เมื่ออ่านไม่สำเร็จ — ห้ามให้ผู้เรียกเข้าใจผิดว่า "ยังไม่มีข้อมูล"
// แล้วไป seed ค่าว่างทับข้อมูลจริงของทีม
async function getAppData(){
  let obj = null;
  let readFailed = false;
  try{
    const res = await window.storage.get('appdata', true);
    if(res && res.value) obj = JSON.parse(res.value);
  }catch(e){ readFailed = true; }
  if(obj && typeof obj==='object') return obj;
  if(readFailed) throw new Error('READ_FAILED');`, 'getAppData');
  rep(
`  return found ? legacy : null;
}`,
`  if(found) return legacy;
  if(readFailed) throw new Error('READ_FAILED');
  return null;   // อ่านได้จริง แต่ยังไม่มีข้อมูล = เปิดใช้ครั้งแรก
}`, 'getAppData legacy');
  rep(`  const app = await getAppData();`,
`  let app;
  try{
    app = await getAppData();
  }catch(e){
    showLoadFailed();   // อ่านข้อมูลไม่ได้ -> ห้าม seed ห้ามเขียน ไม่งั้นทับข้อมูลทีมด้วยค่าว่าง
    return;
  }`, 'loadAll');
  rep(`async function loadAll(){`,
`// อ่านข้อมูลไม่สำเร็จตอนเปิดหน้า — แสดงข้อความ ไม่แตะข้อมูลใดๆ
function showLoadFailed(){
  const el = document.getElementById('mainContent');
  if(el){
    el.innerHTML = '<div class="empty-state" style="padding:40px 16px; text-align:center;">' +
      '<div style="font-size:15px; font-weight:700; margin-bottom:6px;">โหลดข้อมูลไม่สำเร็จ</div>' +
      '<div style="font-size:13px; color:var(--ink-soft); margin-bottom:16px;">' +
      'ต่อเน็ตไม่ได้ หรือเซสชันหมดอายุ — ข้อมูลบนเซิร์ฟเวอร์ยังอยู่ครบ ไม่ได้ถูกแตะ</div>' +
      '<button class="btn btn-primary" onclick="location.reload()">ลองใหม่</button></div>';
  }
  showToast('โหลดข้อมูลไม่สำเร็จ — ยังไม่ได้แก้ไขอะไรบนเซิร์ฟเวอร์');
}

async function loadAll(){`, 'showLoadFailed');
});

// ================= 9) realtime + poll 12 วิ =================
step('realtime + poll คงที่ 12 วิ', 'const POLL_MS', () => {
  rep(
`function startRealtimeSync(){
  if(pollTimer) return;
  startPollTimer();
  // พักการซิงก์เมื่อสลับไปแท็บอื่น (ลดโหลด storage ตอนเปิดค้างไว้เฉยๆ) — กลับมาแล้วดึงทันที
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){
      flushActivityNow();
      stopPollTimer();
    } else {
      pollOnce();       // ดึงข้อมูลล่าสุดทันทีที่กลับมา
      startPollTimer(); // เริ่มซิงก์ต่อ
    }
  });
  // เขียนประวัติที่ค้างก่อนปิดหน้า
  window.addEventListener('beforeunload', ()=>{ flushActivityNow(); });
}
function startPollTimer(){
  if(pollTimer) return;
  pollTimer = setInterval(pollOnce, 12000); // เช็คทุก 12 วินาที
}`,
`// Realtime: ทีมเห็นการแก้ของกันภายใน <1 วิ — poll เหลือไว้เป็นตัวสำรองเฉยๆ
let rtState = null;
let currentPollMs = 0;

function startRealtimeSync(){
  if(pollTimer) return;
  if(window.storage && window.storage.subscribe){
    try{
      rtState = window.storage.subscribe('appdata', true, ()=>{ pollOnce(); });
      window.__rtState = rtState;   // ให้ storage.realtimeInfo() อ่านได้
    }catch(e){ rtState = null; }
  }
  startPollTimer();
  // พักการซิงก์เมื่อสลับไปแท็บอื่น (และเขียนของค้างให้จบก่อน)
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){
      flushActivityNow();
      flushSaveNow();
      stopPollTimer();
    } else {
      pollOnce();       // ดึงข้อมูลล่าสุดทันทีที่กลับมา
      startPollTimer(); // เริ่มซิงก์ต่อ
      // มือถือมักตัด websocket ตอนหน้าจอดับ — ต่อใหม่เมื่อกลับมา
      if(rtState && rtState.reconnect && rtState.status !== 'SUBSCRIBED') rtState.reconnect();
    }
  });
  // เขียนของที่ค้างก่อนปิดหน้า
  window.addEventListener('beforeunload', ()=>{ flushActivityNow(); flushSaveNow(); });
  // beforeunload ไม่รับประกันว่าคำขอจะออกทัน — pagehide ยิงในกรณีที่ beforeunload ไม่ยิง (มือถือ)
  window.addEventListener('pagehide', ()=>{ flushActivityNow(); flushSaveNow(); });
}

// poll คงที่ 12 วิ ตลอด — ตอนนี้มันถามแค่ updated_at (~200 bytes) ถูกมาก
// realtime เป็นแค่ตัวเร่งให้เห็นไวขึ้น ถ้ามันเงียบก็ยังได้ 12 วิเหมือนเดิม ไม่แย่ลง
const POLL_MS = 12000;
function startPollTimer(){
  if(pollTimer) return;
  currentPollMs = POLL_MS;
  pollTimer = setInterval(pollOnce, POLL_MS);
}`, 'startRealtimeSync');
});

// ================= 10) เล็กๆ =================
step('ล้างคำค้นตอนสลับแท็บ', "searchText = '';   // คำค้น", () => {
  rep(`function switchTab(tab){\n  activeTab = tab;`,
      `function switchTab(tab){\n  activeTab = tab;\n  searchText = '';   // คำค้นเป็นตัวแปรเดียวใช้ร่วมกัน 2 แท็บ — ไม่ล้างแล้วอีกแท็บโดนกรองแบบไม่รู้ตัว`, 'switchTab');
});
step('flush ก่อน import', 'await flushSaveNow();   // เขียนของค้าง', () => {
  rep(`async function importData(event){\n  const file = event.target.files && event.target.files[0];`,
      `async function importData(event){\n  await flushSaveNow();   // เขียนของค้างให้จบก่อน กันเซฟเก่าทับข้อมูลที่เพิ่งกู้คืน\n  const file = event.target.files && event.target.files[0];`, 'importData');
});

// ================= 11) มือถือ =================
step('CSS มือถือ (header/tabs/filter)', '.filter-toggle{ display:none; }', () => {
  const css = fs.readFileSync(path.join(__dirname, 'mobile.css'), 'utf8');
  rep('</style>', css + '</style>', 'style');
});
step('stat-min (ซ่อน stat รองบนมือถือ)', 'stat-chip stat-min', () => {
  rep('<div class="stat-chip"><b>${total}</b> เรื่องประจำ</div>', '<div class="stat-chip stat-min"><b>${total}</b> เรื่องประจำ</div>', 'total');
  rep('<div class="stat-chip"><b>${newStories.length}</b> เรื่องเปิดใหม่</div>', '<div class="stat-chip stat-min"><b>${newStories.length}</b> เรื่องเปิดใหม่</div>', 'new');
  rep('<div class="stat-chip"><b>${upcoming}</b> เรื่องจะเปิดเร็วๆนี้</div>', '<div class="stat-chip stat-min"><b>${upcoming}</b> เรื่องจะเปิดเร็วๆนี้</div>', 'upcoming');
  rep("<div class=\"stat-chip\"><b>${totalSpent.toLocaleString('th-TH')}</b> บาทที่ใช้ไป</div>", "<div class=\"stat-chip stat-min\"><b>${totalSpent.toLocaleString('th-TH')}</b> บาทที่ใช้ไป</div>", 'spent');
});
step('filter panel ยุบได้บนมือถือ', 'function filterToggleHtml', () => {
  const a = s.indexOf('    ${workloadPanelHtml()}');
  const b = s.indexOf('\n  `;', a);
  if (a < 0 || b < 0) throw new Error('ไม่เจอบล็อกตัวกรองใน renderRecurring');
  const inner = s.slice(a, b);
  // ลิงก์รายวันไม่ใช่ตัวกรอง — เอาออกมาอยู่นอกแผงยุบ ไม่งั้นบนมือถือต้องกด "ตัวกรอง" ก่อนถึงเห็น
  const innerNoLinks = inner.replace('    ${dayLinksBarHtml()}\n', '');
  if (innerNoLinks === inner) throw new Error('ไม่เจอ dayLinksBarHtml ในบล็อกตัวกรอง');
  s = s.slice(0, a) + '    ${dayLinksBarHtml()}\n    ${filterToggleHtml()}\n    <div class="filter-panel${filtersOpen?\' open\':\'\'}">\n' + innerNoLinks + '\n    </div>' + s.slice(b);
  rep('function renderRecurring(){',
`// ตัวกรองบนมือถือ: ยุบไว้ใต้ปุ่ม (เดสก์ท็อปโชว์ตลอด — CSS จัดการเอง)
let filtersOpen = false;
function toggleFilters(){ filtersOpen = !filtersOpen; renderRecurring(); }
function filterSummary(){
  const bits = [];
  if(dayFilter && dayFilter !== 'ทั้งหมด') bits.push(dayFilter);
  if(personFilter && personFilter !== 'ทั้งหมด') bits.push(personFilter);
  if(showOnlyPending) bits.push('เฉพาะตอนค้าง');
  if(showDropped) bits.push('ดรอป/จบ');
  return bits.length ? ' · ' + bits.join(' · ') : '';
}
function filterToggleHtml(){
  const label = filtersOpen ? '✕ ปิดตัวกรอง' : '🔍 ตัวกรอง' + esc(filterSummary());
  return '<button class="btn btn-ghost filter-toggle" onclick="toggleFilters()" style="margin-bottom:10px;">' + label + '</button>';
}

function renderRecurring(){`, 'renderRecurring');
});

// ================= 12) "วันนี้" = เปลี่ยนวันตอน 2 ทุ่ม ทุกที่ =================
step('วันเปลี่ยนตอน 2 ทุ่ม (นิยามเดียว)', 'function effectiveNow()', () => {
  rep(
`function todayWeekdayIndex(){
  // JS getDay(): 0=Sun..6=Sat -> convert to 0=Mon..6=Sun to match WEEKDAY_ONLY order
  return (new Date().getDay() + 6) % 7;
}`,
`// วันทำงานเปลี่ยนตอน 2 ทุ่ม ไม่ใช่เที่ยงคืน — ก่อน 20:00 ยังนับเป็น "เมื่อวาน"
// ทุกอย่างที่เกี่ยวกับ "วันนี้คือวันอะไร" (ตัวกรอง, เลยกำหนด, รีเซ็ตรายสัปดาห์) ต้องใช้ตัวนี้ตัวเดียว
const DAY_ROLLOVER_HOUR = 20;
function effectiveNow(){
  const d = new Date();
  d.setHours(d.getHours() - DAY_ROLLOVER_HOUR);   // เลื่อนถอย 20 ชม. -> 19:59 กลายเป็น 23:59 ของเมื่อวาน
  return d;
}
function todayWeekdayIndex(){
  // JS getDay(): 0=Sun..6=Sat -> convert to 0=Mon..6=Sun to match WEEKDAY_ONLY order
  return (effectiveNow().getDay() + 6) % 7;
}`, 'todayWeekdayIndex');
  rep(
`const DAY_ROLLOVER_HOUR = 20;
function effectiveTodayIndex(){
  let idx = todayWeekdayIndex();
  if(new Date().getHours() < DAY_ROLLOVER_HOUR) idx = (idx + 6) % 7; // ก่อน 2 ทุ่ม = ยังเป็นวันก่อนหน้า
  return idx;
}`,
`// (คงชื่อไว้ให้โค้ดเดิมเรียกได้ — ตอนนี้ todayWeekdayIndex() คิด 2 ทุ่มให้แล้ว)
function effectiveTodayIndex(){ return todayWeekdayIndex(); }`, 'effectiveTodayIndex');
  rep(
`function currentWeekMondayStr(){
  const now = new Date();
  const idx = (now.getDay()+6)%7; // 0=Mon..6=Sun`,
`function currentWeekMondayStr(){
  const now = effectiveNow();      // สัปดาห์ใหม่เริ่มจันทร์ 2 ทุ่ม ให้ตรงกับนิยาม "วันนี้"
  const idx = (now.getDay()+6)%7; // 0=Mon..6=Sun`, 'currentWeekMondayStr');
});

// ================= 13) backup รู้สัปดาห์ =================
step('backup บันทึกสัปดาห์ / import รีเซ็ตสถานะเก่า', 'resetWeek:', () => {
  rep(
`    version: 2,
    exportedAt: new Date().toISOString(),
    data: {`,
`    version: 3,
    exportedAt: new Date().toISOString(),
    resetWeek: currentWeekMondayStr(),   // สถานะ ทำแล้ว/งด/เลื่อน เป็นของสัปดาห์นี้
    data: {`, 'exportData');
  rep(
`  recurring = d.recurring_stories;
  newStories = Array.isArray(d.new_stories) ? d.new_stories : [];`,
`  recurring = d.recurring_stories;
  // สถานะ ทำแล้ว/ยังไม่ทำ/เลื่อน/งด กลับมาตามไฟล์เสมอ — ไม่รีเซ็ตให้ (ทีมตัดสินใจ)
  // ถ้าไฟล์มาจากสัปดาห์อื่น แค่บอกไว้ ผู้ใช้กด "รีเซ็ตสถานะ" เองได้ถ้าต้องการ
  const fileWeek = parsed.resetWeek || null;
  const thisWeek = currentWeekMondayStr();
  let statusNote = '';
  if(fileWeek && fileWeek !== thisWeek){
    statusNote = ' · สถานะตามไฟล์ (สัปดาห์ ' + fileWeek + ')';
  }
  // กันรีเซ็ตรายสัปดาห์เด้งทับสถานะที่เพิ่งกู้คืน ตอนเปิดหน้าครั้งถัดไป
  try{ await window.storage.set('last_reset_week', thisWeek, true); }catch(e){}
  newStories = Array.isArray(d.new_stories) ? d.new_stories : [];`, 'importData keep statuses');
  rep(
`  closeModal('modalBackup');
  render();
  showToast('กู้คืนข้อมูลเรียบร้อยแล้ว');`,
`  closeModal('modalBackup');
  render();
  showToast('กู้คืนข้อมูลเรียบร้อยแล้ว' + statusNote);`, 'importData toast');
});

// ================= 14) ตอนค้างรับ 9.5 / ข้อความ =================
step('ตอนค้างรับทศนิยม + ข้อความ', 'function parseEpisodeInput', () => {
  rep(`function pendingEpCount(item){`,
`// ตอนค้างเก็บได้ทั้งตัวเลข (12, 9.5) และข้อความ (พิเศษ, ตอนพิเศษ 2)
// เลขเรียงก่อนจากน้อยไปมาก ข้อความต่อท้ายเรียงตามตัวอักษร
function epKey(ep){ return typeof ep === 'number' ? 'n:' + ep : 's:' + String(ep).trim().toLowerCase(); }
function epLabel(ep){ return typeof ep === 'number' ? 'ตอน ' + ep : String(ep); }
function sortEpisodes(arr){
  return (arr || []).slice().sort((a, b)=>{
    const an = typeof a === 'number', bn = typeof b === 'number';
    if(an && bn) return a - b;
    if(an) return -1;
    if(bn) return 1;
    return String(a).localeCompare(String(b), 'th');
  });
}
// แปลงข้อความที่พิมพ์เป็นรายการตอน: คั่นด้วย , หรือขึ้นบรรทัดใหม่
// ก้อนที่เป็นเลขล้วนคั่นด้วยช่องว่าง ("12 13 14") แยกให้อีกชั้น ก้อนที่มีตัวอักษรเก็บทั้งก้อน ("ตอนพิเศษ 2")
function parseEpisodeInput(raw){
  const out = [];
  String(raw || '').split(/[,\\n]+/).forEach(chunk=>{
    chunk = chunk.trim();
    if(!chunk) return;
    const parts = /^[\\d.\\s]+$/.test(chunk) ? chunk.split(/\\s+/) : [chunk];
    parts.forEach(t=>{
      t = t.trim();
      if(!t) return;
      if(/^-?\\d+(\\.\\d+)?$/.test(t)){ const n = parseFloat(t); if(n > 0) out.push(n); }   // เลข <= 0 ทิ้ง
      else if(t.length <= 30) out.push(t);
    });
  });
  return out;
}
function pendingEpCount(item){`, 'helpers');
  rep(
`  const eps = (item.pendingEpisodes || []).slice().sort((a,b)=>a-b);
  if(!eps.length) return '';
  const bg = pendingEpColor(eps.length);
  const list = eps.join(', ');`,
`  const eps = sortEpisodes(item.pendingEpisodes);
  if(!eps.length) return '';
  const bg = pendingEpColor(eps.length);
  const list = eps.map(e=>typeof e==='number' ? e : e).join(', ');`, 'overdueBadgeHtml');
  rep(
`  const eps = item.pendingEpisodes.slice().sort((a,b)=>a-b);
  wrap.innerHTML = eps.map(ep=>\`<span class="ep-chip">ตอน \${ep}<button onclick="removeEpisode(\${ep})" title="ทำเสร็จแล้ว">✕</button></span>\`).join('');`,
`  item.pendingEpisodes = sortEpisodes(item.pendingEpisodes);   // เก็บแบบเรียงแล้ว ให้ index ตรงกับที่โชว์
  wrap.innerHTML = item.pendingEpisodes.map((ep, i)=>\`<span class="ep-chip">\${esc(epLabel(ep))}<button onclick="removeEpisodeAt(\${i})" title="ทำเสร็จแล้ว">✕</button></span>\`).join('');`, 'renderEpChips');
  rep(
`async function removeEpisode(ep){
  const item = recurring.find(r=>r.id===epManagerId);
  if(!item){ renderEpChips(); return; }
  item.pendingEpisodes = (item.pendingEpisodes||[]).filter(x=>x!==ep);`,
`async function removeEpisodeAt(i){
  const item = recurring.find(r=>r.id===epManagerId);
  if(!item){ renderEpChips(); return; }
  const eps = sortEpisodes(item.pendingEpisodes);
  if(i < 0 || i >= eps.length) return;
  eps.splice(i, 1);
  item.pendingEpisodes = eps;`, 'removeEpisodeAt');
  rep(
`  const raw = document.getElementById('epAddInput').value;
  const nums = raw.split(/[\\s,]+/).map(s=>parseInt(s,10)).filter(n=>!isNaN(n) && n>0);
  if(!nums.length){ showToast('ใส่เลขตอนที่ต้องการเพิ่ม'); return; }
  const set = new Set(item.pendingEpisodes || []);
  nums.forEach(n=>set.add(n));
  item.pendingEpisodes = [...set].sort((a,b)=>a-b);`,
`  const raw = document.getElementById('epAddInput').value;
  const eps = parseEpisodeInput(raw);
  if(!eps.length){ showToast('ใส่เลขตอน หรือชื่อตอน เช่น 12, 9.5, พิเศษ'); return; }
  const have = new Map((item.pendingEpisodes || []).map(e=>[epKey(e), e]));
  eps.forEach(e=>{ if(!have.has(epKey(e))) have.set(epKey(e), e); });
  item.pendingEpisodes = sortEpisodes([...have.values()]);`, 'addEpisodes');
  rep(`<input id="epAddInput" type="text" placeholder="เช่น 12, 13, 14" style="flex:1;">`,
      `<input id="epAddInput" type="text" placeholder="เช่น 12, 13, 9.5, พิเศษ" style="flex:1;">`, 'placeholder');
  if (s.includes('removeEpisode(')) throw new Error('ยังมี removeEpisode( แบบเก่า');
});

// ================= 15) กำหนดการเปิดเรื่อง =================
step('กำหนดการ: เรียง/ซ่อนเก่า/การ์ดมือถือ/ปุ่มเปิดแล้ว/สร้างเรื่องใหม่', 'function markScheduleOpened', () => {
  const a = s.indexOf('function renderSchedule(){');
  if (a < 0) throw new Error('ไม่เจอ renderSchedule');
  const b = s.indexOf('\n}\n', a);
  if (b < 0) throw new Error('ไม่เจอจุดจบ renderSchedule');
  const js = fs.readFileSync(path.join(__dirname, 'schedule.js'), 'utf8').replace(/\n$/, '');
  s = s.slice(0, a) + js + s.slice(b + 2);
  rep('</style>',
`  /* กำหนดการเปิดเรื่อง */
  .sched-section-head{ display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:14px; margin:14px 0 8px; }
  .sched-section-head small{ font-weight:600; color:var(--ink-soft); }
  .sched-act{ font-size:12px; padding:5px 9px; margin-right:4px; }
  .sched-act-ok{ color:var(--green); border-color:var(--green); }
  .sched-cards{ display:none; }
  .sched-meta{ font-size:12.5px; color:var(--ink-soft); margin-top:3px; }
  .sched-note{ font-size:12.5px; color:var(--ink-soft); margin-bottom:8px; }
  .sched-actions{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  @media(max-width:720px){ .sched-table{ display:none; } .sched-cards{ display:block; } }
</style>`, 'schedule css');
});

// ================= 16) เรื่องเปิดใหม่ =================
step('เรื่องเปิดใหม่: แบ่งกลุ่ม/2-4/ใครยังไม่ติ๊ก/งานของฉัน/วันที่/ย้ายเข้างานประจำ', 'function promoteNewToRecurring', () => {
  const a = s.indexOf('function renderNewStories(){');
  if (a < 0) throw new Error('ไม่เจอ renderNewStories');
  const b = s.indexOf('\n}\n', a);
  if (b < 0) throw new Error('ไม่เจอจุดจบ renderNewStories');
  const js = fs.readFileSync(path.join(__dirname, 'newstories.js'), 'utf8').replace(/\n$/, '');
  s = s.slice(0, a) + js + s.slice(b + 2);

  // เก็บวันที่เพิ่ม
  rep(
`    newStories.push({ id: uid('n'), ...data, name:'', contrib:{'เหนือ':false,'บิ๊ก':false,'ยูตะ':false,'น๊อต':false} });`,
`    newStories.push({ id: uid('n'), ...data, name:'', createdAt: new Date().toISOString(), contrib:{'เหนือ':false,'บิ๊ก':false,'ยูตะ':false,'น๊อต':false} });`, 'saveNewStory createdAt');

  // เปิด modal งานประจำแบบปกติ = ไม่ใช่การย้าย
  rep(
`function openRecurringModal(id){
  editingRecurringId = id || null;`,
`function openRecurringModal(id){
  editingRecurringId = id || null;
  promoteFromNewId = null;   // เปิดปกติ = ไม่ได้ย้ายมาจากเรื่องเปิดใหม่`, 'openRecurringModal reset promote');

  // บันทึกงานประจำที่ย้ายมา -> เรื่องเปิดใหม่ตัวเดิมลงถังขยะ
  rep(
`    recurring.push({ id: uid('r'), ...data, chapter:'', status:'pending', pendingSinceDate:null, pendingEpisodes:[] });
    logActivity(\`เพิ่มเรื่องประจำ "\${data.name||data.code}"\`);
  }
  editingRecurringId = null;
  closeModal('modalRecurring');
  renderRecurring(); renderStats();
  await persistRecurring();`,
`    recurring.push({ id: uid('r'), ...data, chapter:'', status:'pending', pendingSinceDate:null, pendingEpisodes:[] });
    logActivity(\`เพิ่มเรื่องประจำ "\${data.name||data.code}"\`);
    // ย้ายมาจากเรื่องเปิดใหม่: เอาตัวเดิมออก (ลงถังขยะ กู้ได้) จะได้ไม่มี 2 ที่
    if(promoteFromNewId){
      const src = newStories.find(n=>n.id===promoteFromNewId);
      if(src){
        await moveToTrash('newstories', src);
        newStories = newStories.filter(n=>n.id!==promoteFromNewId);
        logActivity(\`ย้าย "\${src.code}" จากเรื่องเปิดใหม่เข้างานประจำ\`);
        showToast('ย้ายเข้างานประจำแล้ว — เรื่องเปิดใหม่ตัวเดิมอยู่ในถังขยะ');
      }
    }
  }
  promoteFromNewId = null;
  editingRecurringId = null;
  closeModal('modalRecurring');
  // ย้ายมาจากแท็บอื่น -> พาไปดูที่งานประจำ (แท็บเดิมไม่ต้องสลับ จะได้ไม่ล้างคำค้น)
  if(activeTab !== 'recurring') switchTab('recurring'); else renderRecurring();
  renderStats();
  await persistRecurring();`, 'saveNewRecurring promote');
});

// ================= 17) ปุ่ม ✕ ล้างช่องค้นหา =================
step('ปุ่มล้างช่องค้นหา', 'function clearSearch', () => {
  rep('function renderRecurring(){',
`// ช่องค้นหา + ปุ่ม ✕ (โผล่เฉพาะตอนมีข้อความ) — ใช้ร่วมกันทั้งแท็บงานประจำและเรื่องเปิดใหม่
function searchBoxHtml(id, placeholder){
  return '<div class="search-wrap">'
    + '<input type="text" id="' + id + '" placeholder="' + placeholder + '" value="' + esc(searchText) + '">'
    + (searchText ? '<button type="button" class="search-clear" onclick="clearSearch(\\'' + id + '\\')" title="ล้างคำค้น">✕</button>' : '')
    + '</div>';
}
function clearSearch(id){
  searchText = '';
  if(activeTab === 'newstories') renderNewStories(); else renderRecurring();
  const box = document.getElementById(id);
  if(box) box.focus({preventScroll:true});
}

function renderRecurring(){`, 'helpers');
  rep(
`      <input type="text" id="searchBox" placeholder="ค้นหารหัสหรือชื่อเรื่อง..." value="\${esc(searchText)}">`,
`      \${searchBoxHtml('searchBox', 'ค้นหารหัสหรือชื่อเรื่อง...')}`, 'recurring search box');
  rep(
`      <input type="text" id="searchBox2" placeholder="ค้นหา..." value="\${esc(searchText)}">`,
`      \${searchBoxHtml('searchBox2', 'ค้นหา...')}`, 'newstories search box');
  rep('</style>',
`  /* ช่องค้นหา + ปุ่มล้าง */
  .search-wrap{ position:relative; flex:1; min-width:160px; display:flex; }
  .search-wrap input[type=text]{ flex:1; min-width:0; padding-right:36px; }
  .search-clear{
    position:absolute; right:6px; top:50%; transform:translateY(-50%);
    border:0; background:transparent; color:var(--ink-soft); font-size:15px; line-height:1;
    padding:6px 8px; border-radius:6px; cursor:pointer;
  }
  .search-clear:hover{ background:var(--gray-bg); color:var(--ink); }
</style>`, 'search css');
});

// ================= 18) ประวัติแสดงชื่อคนที่ล็อกอิน =================
step('ประวัติใช้ชื่อจากบัญชีที่ล็อกอิน', 'function currentUserName', () => {
  rep(`function logActivity(text){
  const entry = { id: uid('a'), who: myPerson || 'ไม่ระบุ', text, at: new Date().toISOString() };`,
`// ชื่อสำหรับประวัติ: ชื่อในบัญชี Supabase (user_metadata.name) > ชื่อที่ตั้งเองผ่าน ⭐ > ส่วนหน้าอีเมล
function currentUserName(){
  const u = (window.storage && window.storage.currentUser) ? window.storage.currentUser() : null;
  if(u && u.name) return u.name;
  if(myPerson) return myPerson;
  if(u && u.email) return u.email.split('@')[0];
  return 'ไม่ระบุ';
}
function logActivity(text){
  const entry = { id: uid('a'), who: currentUserName(), text, at: new Date().toISOString() };`, 'logActivity who');

  // ยังไม่เคยตั้ง "ฉันคือใคร" แต่ชื่อในบัญชีตรงกับคนในทีม -> ตั้งให้เลย ⭐ งานของฉัน ใช้ได้ทันที
  rep(`    const me = await window.storage.get('me', false);
    myPerson = me && me.value ? me.value : '';
  }catch(e){ myPerson = ''; }`,
`    const me = await window.storage.get('me', false);
    myPerson = me && me.value ? me.value : '';
  }catch(e){ myPerson = ''; }
  if(!myPerson){
    const u = (window.storage && window.storage.currentUser) ? window.storage.currentUser() : null;
    if(u && u.name && PEOPLE.includes(u.name)){
      myPerson = u.name;
      try{ await window.storage.set('me', myPerson, false); }catch(e){}
    }
  }`, 'auto myPerson from account');
});

// ================= 19) favicon =================
step('favicon (SVG ฝังในไฟล์)', 'rel="icon"', () => {
  const svg = fs.readFileSync(path.join(__dirname, 'favicon.svg'), 'utf8')
    .replace(/\s*\n\s*/g, ' ').trim();           // บีบเป็นบรรทัดเดียว
  const dataUri = 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/%20/g, ' ');
  rep('<title>ระบบจัดการงานคัดเรื่อง</title>',
`<title>ระบบจัดการงานคัดเรื่อง</title>
<link rel="icon" href="${dataUri}">
<meta name="theme-color" content="#1c6fd1">`, 'favicon link');
});

// ================= 20) ปฏิทิน: ลากย้ายเรื่อง =================
step('ปฏิทินลากย้ายวัน/คนได้', 'function bindCalendarDrag', () => {
  const a = s.indexOf('function renderCalendar(){');
  if (a < 0) throw new Error('ไม่เจอ renderCalendar');
  const b = s.indexOf('\n}\n', a);
  if (b < 0) throw new Error('ไม่เจอจุดจบ renderCalendar');
  const js = fs.readFileSync(path.join(__dirname, 'calendar.js'), 'utf8').replace(/\n$/, '');
  s = s.slice(0, a) + js + s.slice(b + 2);
  rep('</style>',
`  /* ปฏิทิน: chip ลากได้ */
  .cal-chip{
    display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; border-radius:7px;
    background:var(--gray-bg); border:1px solid var(--line); font-size:12.5px; line-height:1.5;
    cursor:grab; user-select:none; -webkit-user-select:none; touch-action:pan-y;
  }
  .cal-chip:hover{ border-color:var(--blue); }
  .cal-chip-eps{ color:#c0392b; font-weight:700; }
  .cal-chip-dragging{ opacity:.35; }
  .cal-ghost{ position:fixed; z-index:99999; pointer-events:none; box-shadow:0 8px 24px rgba(0,0,0,.25); background:var(--card); cursor:grabbing; transform:rotate(-2deg); }
  .cal-items{ min-height:30px; transition:background .12s; }
  .cal-drop-ok{ background:var(--blue-bg) !important; box-shadow:inset 0 0 0 2px var(--blue); }
  body.dark .cal-chip{ background:#20262f; }
</style>`, 'calendar css');
});

// ================= 21) ลิงก์รายวันไม่มีชื่อ -> โชว์โดเมน =================
step('ลิงก์รายวันไม่มีชื่อโชว์โดเมน', 'function linkHostLabel', () => {
  rep(`function dayLinksBarHtml(){`,
`// ลิงก์ที่ไม่ได้ตั้งชื่อ: โชว์โดเมนแทนข้อความกลางๆ จะได้แยกออกว่าอันไหน (drive.google.com / mega.nz)
function linkHostLabel(url){
  try{ return new URL(String(url)).hostname.replace(/^www\\./, ''); }catch(e){ return 'เปิดโฟลเดอร์โหลด'; }
}
function dayLinksBarHtml(){`, 'helper');
  rep("📥 ${esc(l.label || 'เปิดโฟลเดอร์โหลด')}</a>", "📥 ${esc(l.label || linkHostLabel(l.url))}</a>", 'label');
});

// ================= 22) แท็บ "ทุกเรื่อง" =================
step('แท็บทุกเรื่อง (รวมดรอป) รหัส/ชื่อ/ลิงก์', 'function renderAllStories', () => {
  rep(`  <button class="tab-btn" data-tab="schedule">กำหนดการเปิดเรื่อง</button>`,
      `  <button class="tab-btn" data-tab="schedule">กำหนดการเปิดเรื่อง</button>
  <button class="tab-btn" data-tab="all">ทุกเรื่อง</button>`, 'tab button');
  // render() กับ renderTab() ใช้ else = schedule เป็นตัวสุดท้าย -> แทรกก่อน else
  rep(`  searchText = '';
  if(activeTab==='recurring') renderRecurring();
  else if(activeTab==='calendar') renderCalendar();
  else if(activeTab==='newstories') renderNewStories();
  else if(activeTab==='expenses') renderExpenses();
  else renderSchedule();`,
`  searchText = '';
  if(activeTab==='recurring') renderRecurring();
  else if(activeTab==='calendar') renderCalendar();
  else if(activeTab==='newstories') renderNewStories();
  else if(activeTab==='expenses') renderExpenses();
  else if(activeTab==='all') renderAllStories();
  else renderSchedule();`, 'render() dispatch');
  rep(`function renderTab(){
  if(activeTab==='recurring') renderRecurring();
  else if(activeTab==='calendar') renderCalendar();
  else if(activeTab==='newstories') renderNewStories();
  else if(activeTab==='expenses') renderExpenses();
  else renderSchedule();
}`,
`function renderTab(){
  if(activeTab==='recurring') renderRecurring();
  else if(activeTab==='calendar') renderCalendar();
  else if(activeTab==='newstories') renderNewStories();
  else if(activeTab==='expenses') renderExpenses();
  else if(activeTab==='all') renderAllStories();
  else renderSchedule();
}`, 'renderTab() dispatch');
  // วางฟังก์ชันไว้ก่อน renderSchedule
  const js = fs.readFileSync(path.join(__dirname, 'allstories.js'), 'utf8').replace(/\n$/, '');
  rep(`function scheduleActionsHtml(e){`, js + `\n\nfunction scheduleActionsHtml(e){`, 'insert renderAllStories');
  rep('</style>',
`  /* แท็บทุกเรื่อง */
  .all-table td{ vertical-align:middle; }
  .all-code{ font-weight:800; white-space:nowrap; }
  .all-link{ color:var(--blue); font-size:13px; white-space:nowrap; }
  .all-dropped td{ color:var(--ink-soft); }
  .all-dropped .all-code{ text-decoration:line-through; text-decoration-color:rgba(0,0,0,.35); }
</style>`, 'all css');
});

// ================= 23) เหตุผลดรอปเพิ่ม: งดไม่มีกำหนด =================
step('ดรอป: เพิ่ม "งดไม่มีกำหนด"', "hiatus:", () => {
  rep(`  lc:    {label:'LC (ถูกลิขสิทธิ์)', bg:'#fdeaea', fg:'#c0392b'},
};`,
`  lc:    {label:'LC (ถูกลิขสิทธิ์)', bg:'#fdeaea', fg:'#c0392b'},
  hiatus:{label:'งดไม่มีกำหนด', bg:'#f1eafd', fg:'#7b3fd4'},
};`, 'DROP_META');
  rep(`พิมพ์ "จบ" = จบซีซั่น, "lc" = โดน LC (ถูกลิขสิทธิ์)', {placeholder:'จบ หรือ lc'});`,
      `พิมพ์ "จบ" = จบซีซั่น, "lc" = โดน LC (ถูกลิขสิทธิ์), "งด" = งดไม่มีกำหนด', {placeholder:'จบ / lc / งด'});`, 'prompt');
  rep(`  else if(r==='lc' || r==='แอลซี' || r==='ลิขสิทธิ์') val='lc';
  else { showToast('พิมพ์ "จบ" หรือ "lc" เท่านั้น'); return; }`,
`  else if(r==='lc' || r==='แอลซี' || r==='ลิขสิทธิ์') val='lc';
  else if(r==='งด' || r==='งดไม่มีกำหนด' || r==='พัก' || r==='hiatus') val='hiatus';
  else { showToast('พิมพ์ "จบ", "lc" หรือ "งด" เท่านั้น'); return; }`, 'parser');
  rep(`title="ดรอปเรื่อง (จบซีซั่น/LC)"`, `title="ดรอปเรื่อง (จบซีซั่น/LC/งดไม่มีกำหนด)"`, 'button title');
  rep(`<h4>⏏ ดรอปเรื่อง (จบซีซั่น / LC)</h4>`, `<h4>⏏ ดรอปเรื่อง (จบซีซั่น / LC / งดไม่มีกำหนด)</h4>`, 'help heading');
  rep(`<li><b>⏏</b>: ดรอปเรื่อง (จบซีซั่น / LC)`, `<li><b>⏏</b>: ดรอปเรื่อง (จบซีซั่น / LC / งดไม่มีกำหนด)`, 'help list');
  rep(`กด ⏏ พิมพ์ "จบ" หรือ "lc"`, `กด ⏏ พิมพ์ "จบ", "lc" หรือ "งด"`, 'help text');
});

// ================= 24) เอากลับจากดรอป -> พาไปดูที่เรื่องอยู่ =================
step('undrop พาไปดูเรื่องที่กลับมา', 'กลับมางานปกติแล้ว — อยู่ที่', () => {
  rep(`  item.dropped = null;
  delete item.dropped;
  logActivity(\`เอาเรื่อง "\${item.name||item.code}" กลับมางานปกติ\`);
  renderRecurring(); renderStats();
  await persistRecurring();
  showToast('เอาเรื่องกลับมางานปกติแล้ว');`,
`  item.dropped = null;
  delete item.dropped;
  logActivity(\`เอาเรื่อง "\${item.name||item.code}" กลับมางานปกติ\`);
  // เดิม: ยังอยู่โหมดดูดรอป + ตัวกรองเป็น "วันนี้" -> เรื่องหายจากจอทั้ง 2 ชั้น เหมือนถูกลบ
  // พาไปดูที่เรื่องอยู่จริงเลย
  showDropped = false;
  showOnlyPending = false;
  dayFilter = WEEKDAY_ONLY.includes(item.day) ? item.day : 'ทั้งหมด';
  lastAutoDay = null;   // ผู้ใช้เลือกวันเองแล้ว poll ไม่ต้องดึงกลับ "วันนี้"
  personFilter = 'ทั้งหมด';
  renderRecurring(); renderStats();
  await persistRecurring();
  showToast(\`"\${item.name||item.code}" กลับมางานปกติแล้ว — อยู่ที่ \${item.person||'ไม่ระบุคน'} · \${item.day||'ไม่ระบุวัน'}\`);`, 'undropStory');
});

// ================= 25) ย้ายคนแล้วตอนค้างยังเป็นของคนเดิม =================
step('ตอนค้างตามคนเดิมเมื่อย้ายเรื่อง (pendingOwners ต่อตอน)', 'function epOwner(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'handover.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // แก้ใน modal: เปลี่ยนคน -> ถาม
  rep(`    if(!item){ showToast('เรื่องนี้ถูกลบไปแล้ว'); closeModal('modalRecurring'); return; }
    Object.assign(item, data); // เก็บ status, ตอนค้าง, ฯลฯ ไว้เหมือนเดิม`,
`    if(!item){ showToast('เรื่องนี้ถูกลบไปแล้ว'); closeModal('modalRecurring'); return; }
    if(data.person !== item.person && !(await resolveBacklogOnReassign(item, data.person))) return;   // ปิดกล่อง = ไม่บันทึก
    Object.assign(item, data); // เก็บ status, ตอนค้าง, ฯลฯ ไว้เหมือนเดิม`, 'saveNewRecurring');

  // ตัวกรองคน: เห็นเรื่องที่ตอนค้างเป็นของเราด้วย แม้เรื่องย้ายไปคนอื่นแล้ว
  rep(`  if(personFilter!=='ทั้งหมด' && item.person!==personFilter) return false;`,
      `  if(personFilter!=='ทั้งหมด' && !isPersonInvolved(item, personFilter)) return false;`, 'matchesFilters');

  // การ์ดยอดค้าง: นับตอนค้างให้คนที่ต้องเคลียร์ ไม่ใช่เจ้าของเรื่อง
  rep(`    stat[r.person].stories++;
    stat[r.person].eps += pendingEpCount(r);`,
`    stat[r.person].stories++;
    const by = pendingEpsByPerson(r);
    for(const p of Object.keys(by)) if(PEOPLE.includes(p)) stat[p].eps += by[p];`, 'workloadPanelHtml');

  // ป้ายค้างในรายการ: บอกว่าของใคร
  rep(`    + \`<span class="overdue-badge" style="background:\${bg}">ค้าง \${eps.length} ตอน</span>\``,
      `    + \`<span class="overdue-badge" style="background:\${bg}">ค้าง \${eps.length} ตอน\${hasForeignBacklog(item) ? ' · ' + esc(foreignBacklogLabel(item)) : ''}</span>\``, 'overdueBadgeHtml');

  // เคลียร์ครบ -> เลิกจำเจ้าของหนี้
  rep(`  eps.splice(i, 1);
  item.pendingEpisodes = eps;`,
`  eps.splice(i, 1);
  item.pendingEpisodes = eps;
  clearPendingOwnerIfDone(item);`, 'removeEpisodeAt');
  rep(`  item.pendingEpisodes = [];
  renderEpChips();`,
`  item.pendingEpisodes = [];
  clearPendingOwnerIfDone(item);
  renderEpChips();`, 'clearAllEpisodes');

  // หัวหน้าต่างจัดการตอน
  rep(`  document.getElementById('epModalTitle').textContent = 'ตอนที่ค้าง — ' + (item.name || item.code || '');`,
      `  document.getElementById('epModalTitle').textContent = 'ตอนที่ค้าง — ' + (item.name || item.code || '') + (hasForeignBacklog(item) ? ' · ' + foreignBacklogLabel(item) : '');`, 'epModalTitle');
});

// ================= 26) ช่องวันที่: กดตรงไหนก็เปิดปฏิทิน + ปุ่มวันนี้ =================
step('ช่องวันที่เปิดปฏิทินทันที + ปุ่มวันนี้', 'function setDateToday', () => {
  // ปุ่ม "วันนี้" ข้างช่องวันที่ 2 ช่อง
  rep(`<div class="field"><label>วันที่จะเปิด</label><input id="sDate" type="date"></div>`,
      `<div class="field"><label>วันที่จะเปิด</label><div class="date-row"><input id="sDate" type="date"><button type="button" class="btn btn-ghost date-today" onclick="setDateToday('sDate')">วันนี้</button></div></div>`, 'sDate');
  rep(`<div class="field"><label>วันที่ (ไม่บังคับ)</label><input id="xDate" type="date"></div>`,
      `<div class="field"><label>วันที่ (ไม่บังคับ)</label><div class="date-row"><input id="xDate" type="date"><button type="button" class="btn btn-ghost date-today" onclick="setDateToday('xDate')">วันนี้</button></div></div>`, 'xDate');
  rep(`function renderRecurring(){`,
`// ช่องวันที่: Chrome เปิดปฏิทินเฉพาะตอนกดไอคอนเล็กๆ ขวาสุด กดกลางช่องได้แค่พิมพ์ — ให้กดตรงไหนก็เปิด
document.addEventListener('click', e=>{
  const el = e.target;
  if(el && el.tagName === 'INPUT' && el.type === 'date' && typeof el.showPicker === 'function'){
    try{ el.showPicker(); }catch(err){ /* บางเบราว์เซอร์ไม่ให้เรียกซ้อน — ปล่อยให้ใช้แบบเดิม */ }
  }
});
function setDateToday(id){
  const el = document.getElementById(id);
  if(el){ el.value = todayDateStr(); el.dispatchEvent(new Event('change', {bubbles:true})); }
}

function renderRecurring(){`, 'helpers');
  rep('</style>',
`  /* ช่องวันที่ + ปุ่มวันนี้ */
  .date-row{ display:flex; gap:8px; align-items:center; }
  .date-row input[type=date]{ flex:1; min-width:0; cursor:pointer; }
  .date-today{ font-size:12px; padding:7px 10px; white-space:nowrap; }
</style>`, 'css');
});

// ================= 27) ดรอป: ปุ่มเลือก + สถานะ "จบแล้ว" =================
step('ดรอปเป็นปุ่มเลือก + เพิ่ม "จบแล้ว"', 'function uiPick(', () => {
  rep(`  hiatus:{label:'งดไม่มีกำหนด', bg:'#f1eafd', fg:'#7b3fd4'},
};`,
`  hiatus:{label:'งดไม่มีกำหนด', bg:'#f1eafd', fg:'#7b3fd4'},
  finished:{label:'จบแล้ว', bg:'#e6f7ee', fg:'#1a9c6b'},
};`, 'DROP_META finished');
  // แทน openDropMenu ทั้งฟังก์ชัน
  const a = s.indexOf('async function openDropMenu(id){');
  if (a < 0) throw new Error('ไม่เจอ openDropMenu');
  const b = s.indexOf('\n}\n', a);
  if (b < 0) throw new Error('ไม่เจอจุดจบ openDropMenu');
  const js = fs.readFileSync(path.join(__dirname, 'droppick.js'), 'utf8').replace(/\n$/, '');
  s = s.slice(0, a) + js + s.slice(b + 2);
  // ข้อความช่วยเหลือ
  rep(`title="ดรอปเรื่อง (จบซีซั่น/LC/งดไม่มีกำหนด)"`, `title="ดรอปเรื่อง (จบซีซั่น / จบแล้ว / LC / งดไม่มีกำหนด)"`, 'button title');
  rep(`<h4>⏏ ดรอปเรื่อง (จบซีซั่น / LC / งดไม่มีกำหนด)</h4>`, `<h4>⏏ ดรอปเรื่อง (จบซีซั่น / จบแล้ว / LC / งดไม่มีกำหนด)</h4>`, 'help heading');
  rep(`<li><b>⏏</b>: ดรอปเรื่อง (จบซีซั่น / LC / งดไม่มีกำหนด)`, `<li><b>⏏</b>: ดรอปเรื่อง (จบซีซั่น / จบแล้ว / LC / งดไม่มีกำหนด)`, 'help list');
  rep(`กด ⏏ พิมพ์ "จบ", "lc" หรือ "งด"`, `กด ⏏ แล้วเลือกเหตุผล`, 'help text');
  rep('</style>',
`  /* กล่องเลือกเหตุผลดรอป */
  .pick-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .pick-btn{
    display:flex; flex-direction:column; align-items:flex-start; gap:3px; text-align:left;
    padding:12px 14px; border:1px solid; border-radius:12px; cursor:pointer; font-family:inherit; line-height:1.35;
  }
  .pick-btn b{ font-size:14px; }
  .pick-btn small{ font-size:11.5px; opacity:.85; }
  .pick-btn:hover{ filter:brightness(.96); }
  @media(max-width:480px){ .pick-grid{ grid-template-columns:1fr; } }
</style>`, 'pick css');
});

// ================= 28) แก้เหตุผลดรอปได้จากหน้าดรอป =================
step('เปลี่ยนเหตุผลดรอปได้จากป้าย', 'function changeDropReason', () => {
  // ป้ายดรอปกดได้ (ทั้งตอนดรอปแล้วและตอนรอดรอป)
  rep(`            ? \` <span class="drop-badge" style="background:\${DROP_META[item.dropped].bg};color:\${DROP_META[item.dropped].fg};">\${DROP_META[item.dropped].label}</span>\`
            : \` <span class="drop-badge" style="background:#fdf3e3;color:#b9791b;">⏳ รอดรอป (\${DROP_META[item.dropped].label}) · เคลียร์ตอนค้างก่อน</span>\`)`,
`            ? \` <span class="drop-badge drop-badge-edit" title="กดเพื่อเปลี่ยนเหตุผล" onclick="changeDropReason('\${item.id}')" style="background:\${DROP_META[item.dropped].bg};color:\${DROP_META[item.dropped].fg};">\${DROP_META[item.dropped].label} ▾</span>\`
            : \` <span class="drop-badge drop-badge-edit" title="กดเพื่อเปลี่ยนเหตุผล" onclick="changeDropReason('\${item.id}')" style="background:#fdf3e3;color:#b9791b;">⏳ รอดรอป (\${DROP_META[item.dropped].label}) · เคลียร์ตอนค้างก่อน ▾</span>\`)`, 'badge clickable');
  rep(`async function undropStory(id){`,
`// เปลี่ยนเหตุผลดรอป (จบซีซั่น <-> จบแล้ว <-> LC <-> งด) โดยไม่ต้องเอากลับก่อน
async function changeDropReason(id){
  const item = recurring.find(r=>r.id===id);
  if(!item || !item.dropped) return;
  const cur = item.dropped;
  const val = await uiPick(
    'เปลี่ยนเหตุผลดรอป',
    \`"\${item.name||item.code}" ตอนนี้: \${DROP_META[cur] ? DROP_META[cur].label : cur}\`,
    Object.keys(DROP_META).map(k=>({ value:k, label: DROP_META[k].label + (k===cur ? ' (ปัจจุบัน)' : ''), bg: DROP_META[k].bg, fg: DROP_META[k].fg }))
  );
  if(!val || val === cur) return;
  item.dropped = val;
  logActivity(\`เปลี่ยนเหตุผลดรอป "\${item.name||item.code}" \${DROP_META[cur].label} → \${DROP_META[val].label}\`);
  renderRecurring(); renderStats();
  showToast(\`"\${item.name||item.code}" → \${DROP_META[val].label}\`);
  await persistRecurring(false);
}

async function undropStory(id){`, 'changeDropReason');
  rep('</style>', `  .drop-badge-edit{ cursor:pointer; }
  .drop-badge-edit:hover{ filter:brightness(.93); }
</style>`, 'css');
});

// ================= 29) เรื่องเดียวหลายวันต่อสัปดาห์ =================
step('เรื่องหลายวัน/สัปดาห์ (days + statusByDay)', 'function itemDays(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'multiday.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // รีเซ็ตรายสัปดาห์: ทุกวันของเรื่อง
  rep(`  items.forEach(item=>{
    if(item.status !== 'pending'){
      item.status = 'pending';
      item.pendingSinceDate = null;
      changed = true;
    }
  });`,
`  items.forEach(item=>{
    if(isMultiDay(item)){
      const sb = item.statusByDay || {};
      if(itemDays(item).some(d=>(sb[d] || 'pending') !== 'pending')){ item.statusByDay = {}; item.status = 'pending'; item.pendingSinceDate = null; changed = true; }
      return;
    }
    if(item.status !== 'pending'){
      item.status = 'pending';
      item.pendingSinceDate = null;
      changed = true;
    }
  });`, 'reset');

  // สถิติ "ทำแล้วสัปดาห์นี้" นับต่อวัน
  rep(`  const doneToday = active.filter(r=>r.status==='done').length;`,
      `  const doneToday = active.reduce((n,r)=> n + itemDays(r).filter(d=>dayStatus(r,d)==='done').length, 0);`, 'stats');

  // ตัวกรองวัน
  rep(`  if(dayFilter!=='ทั้งหมด' && item.day!==dayFilter) return false;`,
      `  if(dayFilter!=='ทั้งหมด' && !itemDays(item).includes(dayFilter)) return false;`, 'matchesFilters');

  // รายการงานประจำ: 1 แถวต่อ (เรื่อง, วัน)
  rep(`    items.sort((a,b)=> DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));`,
`    // เรื่องหลายวัน = หลายแถว (แถวละวัน สถานะแยกกัน) — ถ้ากรองวันอยู่ โชว์เฉพาะวันนั้น
    const rows = [];
    items.forEach(it=>itemDays(it).filter(d=>dayFilter==='ทั้งหมด' || d===dayFilter).forEach(d=>rows.push({ item: it, rowDay: d })));
    rows.sort((a,b)=> DAY_ORDER.indexOf(a.rowDay) - DAY_ORDER.indexOf(b.rowDay));`, 'rows');
  rep(`    items.forEach(item=>{
      const effDropped = isEffectivelyDropped(item);`,
`    rows.forEach(({ item, rowDay })=>{
      const effDropped = isEffectivelyDropped(item);`, 'row loop');
  rep(`          <div class="item-code">\${item.code ? esc(item.code)+' · ' : ''}\${esc(item.name)||'(ไม่มีชื่อ)'}\${dropBadge}</div>`,
      `          <div class="item-code">\${item.code ? esc(item.code)+' · ' : ''}\${esc(item.name)||'(ไม่มีชื่อ)'}\${isMultiDay(item)?\` <span class="multi-badge" title="\${esc(itemDays(item).join(' · '))}">\${itemDays(item).length} วัน/สัปดาห์</span>\`:''}\${dropBadge}</div>`, 'multi badge');
  rep(`        <span class="day-pill" style="\${dayPillStyle(item.day)}">\${item.day}</span>`,
      `        <span class="day-pill" style="\${dayPillStyle(rowDay)}">\${rowDay}</span>`, 'day pill');
  rep(`<select class="status-select" style="background:\${STATUS_META[item.status||'pending'].bg};color:\${STATUS_META[item.status||'pending'].fg};"
            onchange="updateStatus('\${item.id}', this.value)">
            \${Object.keys(STATUS_META).map(k=>\`<option value="\${k}" \${((item.status||'pending')===k)?'selected':''}>\${STATUS_META[k].label}</option>\`).join('')}`,
`<select class="status-select" style="background:\${STATUS_META[dayStatus(item,rowDay)].bg};color:\${STATUS_META[dayStatus(item,rowDay)].fg};"
            onchange="updateStatus('\${item.id}', this.value, '\${rowDay}')">
            \${Object.keys(STATUS_META).map(k=>\`<option value="\${k}" \${(dayStatus(item,rowDay)===k)?'selected':''}>\${STATUS_META[k].label}</option>\`).join('')}`, 'status select');

  // เปลี่ยนสถานะต่อวัน
  rep(`async function updateStatus(id, value){
  const item = recurring.find(r=>r.id===id);
  if(!item || !STATUS_META[value]) return;
  item.status = value;
  if(value === 'pending' && dayHasPassedThisWeek(item)){`,
`async function updateStatus(id, value, day){
  const item = recurring.find(r=>r.id===id);
  if(!item || !STATUS_META[value]) return;
  day = day && itemDays(item).includes(day) ? day : itemDays(item)[0];
  setDayStatus(item, day, value);
  if(value === 'pending' && dayHasPassed(day)){`, 'updateStatus');
  rep(`  logActivity(\`เปลี่ยนสถานะ "\${item.name||item.code}" เป็น \${STATUS_META[value].label}\`);`,
      `  logActivity(\`เปลี่ยนสถานะ "\${item.name||item.code}"\${isMultiDay(item)?' ('+day+')':''} เป็น \${STATUS_META[value].label}\`);`, 'updateStatus log');

  // modal: ติ๊กวันได้หลายวัน
  rep(`      <select id="rDay">
        <option>จันทร์</option><option>อังคาร</option><option>พุธ</option><option>พฤหัสบดี</option>
        <option>ศุกร์</option><option>เสาร์</option><option>อาทิตย์</option><option>ไม่ระบุวัน</option><option>จบแล้ว</option>
      </select>`,
`      <div id="rDays" class="day-checks"></div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px;">ติ๊กได้หลายวันถ้าเรื่องลงหลายวันต่อสัปดาห์ — แต่ละวันมีสถานะทำแล้ว/ยังไม่ทำแยกกัน</div>`, 'rDay html');
  rep(`  document.getElementById('rDay').value = item ? (item.day||'จันทร์') : 'จันทร์';`,
      `  const rd = document.getElementById('rDays'); if(!rd.children.length) rd.innerHTML = dayChecksHtml();
  setDayChecks(item ? itemDays(item) : ['จันทร์']);`, 'openRecurringModal');
  rep(`    day: document.getElementById('rDay').value,`,
      `    day: readDayChecks()[0],
    days: readDayChecks(),`, 'saveNewRecurring data');
  rep(`    Object.assign(item, data); // เก็บ status, ตอนค้าง, ฯลฯ ไว้เหมือนเดิม`,
      `    Object.assign(item, data); // เก็บ status, ตอนค้าง, ฯลฯ ไว้เหมือนเดิม
    normalizeDays(item);`, 'saveNewRecurring edit');
  rep(`    recurring.push({ id: uid('r'), ...data, chapter:'', status:'pending', pendingSinceDate:null, pendingEpisodes:[] });`,
      `    recurring.push({ id: uid('r'), ...data, chapter:'', status:'pending', pendingSinceDate:null, pendingEpisodes:[] });
    normalizeDays(recurring[recurring.length-1]);`, 'saveNewRecurring new');

  rep('</style>',
`  /* เรื่องหลายวัน */
  .day-checks{ display:flex; flex-wrap:wrap; gap:6px; }
  .day-check{ display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line); border-radius:999px; padding:5px 10px 5px 8px; font-size:12.5px; cursor:pointer; background:var(--card); }
  .day-check:has(input:checked){ background:var(--blue-bg); border-color:var(--blue); color:var(--blue); font-weight:700; }
  .day-check input{ margin:0; }
  .multi-badge{ display:inline-block; margin-left:6px; padding:1px 7px; border-radius:6px; font-size:11px; font-weight:700; background:var(--blue-bg); color:var(--blue); vertical-align:middle; }
</style>`, 'css');
});

// ================= 30) ตอนล่าสุดที่ทำแล้ว (lastEp) =================
step('ตอนล่าสุดที่ทำแล้ว (lastEp)', 'function bumpLastEp(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'lastep.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // กด ✕ ตอนค้าง = ทำตอนนั้นแล้ว
  rep(`  if(i < 0 || i >= eps.length) return;
  eps.splice(i, 1);
  item.pendingEpisodes = eps;`,
`  if(i < 0 || i >= eps.length) return;
  bumpLastEp(item, eps[i]);
  eps.splice(i, 1);
  item.pendingEpisodes = eps;`, 'removeEpisodeAt');
  rep(`  if(!await uiConfirm('ทำครบทุกตอนแล้ว เอาตอนที่ค้างออกทั้งหมด?', 'เคลียร์ทุกตอน')) return;
  item.pendingEpisodes = [];`,
`  if(!await uiConfirm('ทำครบทุกตอนแล้ว เอาตอนที่ค้างออกทั้งหมด?', 'เคลียร์ทุกตอน')) return;
  bumpLastEp(item, item.pendingEpisodes);
  item.pendingEpisodes = [];`, 'clearAllEpisodes');

  // ป้ายในแถวงานประจำ (ใต้ชื่อ ข้างป้ายค้าง)
  rep(`          \${overdueBadgeHtml(item)}
        </div>
        <span class="day-pill" style="\${dayPillStyle(rowDay)}">\${rowDay}</span>`,
`          <div class="ep-line">\${lastEpBadgeHtml(item)}</div>
          \${overdueBadgeHtml(item)}
        </div>
        <span class="day-pill" style="\${dayPillStyle(rowDay)}">\${rowDay}</span>`, 'row badge');

  // แท็บทุกเรื่อง: คอลัมน์ตอนล่าสุด
  rep(`      <td>\${allNameHtml(r)}\${drop}\${allOrigHtml(r)}</td>
      <td>\${link}</td>`,
`      <td>\${allNameHtml(r)}\${drop}\${allOrigHtml(r)}</td>
      <td>\${lastEpBadgeHtml(r)}</td>
      <td>\${link}</td>`, 'allstories cell');
  rep(`<thead><tr><th>รหัส</th><th>ชื่อเรื่อง</th><th>ลิงก์ต้นทาง</th></tr></thead>`,
      `<thead><tr><th>รหัส</th><th>ชื่อเรื่อง</th><th>ตอนล่าสุด</th><th>ลิงก์ต้นทาง</th></tr></thead>`, 'allstories head');

  rep('</style>',
`  /* ตอนล่าสุดที่ทำแล้ว */
  .lastep-badge{ display:inline-block; padding:1px 8px; border-radius:6px; font-size:11.5px; font-weight:700; background:var(--green-bg,#e6f6ee); color:var(--green,#1a9c6b); cursor:pointer; white-space:nowrap; }
  .lastep-badge:hover{ filter:brightness(.93); }
  .lastep-empty{ background:var(--gray-bg); color:var(--ink-soft); font-weight:600; }
</style>`, 'css');
});

// ================= 31) ป้ายเว็บต้นทาง (ตัวย่อจากโดเมน) =================
step('ป้ายเว็บต้นทาง (ตัวย่อ)', 'function sourceBadgeHtml(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'source.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // งานประจำ: หน้ารหัสเรื่อง
  rep(`          <div class="item-code">\${item.code ? esc(item.code)+' · ' : ''}\${esc(item.name)||'(ไม่มีชื่อ)'}`,
      `          <div class="item-code">\${sourceBadgeHtml(item)}\${item.code ? esc(item.code)+' · ' : ''}\${esc(item.name)||'(ไม่มีชื่อ)'}`, 'row badge');

  // ทุกเรื่อง: หน้าชื่อลิงก์
  rep(`      ? \`<a href="\${safeUrl(r.link)}" target="_blank" rel="noopener" class="all-link" title="\${esc(r.link)}">\${esc(linkHostLabel(r.link))} ↗</a>\``,
      `      ? \`\${sourceBadgeHtml(r)}<a href="\${safeUrl(r.link)}" target="_blank" rel="noopener" class="all-link" title="\${esc(r.link)}">\${esc(linkHostLabel(r.link))} ↗</a>\``, 'allstories cell');

  rep('</style>',
`  /* ป้ายเว็บต้นทาง */
  .src-badge{ display:inline-block; margin-right:6px; padding:1px 6px; border-radius:5px; font-size:10.5px; font-weight:800; letter-spacing:.3px; vertical-align:middle; line-height:1.5; }
  body.dark .src-badge{ filter:brightness(.85) saturate(1.2); }
</style>`, 'css');
});

// ================= 32) ย้ายเรื่องเปิดใหม่เข้างานประจำได้ก่อนติ๊กครบ =================
step('ย้ายเข้างานประจำก่อนติ๊กครบ (promotedId)', 'src.promotedId =', () => {
  // renderNewStories/promoteNewToRecurring มาจาก newstories.js (ขั้น 16) — ที่นี่แก้ตอนบันทึก + ตอนติ๊ก
  rep(`      if(src){
        await moveToTrash('newstories', src);
        newStories = newStories.filter(n=>n.id!==promoteFromNewId);
        logActivity(\`ย้าย "\${src.code}" จากเรื่องเปิดใหม่เข้างานประจำ\`);
        showToast('ย้ายเข้างานประจำแล้ว — เรื่องเปิดใหม่ตัวเดิมอยู่ในถังขยะ');
      }`,
`      if(src){
        const pr = newStoryProgress(src);
        if(pr.missing.length){
          // ยังติ๊กไม่ครบ: การ์ดอยู่ต่อ รอคนที่เหลือ แล้วลงถังขยะเองตอนครบ
          src.promotedId = recurring[recurring.length-1].id;
          logActivity(\`ย้าย "\${src.code}" เข้างานประจำ (เรื่องเปิดใหม่ยังรอ \${pr.missing.join(', ')})\`);
          showToast('ย้ายเข้างานประจำแล้ว — การ์ดเรื่องเปิดใหม่รอ ' + pr.missing.join(', ') + ' ติ๊ก แล้วหายเอง');
        } else {
          await moveToTrash('newstories', src);
          newStories = newStories.filter(n=>n.id!==promoteFromNewId);
          logActivity(\`ย้าย "\${src.code}" จากเรื่องเปิดใหม่เข้างานประจำ\`);
          showToast('ย้ายเข้างานประจำแล้ว — เรื่องเปิดใหม่ตัวเดิมอยู่ในถังขยะ');
        }
      }`, 'saveNewRecurring');

  rep(`  item.contrib[person] = !item.contrib[person];
  renderNewStories(); renderStats();
  await persistNew(false);`,
`  item.contrib[person] = !item.contrib[person];
  // อยู่ในงานประจำแล้ว + คนสุดท้ายติ๊ก -> การ์ดลงถังขยะเอง
  if(promotedTarget(item) && !newStoryProgress(item).missing.length){
    await moveToTrash('newstories', item);
    newStories = newStories.filter(n=>n.id!==id);
    logActivity(\`"\${item.code}" ติ๊กครบแล้ว — เอาออกจากเรื่องเปิดใหม่ (อยู่ในงานประจำแล้ว)\`);
    showToast('ติ๊กครบแล้ว — การ์ดย้ายลงถังขยะ (เรื่องอยู่ในงานประจำแล้ว)');
  }
  renderNewStories(); renderStats();
  await persistNew(false);`, 'toggleContrib');

  rep('</style>', `  .promoted-badge{ display:inline-block; padding:3px 9px; border-radius:7px; font-size:12px; font-weight:700; background:var(--green-bg); color:var(--green); }
</style>`, 'css');
});

// ================= 33) รวมการแก้พร้อมกันทีละช่อง + ประวัติเก็บ 30 วัน =================
step('merge ทีละช่อง + ประวัติ 30 วัน', 'function mergeField(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'merge.js'), 'utf8').replace(/\n$/, '');
  rep(`function mergeById(baseArr, oursArr, theirsArr){`, js + `\n\nfunction mergeById(baseArr, oursArr, theirsArr){`, 'helpers');
  rep(`    if(weChanged) result.push(o);
    else if(theyChanged) result.push(t);
    else result.push(o);`,
`    if(weChanged && theyChanged) result.push(b === undefined ? o : mergeItemFields(b, o, t));   // แก้ทั้งคู่ -> รวมทีละช่อง
    else if(weChanged) result.push(o);
    else if(theyChanged) result.push(t);
    else result.push(o);`, 'mergeById both changed');

  // ประวัติ: 150 รายการหมดใน 2-3 วัน -> เก็บ 30 วัน (สูงสุด 1500)
  rep(`  if(activity.length > 150) activity = activity.slice(-150);`,
`  pruneActivity();`, 'logActivity cap');
  rep(`function logActivity(text){`,
`const ACTIVITY_KEEP_DAYS = 30;
const ACTIVITY_MAX = 1500;
function pruneActivity(){
  const cutoff = new Date(Date.now() - ACTIVITY_KEEP_DAYS*86400000).toISOString();
  activity = activity.filter(a=>!a.at || a.at >= cutoff);
  if(activity.length > ACTIVITY_MAX){
    activity.sort((a,b)=>(a.at||'').localeCompare(b.at||''));
    activity = activity.slice(-ACTIVITY_MAX);
  }
}
function logActivity(text){`, 'pruneActivity');
  rep(`// บันทึกกิจกรรม (ใครทำอะไร) — เก็บล่าสุด 150 รายการ`, `// บันทึกกิจกรรม (ใครทำอะไร) — เก็บ 30 วันล่าสุด (สูงสุด 1500)`, 'comment');
  rep(`เก็บ 150 รายการล่าสุด · แชร์ทั้งทีม`, `เก็บย้อนหลัง 30 วัน · แชร์ทั้งทีม`, 'history modal text');
  rep(`เก็บ 150 รายการล่าสุด แชร์ทั้งทีม`, `เก็บย้อนหลัง 30 วัน แชร์ทั้งทีม`, 'manual text');
});

// ================= 34) ชื่อเรื่อง 2 แบบ: ชื่อแปล + ต้นฉบับ (origName) =================
step('ชื่อแปล + ชื่อต้นฉบับ (origName)', 'function displayName(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'origname.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // modal: 2 ช่อง
  rep(`<div class="field"><label>ชื่อเรื่อง</label><input id="rName" type="text" placeholder="ชื่อเรื่อง"></div>`,
`<div class="field"><label>ชื่อแปล (ไทย)</label><input id="rName" type="text" placeholder="ชื่อเรื่องภาษาไทย"></div>
    <div class="field"><label>ชื่อต้นฉบับ</label><input id="rOrigName" type="text" placeholder="เกาหลี / ญี่ปุ่น / อังกฤษ"></div>`, 'modal fields');
  rep(`  document.getElementById('rName').value = item ? (item.name||'') : '';`,
`  document.getElementById('rName').value = item ? (item.name||'') : '';
  document.getElementById('rOrigName').value = item ? (item.origName||'') : '';`, 'openRecurringModal');
  rep(`  const name = document.getElementById('rName').value.trim();
  if(!name){ showToast('กรุณาใส่ชื่อเรื่อง'); return; }`,
`  const name = document.getElementById('rName').value.trim();
  const origName = document.getElementById('rOrigName').value.trim();
  if(!name && !origName){ showToast('กรุณาใส่ชื่อเรื่อง (ชื่อแปลหรือต้นฉบับอย่างน้อย 1 ช่อง)'); return; }`, 'save validate');
  rep(`    name,
    day: readDayChecks()[0],`,
`    name,
    origName,
    day: readDayChecks()[0],`, 'save data');

  // แถวงานประจำ
  rep(`\${esc(item.name)||'(ไม่มีชื่อ)'}\${isMultiDay(item)`, `\${esc(displayName(item))||'(ไม่มีชื่อ)'}\${isMultiDay(item)`, 'row name');
  rep(`\${dropBadge}</div>
          <div class="ep-line">\${lastEpBadgeHtml(item)}</div>`,
`\${dropBadge}</div>
          \${origNameHtml(item)}
          <div class="ep-line">\${lastEpBadgeHtml(item)}</div>`, 'row orig line');

  // ค้นหา + ป้ายถังขยะ
  rep(`!(item.name||'').toLowerCase().includes(s)) return false;`, `!nameMatches(item, s)) return false;`, 'matchesFilters');
  rep(`(item.name || '(ไม่มีชื่อ)')`, `(displayName(item) || '(ไม่มีชื่อ)')`, 'trash label');

  // ข้อมูลเก่า: ช่องชื่อแปลที่จริงๆ เป็นชื่อต้นฉบับ (ไม่มีไทย + เป็นอักษรเกาหลี/ญี่ปุ่น/จีน) -> ย้ายไป origName
  rep(`    if(!item.status){
      item.status = item.done ? 'done' : 'pending'; delete item.done; migrated = true;
    }`,
`    if(item.name && !item.origName && !hasThai(item.name) && hasCJK(item.name)){
      item.origName = item.name; item.name = ''; migrated = true;
    }
    if(!item.status){
      item.status = item.done ? 'done' : 'pending'; delete item.done; migrated = true;
    }`, 'migration');

  rep('</style>', `  .orig-name{ font-size:12px; color:var(--ink-soft); margin-top:1px; line-height:1.35; }
  .name-edit{ cursor:pointer; border-bottom:1px dashed transparent; }
  .name-edit:hover{ color:var(--blue); border-bottom-color:var(--blue); }
  .name-edit:hover::after{ content:" ✎"; font-size:11px; }
  .orig-edit{ cursor:pointer; }
  .orig-edit:hover{ color:var(--blue); }
  .orig-add{ display:block; margin-top:2px; padding:0; border:none; background:none; font-size:11.5px; color:var(--ink-soft); cursor:pointer; font-family:inherit; }
  .orig-add:hover{ color:var(--blue); text-decoration:underline; }
</style>`, 'css');
});

// ================= 35) โหมดเช็คลิขสิทธิ์ (LC) ในแท็บทุกเรื่อง =================
step('โหมดเช็ค LC (lcCheck)', 'function lcCellHtml(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'lccheck.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');
  rep('</style>', `  /* โหมดเช็ค LC */
  .lc-bar{ margin-bottom:10px; align-items:center; }
  .lc-progress{ font-size:12px; color:var(--ink-soft); white-space:nowrap; margin-left:4px; }
  .lc-cell{ display:flex; flex-direction:column; gap:5px; min-width:190px; }
  .lc-actions{ display:flex; flex-wrap:wrap; gap:5px; }
  .lc-badge{ display:inline-block; align-self:flex-start; padding:1px 8px; border-radius:6px; font-size:11.5px; font-weight:700; white-space:nowrap; }
  .lc-never{ background:#fdecec; color:#c0392b; }
  .lc-due{ background:#fdf3e3; color:#b9791b; }
  .lc-ok{ background:var(--green-bg); color:var(--green); }
  .lc-btn{ display:inline-flex; align-items:center; padding:4px 9px; border-radius:7px; border:1px solid var(--line); background:var(--card); color:var(--ink); font-size:12px; font-family:inherit; cursor:pointer; text-decoration:none; white-space:nowrap; }
  .lc-btn:hover{ border-color:var(--blue); color:var(--blue); }
  .lc-btn-weak{ border-style:dashed; color:var(--ink-soft); }
  .lc-btn-ok:hover{ border-color:var(--green); color:var(--green); }
  .lc-btn-found:hover{ border-color:#c0392b; color:#c0392b; }
</style>`, 'css');
});

// ================= 36) จำนวนตอน/สัปดาห์ต่อคน (เรื่องหลายวันนับตามวัน) =================
step('ตอน/สัปดาห์ ต่อคน', 'stat[r.person].week', () => {
  rep(`  PEOPLE.forEach(p=>stat[p]={stories:0, eps:0});`, `  PEOPLE.forEach(p=>stat[p]={stories:0, eps:0, week:0});`, 'workload init');
  rep(`    stat[r.person].stories++;`, `    stat[r.person].stories++;
    stat[r.person].week += weekEpCount(r);`, 'workload count');
  rep(`<div class="wl-nums"><b>\${s.stories}</b> เรื่อง · <b style=`,
      `<div class="wl-nums"><b>\${s.stories}</b> เรื่อง · <b>\${s.week}</b> ตอน/สัปดาห์ · <b style=`, 'workload card');
  rep(`<small>\${items.length} เรื่อง</small>`, `<small>\${items.length} เรื่อง · \${weekEpTotal(items)} ตอน/สัปดาห์</small>`, 'person section head');
});

// ================= 37) กำหนดการ: ตอนแรกออกก่อน แล้วที่เหลือตามวันเปิด =================
step('กำหนดการ: ตอนแรกออกก่อน (firstDate / firstout)', "firstout:", () => {
  rep(`  preparing: {label:'กำลังเตรียม', bg:'#fdf3e3', fg:'#b9791b'},`,
`  preparing: {label:'กำลังเตรียม', bg:'#fdf3e3', fg:'#b9791b'},
  firstout:  {label:'ตอนแรกออกแล้ว', bg:'#f1ecfa', fg:'#6a3fb3'},`, 'status');

  // นับถอยหลังไปวันถัดไปที่ต้องสนใจ (ตอนแรก หรือ ที่เหลือ)
  rep(`  if(entry.status === 'opened') return '';
  const d = daysUntil(entry.date);
  if(d === null) return '';
  if(d < 0) return \`<span class="overdue-badge" style="background:#e0403a">เลยมา \${-d} วัน</span>\`;
  if(d === 0) return \`<span class="overdue-badge" style="background:#e07a29">วันนี้</span>\`;
  if(d <= 3) return \`<span class="overdue-badge" style="background:#b9791b">อีก \${d} วัน</span>\`;
  return \`<span style="font-size:12px;color:var(--ink-soft);">อีก \${d} วัน</span>\`;`,
`  if(entry.status === 'opened') return '';
  const target = scheduleNextDate(entry);
  const pre = entry.firstDate ? (target === entry.firstDate ? 'ตอนแรก ' : 'ที่เหลือ ') : '';
  const d = daysUntil(target);
  if(d === null) return '';
  if(d < 0) return \`<span class="overdue-badge" style="background:#e0403a">\${pre}เลยมา \${-d} วัน</span>\`;
  if(d === 0) return \`<span class="overdue-badge" style="background:#e07a29">\${pre}วันนี้</span>\`;
  if(d <= 3) return \`<span class="overdue-badge" style="background:#b9791b">\${pre}อีก \${d} วัน</span>\`;
  return \`<span style="font-size:12px;color:var(--ink-soft);">\${pre}อีก \${d} วัน</span>\`;`, 'countdown');

  // modal: วันตอนแรก (ไม่บังคับ) + สถานะใหม่
  rep(`    <div class="field"><label>วันที่จะเปิด</label><div class="date-row"><input id="sDate" type="date">`,
`    <div class="field"><label>วันตอนแรกออก (ไม่บังคับ — เรื่องที่ตอนแรกมาก่อน)</label><div class="date-row"><input id="sFirstDate" type="date"><button type="button" class="btn btn-ghost date-today" onclick="setDateToday('sFirstDate')">วันนี้</button></div></div>
    <div class="field"><label>วันที่จะเปิด (ตอนที่เหลือ / ทั้งเรื่อง)</label><div class="date-row"><input id="sDate" type="date">`, 'modal first date');
  rep(`        <option value="preparing">กำลังเตรียม</option>
        <option value="opened">เปิดแล้ว</option>`,
`        <option value="preparing">กำลังเตรียม</option>
        <option value="firstout">ตอนแรกออกแล้ว</option>
        <option value="opened">เปิดแล้ว</option>`, 'modal status');
  rep(`  document.getElementById('sDate').value = entry ? (entry.date||'') : '';`,
`  document.getElementById('sDate').value = entry ? (entry.date||'') : '';
  document.getElementById('sFirstDate').value = entry ? (entry.firstDate||'') : '';`, 'openScheduleModal');
  rep(`    date: document.getElementById('sDate').value || '',`,
`    date: document.getElementById('sDate').value || '',
    firstDate: document.getElementById('sFirstDate').value || '',`, 'saveSchedule');

  // ส่งเข้าเรื่องเปิดใหม่สำเร็จ -> ติดธงที่กำหนดการ กันส่งซ้ำ
  rep(`function openNewModal(id){
  editingNewId = id || null;`,
`function openNewModal(id){
  editingNewId = id || null;
  scheduleSourceForNew = null;   // เปิดปกติ = ไม่ได้มาจากกำหนดการ`, 'openNewModal reset');
  rep(`    logActivity(\`เพิ่มเรื่องเปิดใหม่ "\${data.code}"\`);
  }`,
`    logActivity(\`เพิ่มเรื่องเปิดใหม่ "\${data.code}"\`);
    const src = scheduleSourceForNew && scheduleEntries.find(e=>e.id===scheduleSourceForNew);
    if(src) src.sentToNew = true;
  }
  scheduleSourceForNew = null;`, 'saveNewStory sentToNew');

  rep('</style>', `  .code-serial-bar{ display:flex; flex-wrap:wrap; align-items:center; gap:4px 6px; font-size:12.5px; color:var(--ink-soft); }
  .code-serial-bar b{ color:var(--ink); }
  .code-next{ border:1px dashed var(--blue); background:var(--blue-bg); color:var(--blue); border-radius:6px; padding:1px 7px; font:inherit; font-weight:700; cursor:pointer; }
  .code-next:hover{ border-style:solid; }
  .sched-first{ font-size:11.5px; color:#6a3fb3; font-weight:700; }
  .sched-act-first{ color:#6a3fb3; border-color:#6a3fb3; }
  .sched-sent{ font-size:12px; color:var(--green); font-weight:700; margin-right:6px; white-space:nowrap; }
</style>`, 'css');
});

// ================= 38) mergeById: รายการในถังขยะไม่มี id (ใช้ trashId) =================
// เดิมใช้ x.id อย่างเดียว -> ทุกชิ้นในถังขยะได้ key undefined ร่วมกัน -> merge ตอนเซฟเหลือชิ้นเดียว
step('mergeById ใช้ trashId เมื่อไม่มี id (ถังขยะหาย)', 'const mergeKey = ', () => {
  rep(`  const bm = {}, om = {}, tm = {};
  (baseArr||[]).forEach(x=>bm[x.id]=x);
  (oursArr||[]).forEach(x=>om[x.id]=x);
  (theirsArr||[]).forEach(x=>tm[x.id]=x);`,
`  const bm = {}, om = {}, tm = {};
  // ถังขยะเก็บเป็น trashId ไม่มี id — ไม่งั้นทุกชิ้นได้ key เดียวกันแล้วเหลือชิ้นเดียว
  const mergeKey = x => (x && x.id !== undefined) ? x.id : (x && x.trashId);
  (baseArr||[]).forEach(x=>bm[mergeKey(x)]=x);
  (oursArr||[]).forEach(x=>om[mergeKey(x)]=x);
  (theirsArr||[]).forEach(x=>tm[mergeKey(x)]=x);`, 'maps');
  rep(`  (oursArr||[]).forEach(x=>{ if(!seen.has(x.id)){orderIds.push(x.id);seen.add(x.id);} });
  (theirsArr||[]).forEach(x=>{ if(!seen.has(x.id)){orderIds.push(x.id);seen.add(x.id);} });`,
`  (oursArr||[]).forEach(x=>{ const k = mergeKey(x); if(!seen.has(k)){orderIds.push(k);seen.add(k);} });
  (theirsArr||[]).forEach(x=>{ const k = mergeKey(x); if(!seen.has(k)){orderIds.push(k);seen.add(k);} });`, 'order');
});

// ================= 39) A1: รีเซ็ตรายสัปดาห์/migration ตอนโหลดต้องถูกนับเป็น "การแก้ของเรา" =================
// เดิม snapshotAll() อยู่หลังรีเซ็ต -> lastSeen = ค่าหลังรีเซ็ต -> merge ตอนเซฟเห็นว่า "เราไม่ได้แก้"
// แล้วเอาค่าเก่าจาก remote กลับมา (รีเซ็ตถูกย้อน + last_reset_week ถูกตั้งแล้วเลยไม่ลองอีก)
step('A1 snapshot ก่อนรีเซ็ต/migration ตอนโหลด', '// lastSeen = ค่าจาก remote ก่อนแปลงใดๆ', () => {
  rep(`  if(!scheduleEntries){ scheduleEntries = SEED_SCHEDULE; needSave = true; }
`,
`  if(!scheduleEntries){ scheduleEntries = SEED_SCHEDULE; needSave = true; }
  // lastSeen = ค่าจาก remote ก่อนแปลงใดๆ — migration/รีเซ็ตด้านล่างจะได้นับเป็นการแก้ของเรา
  // (ถ้า snapshot หลังแก้ merge ตอนเซฟจะเห็นว่าเราไม่ได้แก้ แล้วเอาค่าเก่าจาก remote กลับมาทับ)
  snapshotAll();
`, 'snapshot early');
  rep(`  applyTodayFilter();

  snapshotAll();
  // บันทึกครั้งเดียว`,
`  applyTodayFilter();

  // บันทึกครั้งเดียว`, 'remove late snapshot');
  // รู้ว่าสัปดาห์นี้เช็ครีเซ็ตแล้ว (ใช้ร่วมกับ A6)
  rep(`  const thisWeekMonday = currentWeekMondayStr();
  let weekReset = false;`,
`  const thisWeekMonday = currentWeekMondayStr();
  weekCheckedFor = thisWeekMonday;
  let weekReset = false;`, 'mark week checked');
});

// ================= 40) A2 + A6: poll ไม่ทับงานในเครื่อง + รีเซ็ตรายสัปดาห์โดยไม่ต้องรีโหลด =================
step('A2 poll รวมกับงานในเครื่อง + A6 รีเซ็ตสัปดาห์ระหว่างเปิดค้าง', 'async function maybeWeeklyReset(', () => {
  rep(`async function pollOnce(){
  // มีงานรอเซฟ (debounce) หรือกำลังเซฟ -> ข้ามรอบนี้ กัน setColl() ทับการแก้ที่ยังไม่ได้ส่ง
  if(saveWaiter || saveTimer || saveInFlight) return;`,
`// A6: เปิดเว็บค้างข้ามจันทร์ 2 ทุ่ม -> รีเซ็ตสถานะให้เลย ไม่ต้องรอใครรีโหลด
// เช็ค storage ทีเดียวต่อสัปดาห์ (weekCheckedFor) — เครื่องอื่นรีเซ็ตไปแล้วก็แค่จำไว้
let weekCheckedFor = null;
async function maybeWeeklyReset(){
  const wk = currentWeekMondayStr();
  if(weekCheckedFor === wk) return;
  let last;
  try{ const w = await window.storage.get('last_reset_week', true); last = w ? w.value : null; }
  catch(e){ return; }                                   // อ่านไม่ได้ = ลองรอบหน้า
  if(saveWaiter || saveTimer || saveInFlight) return;   // มีงานค้างเซฟ = ลองรอบหน้า
  weekCheckedFor = wk;
  if(last === wk) return;
  try{ await window.storage.set('last_reset_week', wk, true); }catch(e){ weekCheckedFor = null; return; }
  if(resetNonPendingToPending(recurring)){
    pendingExternalRender = true;
    showToast('ขึ้นสัปดาห์ใหม่ — รีเซ็ตสถานะที่ทำ/งด/เลื่อนแล้วให้อัตโนมัติ');
    await persistData(false);
  }
}

async function pollOnce(){
  // มีงานรอเซฟ (debounce) หรือกำลังเซฟ -> ข้ามรอบนี้ กัน setColl() ทับการแก้ที่ยังไม่ได้ส่ง
  if(saveWaiter || saveTimer || saveInFlight) return;
  await maybeWeeklyReset();
  if(saveWaiter || saveTimer || saveInFlight) return;`, 'pollOnce head');

  rep(`  if(remote && typeof remote==='object' && !saveInFlight){
    for(const k of DATA_KEYS){
      if(!Array.isArray(remote[k])) continue;
      const val = JSON.stringify(remote[k]);
      if(val !== lastSeen[k]){
        setColl(k, remote[k]);
        lastSeen[k] = val;
        changed = true;
      }
    }
  }`,
`  // A2: ระหว่างรอ remote ผู้ใช้อาจกดอะไรไปแล้ว -> มีงานรอเซฟ = ปล่อยให้เซฟรอบนั้น merge เอง
  if(saveWaiter || saveTimer || saveInFlight) remote = null;
  let localPending = false;
  if(remote && typeof remote==='object'){
    for(const k of DATA_KEYS){
      if(!Array.isArray(remote[k])) continue;
      const val = JSON.stringify(remote[k]);
      if(val !== lastSeen[k]){
        const local = getColl(k) || [];
        if(JSON.stringify(local) !== lastSeen[k]){
          // ในเครื่องมีการแก้ที่ยังไม่ได้เซฟ (เช่นเซฟล้มแล้วรอ retry) -> รวม ไม่ทับ แล้วเซฟผลรวม
          const base = lastSeen[k] ? JSON.parse(lastSeen[k]) : remote[k];
          setColl(k, mergeById(base, local, remote[k]));
          localPending = true;
        } else {
          setColl(k, remote[k]);
        }
        lastSeen[k] = val;
        changed = true;
      }
    }
  }
  if(localPending) persistData(false);`, 'pollOnce merge');
});

// ================= 41) A5: เตือนทีมเมื่อ backup อัตโนมัติไม่ได้รันนานเกิน 36 ชม. =================
// สคริปต์ backup เขียน key backup_status = {at, counts} ทุกครั้งที่สำเร็จ
step('A5 เตือน backup ไม่ได้รัน', 'function backupStaleChip(', () => {
  rep(`async function pollOnce(){`,
`// ===== สถานะ backup อัตโนมัติ (สคริปต์ backup เขียน backup_status ทุกครั้งที่สำเร็จ) =====
const BACKUP_STALE_HOURS = 36;
let backupStatusAt = null, backupCheckedAt = 0;
async function refreshBackupStatus(){
  backupCheckedAt = Date.now();
  try{
    const r = await window.storage.get('backup_status', true);
    const v = r && r.value ? JSON.parse(r.value) : null;
    const at = v && v.at ? Date.parse(v.at) : NaN;
    const next = isNaN(at) ? null : at;
    if(next !== backupStatusAt){ backupStatusAt = next; renderStats(); }
  }catch(e){}   // อ่านไม่ได้ = ไม่เตือน (ไม่อยากให้เตือนผิดตอนเน็ตหลุด)
}
function backupStaleChip(){
  if(!backupStatusAt) return '';
  const h = (Date.now() - backupStatusAt) / 3600000;
  if(h < BACKUP_STALE_HOURS) return '';
  const label = h < 48 ? Math.floor(h) + ' ชม.' : Math.floor(h / 24) + ' วัน';
  return \`<div class="stat-chip" style="background:rgba(224,64,58,.45);" title="สคริปต์ backup ในเครื่องที่ตั้งไว้ไม่ได้รันมา \${label} — เปิดเครื่องนั้น หรือดู backup.log">⚠ backup ล่าสุด \${label}ก่อน</div>\`;
}

async function pollOnce(){
  if(Date.now() - backupCheckedAt > 30 * 60000) refreshBackupStatus();`, 'poll + helpers');
  rep(`    <div class="stat-chip stat-min"><b>\${totalSpent.toLocaleString('th-TH')}</b> บาทที่ใช้ไป</div>`,
`    <div class="stat-chip stat-min"><b>\${totalSpent.toLocaleString('th-TH')}</b> บาทที่ใช้ไป</div>
    \${backupStaleChip()}`, 'stat chip');
  rep(`  render();
  startRealtimeSync();`,
`  render();
  refreshBackupStatus();
  startRealtimeSync();`, 'load');
});

// ================= 42) B1: แถบ "ผ่านวันแล้วยังไม่ได้ทำ" บนงานประจำ =================
step('B1 แถบผ่านวันแล้วยังไม่ทำ', 'function missedStripHtml(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'missed.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');
  rep(`    \${dayLinksBarHtml()}
    \${filterToggleHtml()}`,
`    \${dayLinksBarHtml()}
    \${missedStripHtml()}
    \${filterToggleHtml()}`, 'strip');
  rep('</style>', `  /* B1 ผ่านวันแล้วยังไม่ทำ */
  .missed-strip{ border:1px solid #f0d9a8; background:#fdf6e7; border-radius:12px; margin:0 0 12px; overflow:hidden; }
  .missed-head{ display:flex; justify-content:space-between; align-items:center; gap:8px; padding:9px 14px; cursor:pointer; font-size:13.5px; color:#8a5a00; }
  .missed-toggle{ font-size:12px; white-space:nowrap; }
  .missed-list{ border-top:1px solid #f0d9a8; background:var(--card); }
  .missed-row{ display:flex; align-items:center; gap:8px; padding:7px 12px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .missed-row:last-child{ border-bottom:none; }
  .missed-name{ flex:1; min-width:140px; font-size:13px; }
  .missed-name small{ margin-left:6px; color:var(--ink-soft); font-size:11.5px; }
  body.dark .missed-strip{ background:#3a2d14; border-color:#5a4720; }
  body.dark .missed-head{ color:#e3b463; }
</style>`, 'css');
});

// ================= 43) B2: ประวัติครบขึ้น + ถามก่อนติ๊กแทนคนอื่น =================
step('B2 ลงประวัติตอนค้าง/ติ๊ก/ลิงก์ + ถามก่อนติ๊กแทน', '// B2: ติ๊กแทนคนอื่น', () => {
  rep(`  bumpLastEp(item, eps[i]);
  eps.splice(i, 1);
  item.pendingEpisodes = eps;`,
`  bumpLastEp(item, eps[i]);
  logActivity(\`ทำตอนค้าง "\${displayName(item) || item.code}" \${epLabel(eps[i])} แล้ว\`);
  eps.splice(i, 1);
  item.pendingEpisodes = eps;`, 'removeEpisodeAt');
  rep(`  eps.forEach(e=>{ if(!have.has(epKey(e))) have.set(epKey(e), e); });
  item.pendingEpisodes = sortEpisodes([...have.values()]);
  document.getElementById('epAddInput').value = '';`,
`  const added = eps.filter(e=>!have.has(epKey(e)));
  eps.forEach(e=>{ if(!have.has(epKey(e))) have.set(epKey(e), e); });
  item.pendingEpisodes = sortEpisodes([...have.values()]);
  if(added.length) logActivity(\`ใส่ตอนค้าง "\${displayName(item) || item.code}" \${added.map(epLabel).join(', ')}\`);
  document.getElementById('epAddInput').value = '';`, 'addEpisodes');
  rep(`  if(!await uiConfirm('ทำครบทุกตอนแล้ว เอาตอนที่ค้างออกทั้งหมด?', 'เคลียร์ทุกตอน')) return;
  bumpLastEp(item, item.pendingEpisodes);`,
`  if(!await uiConfirm('ทำครบทุกตอนแล้ว เอาตอนที่ค้างออกทั้งหมด?', 'เคลียร์ทุกตอน')) return;
  logActivity(\`เคลียร์ตอนค้าง "\${displayName(item) || item.code}" ทั้งหมด (\${sortEpisodes(item.pendingEpisodes).map(epLabel).join(', ')})\`);
  bumpLastEp(item, item.pendingEpisodes);`, 'clearAllEpisodes');
  rep(`  item.link = url;
  renderRecurring();`,
`  item.link = url;
  logActivity(\`ใส่ลิงก์ต้นทาง "\${displayName(item) || item.code}"\`);
  renderRecurring();`, 'promptLink');
  rep(`  item.gdrive = url;
  renderRecurring();`,
`  item.gdrive = url;
  logActivity(\`ใส่ลิงก์ Drive "\${displayName(item) || item.code}"\`);
  renderRecurring();`, 'promptDriveLink');
  rep(`  item.contrib = item.contrib || {};
  item.contrib[person] = !item.contrib[person];`,
`  item.contrib = item.contrib || {};
  // B2: ติ๊กแทนคนอื่น -> ถามก่อน (กันกดผิดช่อง)
  if(myPerson && person !== myPerson
     && !await uiConfirm(\`\${item.contrib[person] ? 'เอาติ๊กของ' : 'ติ๊กแทน'} \${person} ใน "\${item.code}"?\`, item.contrib[person] ? 'เอาออก' : 'ติ๊กแทน')){
    renderNewStories(); return;
  }
  item.contrib[person] = !item.contrib[person];
  logActivity(\`\${item.contrib[person] ? 'ติ๊ก' : 'เอาติ๊กออก'} "\${item.code}" ช่อง \${person}\${myPerson && person !== myPerson ? ' (แทน)' : ''}\`);`, 'toggleContrib');
});

// ================= 44) UI งานประจำ: ✓ คลิกเดียว + ⋯ + เลิกทำ + คีย์บอร์ด + ปฏิทินคลิกย้าย =================
step('UI: สถานะคลิกเดียว / เมนู ⋯ / เลิกทำ / Esc-Enter / ปฏิทินคลิกย้าย', 'function statusCtlHtml(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'uiux.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // แถว: select สถานะ + ⏏ ✎ ✕ -> ปุ่มสถานะ + ⋯
  rep(`          <select class="status-select" style="background:\${STATUS_META[dayStatus(item,rowDay)].bg};color:\${STATUS_META[dayStatus(item,rowDay)].fg};"
            onchange="updateStatus('\${item.id}', this.value, '\${rowDay}')">
            \${Object.keys(STATUS_META).map(k=>\`<option value="\${k}" \${(dayStatus(item,rowDay)===k)?'selected':''}>\${STATUS_META[k].label}</option>\`).join('')}
          </select>
          \${item.dropped
            ? \`<button class="icon-btn" onclick="undropStory('\${item.id}')" title="ยกเลิกการรอดรอป" style="color:#1a9c6b;">↩</button>\`
            : \`<button class="icon-btn" onclick="openDropMenu('\${item.id}')" title="ดรอปเรื่อง (จบซีซั่น / จบแล้ว / LC / งดไม่มีกำหนด)" style="color:#b9791b;">⏏</button>\`}
          <button class="icon-btn" onclick="openRecurringModal('\${item.id}')" title="แก้ไข" style="color:#6b7480;">✎</button>
          <button class="icon-btn" onclick="deleteRecurring('\${item.id}')">✕</button>`,
`          \${statusCtlHtml(item, rowDay)}
          <button type="button" class="icon-btn row-more" onclick="openRowMenu(this,'\${item.id}')" title="แก้ไข / ดรอป / ลบ" aria-label="เมนูเรื่องนี้">⋯</button>`, 'row controls');

  // ตอนค้าง: ✕ (ที่จริงแปลว่าทำเสร็จ) -> ✓
  rep(`<button onclick="removeEpisodeAt(\${i})" title="ทำเสร็จแล้ว">✕</button>`,
      `<button class="ep-done" onclick="removeEpisodeAt(\${i})" title="ทำตอนนี้เสร็จแล้ว" aria-label="ทำตอนนี้เสร็จแล้ว">✓</button>`, 'ep chip');

  // ---- เลิกทำ ----
  rep(`  if(!item || !STATUS_META[value]) return;
  day = day && itemDays(item).includes(day) ? day : itemDays(item)[0];`,
`  if(!item || !STATUS_META[value]) return;
  const undoSnap = snapItem('recurring_stories', id);
  day = day && itemDays(item).includes(day) ? day : itemDays(item)[0];`, 'updateStatus snap');
  rep(`  logActivity(\`เปลี่ยนสถานะ "\${item.name||item.code}"\${isMultiDay(item)?' ('+day+')':''} เป็น \${STATUS_META[value].label}\`);`,
`  logActivity(\`เปลี่ยนสถานะ "\${item.name||item.code}"\${isMultiDay(item)?' ('+day+')':''} เป็น \${STATUS_META[value].label}\`);
  offerUndo(\`"\${displayName(item) || item.code}" → \${STATUS_META[value].label}\`, [undoSnap]);`, 'updateStatus undo');
  rep(`  bumpLastEp(item, eps[i]);
  logActivity(\`ทำตอนค้าง "\${displayName(item) || item.code}" \${epLabel(eps[i])} แล้ว\`);`,
`  const undoSnap = snapItem('recurring_stories', item.id);
  bumpLastEp(item, eps[i]);
  logActivity(\`ทำตอนค้าง "\${displayName(item) || item.code}" \${epLabel(eps[i])} แล้ว\`);
  offerUndo(\`ทำ\${epLabel(eps[i])} "\${displayName(item) || item.code}" แล้ว\`, [undoSnap]);`, 'removeEpisodeAt undo');
  rep(`  item.contrib[person] = !item.contrib[person];
  logActivity(`,
`  const undoSnap = snapItem('new_stories', id);
  item.contrib[person] = !item.contrib[person];
  offerUndo(\`\${item.contrib[person] ? 'ติ๊ก' : 'เอาติ๊กออก'} \${person} "\${item.code}"\`, [undoSnap]);
  logActivity(`, 'toggleContrib undo');
  rep(`  item.lcCheck = { at: new Date().toISOString(), by: currentUserName() };
  logActivity(\`เช็ค LC "\${displayName(item) || item.code}" — ยังไม่มี\`);`,
`  const undoSnap = snapItem('recurring_stories', id);
  item.lcCheck = { at: new Date().toISOString(), by: currentUserName() };
  logActivity(\`เช็ค LC "\${displayName(item) || item.code}" — ยังไม่มี\`);
  offerUndo(\`เช็ค LC "\${displayName(item) || item.code}"\`, [undoSnap]);`, 'markLcChecked undo');
  rep(`  item.lcCheck = { at: new Date().toISOString(), by: currentUserName(), found: true };`,
`  const undoSnap = snapItem('recurring_stories', id);
  offerUndo(\`ดรอป (LC) "\${displayName(item) || item.code}"\`, [undoSnap]);
  item.lcCheck = { at: new Date().toISOString(), by: currentUserName(), found: true };`, 'markLcFound undo');

  // ---- ปฏิทิน: คลิกเรื่อง แล้วคลิกช่อง = ย้าย (ลากยังใช้ได้) + เลิกทำ ----
  rep(`function renderCalendar(){
  const container = document.getElementById('mainContent');`,
`// คลิกเลือกเรื่องในปฏิทิน แล้วคลิกช่องปลายทาง (แทนการลากด้วยเมาส์)
let calSel = null, calJustDragged = false;
function calClearSel(){
  calSel = null;
  document.querySelectorAll('.cal-chip-selected').forEach(c=>c.classList.remove('cal-chip-selected'));
  const g = document.getElementById('calCapture'); if(g) g.classList.remove('cal-selecting');
}
function calSelectChip(chip){
  const same = calSel && calSel.id === chip.dataset.id && calSel.from === chip.dataset.from;
  calClearSel();
  if(same) return;
  calSel = { id: chip.dataset.id, from: chip.dataset.from };
  chip.classList.add('cal-chip-selected');
  const g = document.getElementById('calCapture'); if(g) g.classList.add('cal-selecting');
}
function renderCalendar(){
  calSel = null;
  const container = document.getElementById('mainContent');`, 'calendar select helpers');
  rep(`ลากเรื่องไปวางช่องอื่นเพื่อย้ายวัน/ย้ายคน · มือถือแตะค้างแล้วลาก`,
      `ลากเรื่องไปวางช่องอื่น หรือคลิกเรื่องแล้วคลิกช่องที่จะย้ายไป (Esc ยกเลิก) · มือถือแตะค้างแล้วลาก`, 'calendar hint');
  rep(`    if(e.pointerType === 'mouse'){
      start(chip, e.clientX, e.clientY);
      e.preventDefault();
    } else {`,
`    if(e.pointerType === 'mouse'){
      e.preventDefault();   // เริ่มลากเมื่อขยับเกิน 5px — คลิกเฉยๆ = เลือกเรื่อง (ดู click ด้านล่าง)
    } else {`, 'mouse no instant drag');
  rep(`    if(!drag.started){
      if(Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 10){ clearTimeout(drag.holdTimer); drag = null; }
      return;
    }`,
`    if(!drag.started){
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if(e.pointerType === 'mouse'){ if(dist <= 5) return; calClearSel(); start(drag.chip, e.clientX, e.clientY); }
      else { if(dist > 10){ clearTimeout(drag.holdTimer); drag = null; } return; }
    }`, 'mouse drag threshold');
  rep(`    drag = null;
    if(!started || cancelled) return;`,
`    drag = null;
    if(started) calJustDragged = true;
    if(!started || cancelled) return;`, 'mark dragged');
  rep(`  // ถ้ากำลังลากอยู่ ห้ามหน้าเลื่อนตาม (มือถือ)`,
`  root.addEventListener('click', e=>{
    if(calJustDragged){ calJustDragged = false; return; }
    const chip = e.target.closest('.cal-chip');
    if(chip){ calSelectChip(chip); return; }
    const cell = e.target.closest('.cal-items[data-person]');
    if(cell && calSel){ const s = calSel; calClearSel(); moveCalendarItem(s.id, cell.dataset.person, cell.dataset.day, s.from); }
  });
  // ถ้ากำลังลากอยู่ ห้ามหน้าเลื่อนตาม (มือถือ)`, 'click to move');
  rep(`  const from = \`\${item.person||'ไม่ระบุ'} / \${collapse ? days.join(', ') : (fromDay||'ไม่ระบุวัน')}\`;`,
`  const from = \`\${item.person||'ไม่ระบุ'} / \${collapse ? days.join(', ') : (fromDay||'ไม่ระบุวัน')}\`;
  const undoSnap = snapItem('recurring_stories', id);`, 'calendar snap');
  rep(`  logActivity(\`ย้าย "\${name}" \${from} → \${person} / \${day}\${note}\`);`,
`  logActivity(\`ย้าย "\${name}" \${from} → \${person} / \${day}\${note}\`);
  offerUndo(\`ย้าย "\${name}" → \${person} · \${CAL_DAY_LABEL[day] || day}\`, [undoSnap]);`, 'calendar undo');

  // modal เปิดแล้ว เคอร์เซอร์ไปช่องแรก
  rep(`function openModal(id){ document.getElementById(id).classList.add('show'); }`,
`function openModal(id){
  const m = document.getElementById(id);
  m.classList.add('show');
  setTimeout(()=>{ if(!m.contains(document.activeElement)){ const f = m.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea'); if(f) f.focus(); } }, 60);
}`, 'openModal focus');

  rep('</style>', `  /* UI: ปุ่มสถานะ / เมนู / เลิกทำ */
  .st-ctl{ display:inline-flex; border-radius:8px; overflow:hidden; flex-shrink:0; }
  .st-main, .st-more{ border:none; font:inherit; font-size:12px; font-weight:700; cursor:pointer; padding:6px 10px; }
  .st-main{ min-width:78px; }
  .st-more{ padding:6px 7px; border-left:1px solid rgba(0,0,0,.08); }
  .st-main:hover, .st-more:hover{ filter:brightness(.94); }
  .row-more{ font-size:18px; line-height:1; color:#6b7480; }
  .pop-menu{ position:fixed; z-index:100000; background:var(--card); border:1px solid var(--line); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.18); padding:4px; min-width:170px; }
  .pop-item{ display:block; width:100%; text-align:left; border:none; background:none; font:inherit; font-size:13px; padding:8px 12px; border-radius:7px; cursor:pointer; color:var(--ink); }
  .pop-item:hover, .pop-item:focus{ background:var(--fill); outline:none; }
  .pop-active{ font-weight:700; }
  .pop-danger{ color:#c0392b; }
  .ep-chip .ep-done{ color:var(--green); font-weight:800; }
  .undo-toast{ position:fixed; left:50%; bottom:24px; transform:translate(-50%, 20px); opacity:0; pointer-events:none; z-index:100001; display:flex; align-items:center; gap:14px; background:#1f2430; color:#fff; padding:10px 12px 10px 16px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25); font-size:13.5px; transition:.18s; max-width:calc(100vw - 32px); }
  .undo-toast.show{ opacity:1; transform:translate(-50%, 0); pointer-events:auto; }
  .undo-btn{ border:none; background:#ffd36b; color:#1f2430; font:inherit; font-weight:800; padding:6px 12px; border-radius:8px; cursor:pointer; white-space:nowrap; }
  .cal-chip-selected{ outline:2px solid var(--blue); background:var(--blue-bg) !important; }
  .cal-selecting .cal-items[data-person]{ cursor:copy; }
  .cal-selecting .cal-items[data-person]:hover{ background:var(--blue-bg); }
</style>`, 'css');
});

// ================= 45) ตอนค้างในแถว: กด ✕ ข้างเลขตอน = ทำตอนนั้นเสร็จ (ไม่ต้องเปิดหน้าต่าง) =================
step('ตอนค้างในแถวกด ✕ ได้เลย', 'async function finishEpInline(', () => {
  rep(`  const list = eps.map(e=>typeof e==='number' ? e : e).join(', ');
  return \`<div class="ep-line">\`
    + \`<span class="overdue-badge" style="background:\${bg}">ค้าง \${eps.length} ตอน\${hasForeignBacklog(item) ? ' · ' + esc(foreignBacklogLabel(item)) : ''}</span>\`
    + \` <span class="ep-list">ตอน \${esc(list)}</span></div>\`;
}`,
`  // แต่ละตอนเป็นชิป กด ✕ = ทำตอนนั้นเสร็จ (ตอนของคนอื่นบอกชื่อคนเคลียร์ใน title)
  const chips = eps.map((e, i)=>{
    const owner = epOwner(item, e);
    const tip = 'ทำ' + epLabel(e) + ' เสร็จแล้ว' + (owner && owner !== item.person ? ' (ของ ' + owner + ')' : '');
    return \`<span class="ep-inline">\${esc(typeof e === 'number' ? String(e) : e)}<button type="button" onclick="finishEpInline('\${item.id}', \${i})" title="\${esc(tip)}" aria-label="\${esc(tip)}">✕</button></span>\`;
  }).join('');
  return \`<div class="ep-line">\`
    + \`<span class="overdue-badge" style="background:\${bg}">ค้าง \${eps.length} ตอน\${hasForeignBacklog(item) ? ' · ' + esc(foreignBacklogLabel(item)) : ''}</span>\`
    + \` <span class="ep-list">ตอน</span>\${chips}</div>\`;
}
// กด ✕ ข้างเลขตอนในแถว = ทำตอนนั้นเสร็จ (เหมือนกด ✓ ในหน้าต่างตอนค้าง) + เลิกทำได้ 5 วิ
async function finishEpInline(id, i){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const eps = sortEpisodes(item.pendingEpisodes);
  if(i < 0 || i >= eps.length) return;
  const undoSnap = snapItem('recurring_stories', id);
  const ep = eps[i];
  bumpLastEp(item, ep);
  eps.splice(i, 1);
  item.pendingEpisodes = eps;
  clearPendingOwnerIfDone(item);
  logActivity(\`ทำตอนค้าง "\${displayName(item) || item.code}" \${epLabel(ep)} แล้ว\`);
  offerUndo(\`ทำ\${epLabel(ep)} "\${displayName(item) || item.code}" แล้ว\`, [undoSnap]);
  renderRecurring(); renderStats();
  await persistRecurring(false);
  if(item.dropped && pendingEpCount(item) === 0) showToast(\`เคลียร์ตอนค้างหมดแล้ว — ย้าย "\${displayName(item) || item.code}" เข้าดรอป/จบให้เรียบร้อย\`);
}`, 'overdue badge chips');
  rep('</style>', `  .ep-inline{ display:inline-flex; align-items:center; gap:2px; padding:0 2px 0 7px; border:1px solid #f3c4bf; background:#fdecec; color:#c0392b; border-radius:999px; font-size:12px; font-weight:700; line-height:20px; }
  .ep-inline button{ border:none; background:none; color:#c0392b; cursor:pointer; font-size:11px; line-height:1; padding:2px 5px; border-radius:999px; }
  .ep-inline button:hover{ background:#c0392b; color:#fff; }
  body.dark .ep-inline{ background:#3a1f1d; border-color:#6b2d27; color:#f08a80; }
  body.dark .ep-inline button{ color:#f08a80; }
</style>`, 'css');
});

// ================= 46) ปฏิทิน: ดับเบิลคลิกเรื่อง = แก้ไข =================
step('ปฏิทินดับเบิลคลิกแก้ไข', "root.addEventListener('dblclick'", () => {
  rep(`  // ถ้ากำลังลากอยู่ ห้ามหน้าเลื่อนตาม (มือถือ)`,
`  // ดับเบิลคลิกเรื่อง = เปิดหน้าต่างแก้ไข (2 คลิกแรกเลือก/ยกเลิกเลือกไปแล้ว — ล้างให้ก่อน)
  root.addEventListener('dblclick', e=>{
    const chip = e.target.closest('.cal-chip');
    if(!chip) return;
    calClearSel();
    openRecurringModal(chip.dataset.id);
  });
  // ถ้ากำลังลากอยู่ ห้ามหน้าเลื่อนตาม (มือถือ)`, 'dblclick');
  rep(`ลากเรื่องไปวางช่องอื่น หรือคลิกเรื่องแล้วคลิกช่องที่จะย้ายไป (Esc ยกเลิก)`,
      `ลากเรื่องไปวางช่องอื่น หรือคลิกเรื่องแล้วคลิกช่องที่จะย้ายไป (Esc ยกเลิก) · ดับเบิลคลิกเพื่อแก้ไข`, 'hint');
  rep(`title="ลากเพื่อย้ายวัน/ย้ายคน\${isMultiDay(r)?' (ย้ายเฉพาะวันนี้)':''}"`,
      `title="ลากหรือคลิกเพื่อย้ายวัน/ย้ายคน\${isMultiDay(r)?' (ย้ายเฉพาะวันนี้)':''} · ดับเบิลคลิกเพื่อแก้ไข"`, 'chip title');
  // แก้ไขจากแท็บไหน บันทึกแล้วอยู่แท็บนั้น (เดิมพาไปงานประจำเสมอ — ตั้งใจไว้สำหรับย้ายจากเรื่องเปิดใหม่)
  rep(`  promoteFromNewId = null;
  editingRecurringId = null;
  closeModal('modalRecurring');
  // ย้ายมาจากแท็บอื่น -> พาไปดูที่งานประจำ (แท็บเดิมไม่ต้องสลับ จะได้ไม่ล้างคำค้น)
  if(activeTab !== 'recurring') switchTab('recurring'); else renderRecurring();`,
`  const wasEdit = !!editingRecurringId;
  promoteFromNewId = null;
  editingRecurringId = null;
  closeModal('modalRecurring');
  // เพิ่ม/ย้ายมาจากแท็บอื่น -> พาไปดูที่งานประจำ · แก้ไขเรื่องเดิม -> อยู่แท็บเดิม (เช่น แก้จากปฏิทิน)
  if(activeTab !== 'recurring' && !wasEdit) switchTab('recurring'); else renderTab();`, 'stay on tab after edit');
});

// ================= 47) A3: เซฟแบบเช็คเวอร์ชัน — มีคนเขียนแทรกระหว่างอ่าน-เขียน = อ่านใหม่ merge ใหม่ =================
// เดิม: อ่าน -> merge -> upsert ทับ ถ้า 2 เครื่องอ่านเวอร์ชันเดียวกันแล้วเขียนห่างกันไม่ถึงวิ ของคนแรกหาย
step('A3 เซฟแบบเช็คเวอร์ชัน (updated_at)', 'async setIfUnchanged(', () => {
  rep(`      return true;
    }
  };

  // ---------- realtime ----------`,
`      return true;
    },

    // เขียนเฉพาะเมื่อแถวยังเป็นเวอร์ชันที่อ่านล่าสุด (updated_at ตรงกับแคช)
    // คืน false = มีคนเขียนแทรกตั้งแต่เราอ่าน (ผู้เรียกต้องอ่านใหม่ merge ใหม่)
    async setIfUnchanged(key, value, shared){
      await ready;
      const scope = scopeOf(shared);
      const ck = scope + '|' + key;
      const hit = cache[ck];
      const val = String(value);
      const stamp = new Date().toISOString();
      if(!hit){
        // ยังไม่เคยเห็นแถวนี้ (แถวใหม่) = เขียนแบบเดิม
        const r0 = await sb.from(TABLE).upsert({ scope: scope, key: key, value: val, updated_at: stamp }, { onConflict: 'scope,key' }).select('updated_at').maybeSingle();
        if(r0.error){ delete cache[ck]; throw new Error(r0.error.message); }
        cache[ck] = { updated_at: (r0.data && r0.data.updated_at) ? r0.data.updated_at : stamp, value: val };
        return true;
      }
      const r = await sb.from(TABLE).update({ value: val, updated_at: stamp })
        .eq('scope', scope).eq('key', key).eq('updated_at', hit.updated_at)
        .select('updated_at');
      if(r.error){ delete cache[ck]; throw new Error(r.error.message); }
      if(!r.data || !r.data.length) return false;
      cache[ck] = { updated_at: r.data[0].updated_at || stamp, value: val };
      return true;
    }
  };

  // ---------- realtime ----------`, 'shim setIfUnchanged');
});

// แยกขั้น: shim มาจาก index.html ปัจจุบัน (ขั้น 1) ซึ่งมี setIfUnchanged อยู่แล้วหลังรวมเว็บ
// ถ้าอยู่ขั้นเดียวกัน marker ของ shim จะทำให้ข้ามส่วน persistDataNow ไปด้วย
step('A3 เซฟวนอ่านใหม่เมื่อชน (persistDataNow)', 'const careful = attempt < 3', () => {
  rep(`    let remote = null;
    let readFailed = false;
    try{
      const res = await window.storage.get('appdata', true);
      if(res && res.value) remote = JSON.parse(res.value);
    }catch(e){ readFailed = true; }
    // อ่านของปัจจุบันไม่ได้ = ไม่รู้ว่ากำลังจะทับอะไร -> ไม่เขียน เก็บงานไว้ในเครื่องแล้วลองใหม่
    if(readFailed){
      showToast('เชื่อมต่อไม่ได้ ยังไม่ได้บันทึก — จะลองใหม่ให้เอง');
      scheduleSaveRetry();
      return;
    }
    let pulledExternal = false;
    const full = {};
    for(const k of DATA_KEYS){
      const ours = getColl(k) || [];
      const theirs = remote && Array.isArray(remote[k]) ? remote[k] : null;
      let merged = ours;
      if(theirs){
        const base = lastSeen[k] ? JSON.parse(lastSeen[k]) : theirs;
        merged = mergeById(base, ours, theirs);
        if(JSON.stringify(merged) !== JSON.stringify(ours)) pulledExternal = true;
      }
      setColl(k, merged);
      full[k] = merged;
    }
    // เขียน 1 ครั้ง — ล้มเหลวลองซ้ำเอง 1 ที (กัน rate limit ชั่วคราว)
    const s = JSON.stringify(full);
    try{
      await window.storage.set('appdata', s, true);
    }catch(e1){
      await new Promise(r=>setTimeout(r, 900));
      await window.storage.set('appdata', s, true);
    }`,
`    let pulledExternal = false;
    let full = null;
    // ฐานของ merge: รอบแรก = ที่เห็นล่าสุด / ถ้าเขียนชน = remote ที่เพิ่ง merge ไปแล้ว (ของเราเทียบกับมัน = งานเราล้วนๆ)
    const bases = {};
    for(const k of DATA_KEYS) bases[k] = lastSeen[k] || null;
    for(let attempt = 0; ; attempt++){
      let remote = null;
      let readFailed = false;
      try{
        const res = await window.storage.get('appdata', true);
        if(res && res.value) remote = JSON.parse(res.value);
      }catch(e){ readFailed = true; }
      // อ่านของปัจจุบันไม่ได้ = ไม่รู้ว่ากำลังจะทับอะไร -> ไม่เขียน เก็บงานไว้ในเครื่องแล้วลองใหม่
      if(readFailed){
        showToast('เชื่อมต่อไม่ได้ ยังไม่ได้บันทึก — จะลองใหม่ให้เอง');
        scheduleSaveRetry();
        return;
      }
      full = {};
      for(const k of DATA_KEYS){
        const ours = getColl(k) || [];
        const theirs = remote && Array.isArray(remote[k]) ? remote[k] : null;
        let merged = ours;
        if(theirs){
          const base = bases[k] ? JSON.parse(bases[k]) : theirs;
          merged = mergeById(base, ours, theirs);
          if(JSON.stringify(merged) !== JSON.stringify(ours)) pulledExternal = true;
          bases[k] = JSON.stringify(theirs);
        }
        setColl(k, merged);
        full[k] = merged;
      }
      const s = JSON.stringify(full);
      // A3: เขียนเฉพาะเมื่อไม่มีใครเขียนแทรกตั้งแต่อ่าน — ชน = วนอ่านใหม่ merge ใหม่
      // ชนเกิน 3 รอบ (หรือไม่มี setIfUnchanged) = เขียนแบบเดิม ไม่ปล่อยงานค้างไม่ได้เซฟ
      const careful = attempt < 3 && typeof window.storage.setIfUnchanged === 'function';
      const write = () => careful ? window.storage.setIfUnchanged('appdata', s, true) : window.storage.set('appdata', s, true).then(()=>true);
      let wrote;
      try{ wrote = await write(); }
      catch(e1){ await new Promise(r=>setTimeout(r, 900)); wrote = await write(); }   // ล้มเหลวลองซ้ำ 1 ที (rate limit ชั่วคราว)
      if(wrote) break;
      if(attempt === 2){
        console.warn('save: เขียนชนติดกัน 3 รอบ — เขียนแบบไม่เช็คเวอร์ชัน');
        showToast('⚠ บันทึกแบบเช็คเวอร์ชันไม่สำเร็จ 3 รอบ — บันทึกแบบเดิมแล้ว (ถ้าขึ้นบ่อย แจ้งผู้ดูแล)');
      }
    }`, 'persistDataNow CAS loop');
});

// ================= 48) กำหนดการ: โน้ตทีม (แก้ได้ ใช้ร่วมกันทั้งทีม) =================
// เก็บเป็น key แยก schedule_note (ข้อความล้วน) — เขียนทับทั้งก้อน คนแก้ล่าสุดชนะ
// โชว์เฉพาะในหน้าต่าง "เพิ่มกำหนดการเปิดเรื่อง" (ใช้ดูตัวเลขของแต่ละเว็บตอนกรอกวันที่)
step('กำหนดการ: โน้ตในหน้าต่างเพิ่มกำหนดการ', 'function scheduleNoteHtml(', () => {
  rep(`    <h3 id="scheduleModalTitle">เพิ่มกำหนดการเปิดเรื่อง</h3>`,
`    <h3 id="scheduleModalTitle">เพิ่มกำหนดการเปิดเรื่อง</h3>
    <div id="schedNoteSlot"></div>`, 'modal slot');
  rep(`  document.getElementById('scheduleModalTitle').textContent = entry ? 'แก้ไขกำหนดการ' : 'เพิ่มกำหนดการเปิดเรื่อง';`,
`  document.getElementById('scheduleModalTitle').textContent = entry ? 'แก้ไขกำหนดการ' : 'เพิ่มกำหนดการเปิดเรื่อง';
  // โน้ต: เฉพาะตอนเพิ่มใหม่
  scheduleNoteEditing = false; scheduleNoteDraft = null;
  document.getElementById('schedNoteSlot').innerHTML = entry ? '' : scheduleNoteHtml();
  if(!entry) loadScheduleNote();`, 'openScheduleModal note');
  rep(`function pendingEpCount(item){`,
`// ---- โน้ตทีม (ในหน้าต่างเพิ่มกำหนดการ) ----
const SCHEDULE_NOTE_DEFAULT = 'ridi 0\\nlezhin -1\\nmr.blue 0\\ntoptoon 0';
let scheduleNote = null;          // null = ยังไม่ได้โหลด
let scheduleNoteEditing = false;
let scheduleNoteDraft = null;    // ข้อความที่พิมพ์ค้าง (วาดใหม่ระหว่างแก้ ก็ไม่หาย)
function scheduleNoteHtml(){
  const text = scheduleNote === null ? SCHEDULE_NOTE_DEFAULT : scheduleNote;
  return \`<aside class="sched-note-box" id="schedNoteBox">
    <div class="sched-note-head"><span>📝 โน้ต</span>
      \${scheduleNoteEditing ? '' : '<button type="button" class="icon-btn" onclick="editScheduleNote()" title="แก้ไขโน้ต" aria-label="แก้ไขโน้ต">✎</button>'}
    </div>
    \${scheduleNoteEditing
      ? \`<textarea id="schedNoteInput" rows="8" oninput="scheduleNoteDraft=this.value">\${esc(scheduleNoteDraft !== null ? scheduleNoteDraft : text)}</textarea>
         <div class="sched-note-actions">
           <button type="button" class="btn btn-ghost" onclick="cancelScheduleNote()">ยกเลิก</button>
           <button type="button" class="btn btn-primary" onclick="saveScheduleNote()">บันทึก</button>
         </div>\`
      : \`<div class="sched-note-body" ondblclick="editScheduleNote()" title="ดับเบิลคลิกเพื่อแก้ไข">\${text.trim() ? esc(text) : '<span style="color:var(--ink-soft)">(ว่าง — กด ✎ เพื่อเขียน)</span>'}</div>\`}
  </aside>\`;
}
function redrawScheduleNote(){
  const box = document.getElementById('schedNoteBox');
  if(box) box.outerHTML = scheduleNoteHtml();
}
async function loadScheduleNote(){
  if(scheduleNoteEditing) return;
  try{
    const r = await window.storage.get('schedule_note', true);
    const v = r && typeof r.value === 'string' ? r.value : null;
    if(v !== scheduleNote){ scheduleNote = v; if(!scheduleNoteEditing) redrawScheduleNote(); }
  }catch(e){}
}
function editScheduleNote(){
  scheduleNoteEditing = true;
  redrawScheduleNote();
  const t = document.getElementById('schedNoteInput');
  if(t){ t.focus(); t.selectionStart = t.selectionEnd = t.value.length; }
}
function cancelScheduleNote(){ scheduleNoteEditing = false; scheduleNoteDraft = null; redrawScheduleNote(); loadScheduleNote(); }
async function saveScheduleNote(){
  const t = document.getElementById('schedNoteInput');
  if(!t) return;
  const text = t.value.replace(/\\s+$/, '');
  try{
    await window.storage.set('schedule_note', text, true);
  }catch(e){ showToast('บันทึกโน้ตไม่สำเร็จ — ลองใหม่'); return; }
  scheduleNote = text;
  scheduleNoteEditing = false;
  scheduleNoteDraft = null;
  logActivity('แก้โน้ตกำหนดการ');
  redrawScheduleNote();
  showToast('บันทึกโน้ตแล้ว');
}

function pendingEpCount(item){`, 'note functions');
  rep('</style>', `  /* โน้ตทีมในหน้าต่างเพิ่มกำหนดการ */
  .sched-note-box{ background:#fffbea; border:1px solid #f0e2a8; border-radius:12px; padding:8px 12px 10px; margin:0 0 14px; }
  .sched-note-head{ display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:13.5px; margin-bottom:6px; color:#7a6200; }
  .sched-note-body{ white-space:pre-wrap; font-size:14px; line-height:1.6; font-family:inherit; min-height:40px; cursor:text; color:var(--ink); }
  .sched-note-box textarea{ width:100%; box-sizing:border-box; font:inherit; font-size:14px; line-height:1.6; padding:8px; border:1px solid var(--line); border-radius:8px; resize:vertical; background:var(--card); color:var(--ink); }
  .sched-note-actions{ display:flex; justify-content:flex-end; gap:6px; margin-top:8px; }
  .sched-note-actions .btn{ padding:6px 12px; font-size:12.5px; }
  body.dark .sched-note-box{ background:#2e2a17; border-color:#5a4f22; }
  body.dark .sched-note-head{ color:#e3cc6b; }
</style>`, 'css');
});

// ================= 49) เรื่องที่ลงตามวันที่ของเดือน (8 / 18 / 28) =================
step('เรื่องลงตามวันที่ของเดือน (monthDates)', 'function currentOccurrence(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'monthdates.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // วันใหม่ "ตามวันที่" — ต่อจากวันในสัปดาห์ (WEEKDAY_ONLY = 7 ตัวแรก ไม่กระทบ)
  rep(`const DAY_ORDER = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ไม่ระบุวัน','จบแล้ว'];`,
      `const DAY_ORDER = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ตามวันที่','ไม่ระบุวัน','จบแล้ว'];`, 'DAY_ORDER');
  rep(`const DAY_CHOICES = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ไม่ระบุวัน','จบแล้ว'];`,
      `const DAY_CHOICES = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ตามวันที่','ไม่ระบุวัน','จบแล้ว'];`, 'DAY_CHOICES');
  rep(`const DAY_EXCLUSIVE = ['ไม่ระบุวัน','จบแล้ว'];`, `const DAY_EXCLUSIVE = ['ตามวันที่','ไม่ระบุวัน','จบแล้ว'];`, 'DAY_EXCLUSIVE');
  rep(`'อาทิตย์':['#fdecec','#c0392b'], 'ไม่ระบุวัน':['#f1f3f6','#8a94a3'],`,
      `'อาทิตย์':['#fdecec','#c0392b'], 'ตามวันที่':['#e4f5f7','#0e7c86'], 'ไม่ระบุวัน':['#f1f3f6','#8a94a3'],`, 'pill color');
  rep(`const CAL_DAYS = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ไม่ระบุวัน','จบแล้ว'];`,
      `const CAL_DAYS = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ตามวันที่','ไม่ระบุวัน','จบแล้ว'];`, 'CAL_DAYS');
  rep(`'อาทิตย์':'วันอาทิตย์',`, `'อาทิตย์':'วันอาทิตย์','ตามวันที่':'ตามวันที่',`, 'CAL_DAY_LABEL');

  // สถานะต่อรอบ
  rep(`function dayStatus(item, day){
  if(!isMultiDay(item)) return item.status || 'pending';`,
`function dayStatus(item, day){
  if(isDateType(item)){ const occ = currentOccurrence(item); return (occ && (item.dateStatus || {})[occ]) || 'pending'; }
  if(!isMultiDay(item)) return item.status || 'pending';`, 'dayStatus');
  rep(`function setDayStatus(item, day, st){
  if(!isMultiDay(item)){ item.status = st; return; }`,
`function setDayStatus(item, day, st){
  if(isDateType(item)){
    const occ = currentOccurrence(item);
    item.status = st;
    if(!occ) return;
    item.dateStatus = item.dateStatus || {};
    item.dateStatus[occ] = st;
    const keys = Object.keys(item.dateStatus).sort();       // เก็บ 6 รอบล่าสุดพอ
    keys.slice(0, Math.max(0, keys.length - 6)).forEach(k=>delete item.dateStatus[k]);
    return;
  }
  if(!isMultiDay(item)){ item.status = st; return; }`, 'setDayStatus');
  rep(`function normalizeDays(item){`,
`function normalizeDays(item){
  // ตามวันที่: จำวันที่ตั้งค่า (กันเตือนย้อนหลัง) / เลิกใช้ = ล้างข้อมูลรอบทิ้ง
  if(itemDays(item).includes(MONTH_DAY)){ if(!item.monthDatesSince) item.monthDatesSince = ymdOf(effDateOnly()); }
  else { delete item.monthDates; delete item.monthDatesSince; delete item.dateStatus; }`, 'normalizeDays');
  // รีเซ็ตวันจันทร์ไม่แตะเรื่องตามวันที่ (สถานะเปลี่ยนตามรอบเอง)
  rep(`  items.forEach(item=>{
    if(isMultiDay(item)){`,
`  items.forEach(item=>{
    if(isDateType(item)) return;
    if(isMultiDay(item)){`, 'reset skip');

  // ตัวกรองวัน: วันนี้ตรงกับวันที่ของเรื่อง -> ขึ้นในตัวกรอง "วันนี้" ด้วย
  rep(`  if(dayFilter!=='ทั้งหมด' && !itemDays(item).includes(dayFilter)) return false;`,
      `  if(dayFilter!=='ทั้งหมด' && !itemDays(item).includes(dayFilter) && !(dayFilter===todayThaiDay() && isDateToday(item))) return false;`, 'matchesFilters');
  rep(`itemDays(it).filter(d=>dayFilter==='ทั้งหมด' || d===dayFilter)`,
      `itemDays(it).filter(d=>dayFilter==='ทั้งหมด' || d===dayFilter || (d===MONTH_DAY && dayFilter===todayThaiDay() && isDateToday(it)))`, 'rows');
  rep(`        <span class="day-pill" style="\${dayPillStyle(rowDay)}">\${rowDay}</span>`,
      `        <span class="day-pill" style="\${dayPillStyle(rowDay)}"\${rowDay===MONTH_DAY ? \` title="รอบนี้ \${esc(occLabel(currentOccurrence(item)))} · รอบถัดไป \${esc(occLabel(nextOccurrence(item)))}"\` : ''}>\${rowDay===MONTH_DAY ? esc(monthDatesLabel(item)) : rowDay}</span>`, 'row pill');

  // แถบผ่านวันแล้วยังไม่ทำ
  rep(`      if(dayHasPassed(day) && dayStatus(item, day) === 'pending') rows.push({ item, day });`,
      `      if((day === MONTH_DAY ? dateOccPassed(item) : dayHasPassed(day)) && dayStatus(item, day) === 'pending') rows.push({ item, day });`, 'missed rows');
  rep(`        <span class="day-pill" style="\${dayPillStyle(day)}">\${day}</span>`,
      `        <span class="day-pill" style="\${dayPillStyle(day)}">\${day === MONTH_DAY ? esc(occLabel(currentOccurrence(item))) : day}</span>`, 'missed pill');

  // modal: ช่องกรอกวันที่
  rep(`      <div id="rDays" class="day-checks"></div>`,
`      <div id="rDays" class="day-checks"></div>
      <div id="rMonthDatesWrap" style="display:none;margin-top:8px;"><input id="rMonthDates" type="text" placeholder="วันที่ของเดือน เช่น 8, 18, 28"></div>`, 'modal field');
  rep(`function onDayCheck(cb){
  if(!cb.checked) return;`,
`function onDayCheck(cb){
  setTimeout(syncMonthDatesField, 0);
  if(!cb.checked) return;`, 'onDayCheck');
  rep(`  setDayChecks(item ? itemDays(item) : ['จันทร์']);`,
`  setDayChecks(item ? itemDays(item) : ['จันทร์']);
  document.getElementById('rMonthDates').value = item && item.monthDates ? monthDates(item).join(', ') : '';
  syncMonthDatesField();`, 'openRecurringModal');
  rep(`  if(!name && !origName){ showToast('กรุณาใส่ชื่อเรื่อง (ชื่อแปลหรือต้นฉบับอย่างน้อย 1 ช่อง)'); return; }`,
`  if(!name && !origName){ showToast('กรุณาใส่ชื่อเรื่อง (ชื่อแปลหรือต้นฉบับอย่างน้อย 1 ช่อง)'); return; }
  const isMonthly = readDayChecks().includes(MONTH_DAY);
  const mDates = isMonthly ? parseMonthDates(document.getElementById('rMonthDates').value) : [];
  if(isMonthly && !mDates.length){ showToast('ใส่วันที่ของเดือน เช่น 8, 18, 28'); document.getElementById('rMonthDates').focus(); return; }`, 'save validate');
  rep(`    days: readDayChecks(),`,
`    days: readDayChecks(),
    monthDates: isMonthly ? mDates : undefined,`, 'save data');

  // ปฏิทิน: ลากเข้าแถวตามวันที่ได้เฉพาะเรื่องที่ตั้งวันที่แล้ว
  rep(`  fromDay = fromDay && days.includes(fromDay) ? fromDay : days[0];`,
`  fromDay = fromDay && days.includes(fromDay) ? fromDay : days[0];
  if(day === MONTH_DAY && fromDay !== day && !monthDates(item).length){
    showToast('ตั้งวันที่ของเดือนก่อน — ดับเบิลคลิกเรื่องเพื่อแก้ไข');
    renderCalendar(); return;
  }`, 'calendar guard');
});

// ================= 50) ปุ่มเลือกวันในหน้าต่างเรื่อง: ปุ่มเม็ดกดได้ทั้งปุ่ม แบ่ง 2 แถว =================
// เดิม .field input (width:100%) ทำให้ checkbox ขยายเต็มบรรทัด ไปซ้อนอยู่บนชื่อวัน
step('ปุ่มเลือกวันแบบปุ่มเม็ด', 'class="day-check-group"', () => {
  rep(`function dayChecksHtml(){
  return DAY_CHOICES.map(d=>\`<label class="day-check"><input type="checkbox" value="\${d}" onchange="onDayCheck(this)"> \${d}</label>\`).join('');
}`,
`function dayChecksHtml(){
  const pill = d => \`<label class="day-check"><input type="checkbox" value="\${d}" onchange="onDayCheck(this)"><span>\${d}</span></label>\`;
  const week = DAY_CHOICES.filter(d=>WEEKDAY_ONLY.includes(d));
  const other = DAY_CHOICES.filter(d=>!WEEKDAY_ONLY.includes(d));
  return \`<div class="day-check-group">\${week.map(pill).join('')}</div><div class="day-check-group day-check-other">\${other.map(pill).join('')}</div>\`;
}`, 'dayChecksHtml');
  rep('</style>', `  /* ปุ่มเลือกวัน: ซ่อน checkbox ทั้งปุ่มกดได้ */
  .day-checks{ display:block; }
  .day-check-group{ display:flex; flex-wrap:wrap; gap:6px; }
  .day-check-other{ margin-top:8px; padding-top:8px; border-top:1px dashed var(--line); }
  .day-check{ position:relative; display:inline-flex; align-items:center; justify-content:center; min-width:62px; padding:7px 12px; border:1px solid var(--line); border-radius:999px; font-size:13px; line-height:1.2; cursor:pointer; background:var(--card); color:var(--ink); user-select:none; transition:background .12s, border-color .12s; }
  .day-check:hover{ border-color:var(--blue); }
  .field .day-check input, .day-check input{ position:absolute; opacity:0; width:1px; height:1px; margin:0; padding:0; pointer-events:none; }
  .day-check:has(input:checked){ background:var(--blue); border-color:var(--blue); color:#fff; font-weight:700; }
  .day-check:has(input:checked) span::before{ content:'✓ '; }
  .day-check:has(input:focus-visible){ outline:2px solid var(--blue); outline-offset:2px; }
</style>`, 'css');
});

// ================= 51) B5: เตือนรหัสซ้ำ + คนทำติดจากกำหนดการ =================
step('B5 เตือนรหัสซ้ำ + คนทำจากกำหนดการ', 'async function confirmCodeUnique(', () => {
  const js = fs.readFileSync(path.join(__dirname, 'codecheck.js'), 'utf8').replace(/\n$/, '');
  rep(`function pendingEpCount(item){`, js + `\n\nfunction pendingEpCount(item){`, 'helpers');

  // งานประจำ: เช็คเมื่อเพิ่มใหม่ หรือแก้รหัส
  rep(`  if(!name && !origName){ showToast('กรุณาใส่ชื่อเรื่อง (ชื่อแปลหรือต้นฉบับอย่างน้อย 1 ช่อง)'); return; }`,
`  if(!name && !origName){ showToast('กรุณาใส่ชื่อเรื่อง (ชื่อแปลหรือต้นฉบับอย่างน้อย 1 ช่อง)'); return; }
  {
    const codeVal = document.getElementById('rCode').value.trim();
    const prev = editingRecurringId ? recurring.find(r=>r.id===editingRecurringId) : null;
    if((!prev || (prev.code || '') !== codeVal) && !await confirmCodeUnique('recurring', codeVal, editingRecurringId)) return;
  }`, 'recurring check');
  // เรื่องเปิดใหม่
  rep(`  const code = document.getElementById('nCode').value.trim();
  if(!code){ showToast('กรุณาใส่รหัสหรือชื่อเรื่อง'); return; }`,
`  const code = document.getElementById('nCode').value.trim();
  if(!code){ showToast('กรุณาใส่รหัสหรือชื่อเรื่อง'); return; }
  {
    const prev = editingNewId ? newStories.find(n=>n.id===editingNewId) : null;
    if((!prev || (prev.code || '') !== code) && !await confirmCodeUnique('newstories', code, editingNewId)) return;
  }`, 'new story check');
  // กำหนดการ
  rep(`  const title = document.getElementById('sTitle').value.trim();
  if(!title){ showToast('กรุณาใส่รหัสหรือชื่อเรื่อง'); return; }`,
`  const title = document.getElementById('sTitle').value.trim();
  if(!title){ showToast('กรุณาใส่รหัสหรือชื่อเรื่อง'); return; }
  {
    const prev = editingScheduleId ? scheduleEntries.find(e=>e.id===editingScheduleId) : null;
    if((!prev || (prev.title || '') !== title) && !await confirmCodeUnique('schedule', title, editingScheduleId)) return;
  }`, 'schedule check');

  // กำหนดการ -> เรื่องเปิดใหม่: จำว่ามาจากกำหนดการไหน (เอาคนทำไปใช้ตอนย้ายเข้างานประจำ)
  rep(`    if(src) src.sentToNew = true;`,
      `    if(src){ src.sentToNew = true; newStories[newStories.length-1].fromScheduleId = src.id; }`, 'link schedule');
  // เรื่องเปิดใหม่ -> งานประจำ: กรอกคนทำจากกำหนดการ
  rep(`  document.getElementById('rDrive').value = item.gdrive || '';
  document.getElementById('recurringModalTitle').textContent = 'ย้ายเข้างานประจำ — เลือกวันและคนทำ';`,
`  document.getElementById('rDrive').value = item.gdrive || '';
  const fromSchedule = schedulePersonFor(item);
  if(fromSchedule) document.getElementById('rPerson').value = fromSchedule;
  document.getElementById('recurringModalTitle').textContent = 'ย้ายเข้างานประจำ — เลือกวัน' + (fromSchedule ? ' (คนทำจากกำหนดการ: ' + fromSchedule + ')' : 'และคนทำ');`, 'person from schedule');
}, { staging: true });

// ================= 52) C4: ค้นหาไม่วาดใหม่ทุกตัวอักษร + ล็อก CDN ด้วย SRI =================
step('C4 ค้นหา debounce + SRI', 'function debounceSearch(', () => {
  rep(`function pendingEpCount(item){`,
`// พิมพ์ค้นหา: รอหยุดพิมพ์ 150ms ค่อยวาดใหม่ (เดิมวาดทั้งรายการทุกตัวอักษร)
let searchDebounceTimer = null;
function debounceSearch(fn){ clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(fn, 150); }

function pendingEpCount(item){`, 'helper');
  rep(`  sb.addEventListener('input', e=>{
    searchText = e.target.value; renderRecurring();
  });`,
`  sb.addEventListener('input', e=>{
    searchText = e.target.value; debounceSearch(renderRecurring);
  });`, 'recurring search');
  rep(`  sb2.addEventListener('input', e=>{ searchText=e.target.value; renderNewStories(); });`,
      `  sb2.addEventListener('input', e=>{ searchText=e.target.value; debounceSearch(renderNewStories); });`, 'new search');
  rep(`  box.addEventListener('input', e=>{ allSearch = e.target.value; renderAllStories(); });`,
      `  box.addEventListener('input', e=>{ allSearch = e.target.value; debounceSearch(renderAllStories); });`, 'all search');
  // SRI: ไฟล์จาก CDN ถูกเปลี่ยน = เบราว์เซอร์ไม่รัน (ค่าตรวจจากไฟล์จริง 7 ต.ค. 2026)
  rep(`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js"></script>`,
      `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js" integrity="sha512-xOXF+nzoFmJi/kmdwH/GpVZJqJ3VMVNKDX0yaG5KSS/l+hloBoe7KLa6B/c3N11x3oYIYrdewmcakorQXpGNeg==" crossorigin="anonymous"></script>`, 'supabase SRI');
  rep(`  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';`,
`  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  s.integrity = 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA==';
  s.crossOrigin = 'anonymous';`, 'html2canvas SRI');
}, { staging: true });

// ================= เว็บทดลอง: ข้อมูลแยก (key stg_) + แถบบอก =================
// ขั้นนี้ไม่มีวันเข้าเว็บหลัก
step('เว็บทดลอง: key stg_ + แถบบอก', 'const STAGING_KEY_PREFIX', () => {
  rep(`\nloadAll();\n`,
`
// ===== เว็บทดลอง: ทุก key เก็บแยกเป็น stg_<key> — แตะข้อมูลเว็บหลักไม่ได้ =====
const STAGING_KEY_PREFIX = 'stg_';
(function(){
  const st = window.storage;
  const get = st.get.bind(st), set = st.set.bind(st), sub = st.subscribe && st.subscribe.bind(st);
  st.get = (key, shared) => get(STAGING_KEY_PREFIX + key, shared);
  st.set = (key, value, shared) => set(STAGING_KEY_PREFIX + key, value, shared);
  if(sub) st.subscribe = (key, shared, cb) => sub(STAGING_KEY_PREFIX + key, shared, cb);
  if(st.setIfUnchanged){ const siu = st.setIfUnchanged.bind(st); st.setIfUnchanged = (key, value, shared) => siu(STAGING_KEY_PREFIX + key, value, shared); }
  const bar = document.createElement('div');
  bar.className = 'staging-bar';
  bar.textContent = '🧪 เว็บทดลอง — ข้อมูลแยกจากเว็บหลัก แก้อะไรที่นี่ไม่กระทบงานจริง';
  document.body.prepend(bar);
  document.title = '🧪 ' + document.title;
})();
loadAll();
`, 'prefix wrapper');
  rep('</style>', `  .staging-bar{ position:sticky; top:0; z-index:9000; background:#6a3fb3; color:#fff; text-align:center; font-size:12.5px; font-weight:700; padding:6px 12px; }
</style>`, 'css');
}, { staging: true });

// ================= ตรวจก่อนเขียน =================
group = 'ตรวจท้าย';
if (s.includes('drive.google.com/drive/folders/')) throw new Error('ยังมีลิงก์ Drive จริงในไฟล์ — SEED ไม่ถูกตัด?');
if (s.includes('href="${esc(')) throw new Error('ยังมี href ที่ไม่ผ่าน safeUrl');

if (CHECK) {
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : null;
  if (prev === s) { console.log('ตรงกับ ' + path.relative(ROOT, OUT) + ' ✓'); process.exit(0); }
  console.error('ไม่ตรงกับ ' + path.relative(ROOT, OUT) + ' — ต้องรัน rebuild ใหม่'); process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, s);
console.log('ทำ ' + done.length + ' ขั้น:');
done.forEach((d, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + d));
if (skipped.length) { console.log('ข้าม ' + skipped.length + ' ขั้น (ไฟล์ใหม่มีอยู่แล้ว):'); skipped.forEach(d => console.log('  - ' + d)); }
console.log('\nเขียน ' + path.relative(ROOT, OUT) + ' แล้ว (' + s.split('\n').length + ' บรรทัด)');
console.log('ต่อไป: node tools/preview.js  แล้วเปิด http://localhost:8010 ดูก่อน push');
