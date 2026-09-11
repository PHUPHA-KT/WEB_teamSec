#!/usr/bin/env node
// ประกอบ index.html ใหม่จากไฟล์ export ของแอป (ที่ยังใช้ window.storage ของ host เดิม)
// โดยใส่ชั้น Supabase + patch ทั้งหมดของ repo นี้กลับเข้าไป
//
//   node tools/rebuild.js <ไฟล์ export ใหม่.html>
//
// - ชั้น Supabase (shim) ดึงจาก index.html ปัจจุบัน — index.html คือความจริงเสมอ
// - ทุก patch มี "marker" ถ้าไฟล์ใหม่มีอยู่แล้ว (เช่นคุณย้าย fix ไปใส่ฝั่ง host เอง) จะข้ามให้
// - ถ้า anchor ไม่เจอ = โครงสร้างไฟล์เปลี่ยน สคริปต์จะหยุดพร้อมบอกว่าขั้นไหน ไม่เขียนทับครึ่งๆ กลางๆ

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CUR = path.join(ROOT, 'index.html');
const NEW = process.argv[2];
if (!NEW || !fs.existsSync(NEW)) {
  console.error('ใช้: node tools/rebuild.js <ไฟล์ export ใหม่.html>');
  process.exit(1);
}

let s = fs.readFileSync(NEW, 'utf8');
const cur = fs.readFileSync(CUR, 'utf8');
const done = [], skipped = [];
let group = null;

function rep(a, b, label, all) {
  if (!s.includes(a)) throw new Error('[' + (group || label) + '] หา anchor ไม่เจอ: ' + label);
  if (all) { while (s.includes(a)) s = s.replace(a, b); } else s = s.replace(a, b);
}
// ทำทั้งกลุ่ม หรือข้ามทั้งกลุ่มถ้าไฟล์มี marker อยู่แล้ว
function step(label, marker, fn) {
  group = label;
  if (marker && s.includes(marker)) { skipped.push(label); return; }
  fn();
  done.push(label);
}

// ================= 1) shim Supabase =================
step('shim Supabase', '<!-- ============================================================\n     Supabase storage shim', () => {
  const a = cur.indexOf('<!-- ============================================================\n     Supabase storage shim');
  const endMark = '\n})();\n</script>\n';
  const b = cur.indexOf(endMark, a);
  if (a < 0 || b < 0) throw new Error('ไม่เจอ shim ใน index.html ปัจจุบัน');
  const shim = cur.slice(a, b + endMark.length);
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
  s = s.slice(0, a) + '    ${filterToggleHtml()}\n    <div class="filter-panel${filtersOpen?\' open\':\'\'}">\n' + inner + '\n    </div>' + s.slice(b);
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

// ================= ตรวจก่อนเขียน =================
group = 'ตรวจท้าย';
if (s.includes('drive.google.com/drive/folders/')) throw new Error('ยังมีลิงก์ Drive จริงในไฟล์ — SEED ไม่ถูกตัด?');
if (s.includes('href="${esc(')) throw new Error('ยังมี href ที่ไม่ผ่าน safeUrl');

fs.writeFileSync(CUR, s);
console.log('ทำ ' + done.length + ' ขั้น:');
done.forEach((d, i) => console.log('  ' + String(i + 1).padStart(2) + '. ' + d));
if (skipped.length) { console.log('ข้าม ' + skipped.length + ' ขั้น (ไฟล์ใหม่มีอยู่แล้ว):'); skipped.forEach(d => console.log('  - ' + d)); }
console.log('\nเขียน index.html แล้ว (' + s.split('\n').length + ' บรรทัด)');
console.log('ต่อไป: node tools/preview.js  แล้วเปิด http://localhost:8010 ดูก่อน push');
