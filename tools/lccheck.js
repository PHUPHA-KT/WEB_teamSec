// ===== โหมดเช็คลิขสิทธิ์ (LC) ในแท็บทุกเรื่อง =====
// item.lcCheck = { at: ISO, by: ชื่อคนเช็ค }  — บันทึกตอนกด "✓ ยังไม่มี LC"
// ครบ LC_RECHECK_DAYS วัน = ถึงรอบเช็คใหม่เอง ไม่ต้องกดรีเซ็ต
const LC_RECHECK_DAYS = 30;
let allLcMode = false;
let allLcFilter = 'due';   // due = ถึงรอบ (รวมยังไม่เคยเช็ค) / never = ยังไม่เคยเช็ค / all

function lcDaysAgo(r){
  if(!r.lcCheck || !r.lcCheck.at) return null;
  const d = Math.floor((Date.now() - Date.parse(r.lcCheck.at)) / 86400000);
  return isNaN(d) ? null : Math.max(0, d);
}
function lcIsDue(r){ const d = lcDaysAgo(r); return d === null || d >= LC_RECHECK_DAYS; }
function lcPassesFilter(r){
  if(allLcFilter === 'never') return lcDaysAgo(r) === null;
  if(allLcFilter === 'due') return lcIsDue(r);
  return true;
}
// ยังไม่เคยเช็คขึ้นก่อน แล้วเรียงจากเช็คนานสุด
function lcSortKey(r){ const d = lcDaysAgo(r); return d === null ? Infinity : d; }

// ค้น Google ด้วยชื่อต้นฉบับ + ชื่อแปล (มีชื่อเดียวก็ใช้ชื่อเดียว)
function lcSearchUrl(r){
  const names = [r.origName, r.name].map(n=>(n||'').trim()).filter((n,i,a)=>n && a.indexOf(n) === i);
  const q = names.length ? names.map(n=>'"' + n.replace(/"/g, '') + '"').join(' OR ') : (r.code || '');
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}
function lcBadgeHtml(r){
  const d = lcDaysAgo(r);
  if(d === null) return `<span class="lc-badge lc-never">ยังไม่เคยเช็ค</span>`;
  const when = d === 0 ? 'วันนี้' : d + ' วันก่อน';
  const who = r.lcCheck.by ? ' · ' + esc(r.lcCheck.by) : '';
  return d >= LC_RECHECK_DAYS
    ? `<span class="lc-badge lc-due">เช็ค ${when}${who} · ถึงรอบ</span>`
    : `<span class="lc-badge lc-ok">เช็ค ${when}${who}</span>`;
}
function lcCellHtml(r){
  return `<div class="lc-cell">
    ${lcBadgeHtml(r)}
    <div class="lc-actions">
      <a class="lc-btn" href="${safeUrl(lcSearchUrl(r))}" target="_blank" rel="noopener" title="ค้น Google ด้วยชื่อต้นฉบับ + ชื่อแปล">🔍 Google</a>
      <button type="button" class="lc-btn lc-btn-ok" onclick="markLcChecked('${r.id}')">✓ ยังไม่มี LC</button>
      <button type="button" class="lc-btn lc-btn-found" onclick="markLcFound('${r.id}')">⚠ มี LC</button>
    </div>
  </div>`;
}
function lcToolbarHtml(){
  const active = recurring.filter(r=>!r.dropped);
  const due = active.filter(lcIsDue).length;
  const never = active.filter(r=>lcDaysAgo(r) === null).length;
  const chip = (key, label) => `<div class="filter-chip ${allLcFilter===key?'active':''}" onclick="allLcFilter='${key}';renderAllStories()">${label}</div>`;
  return `<div class="chip-scroll lc-bar">
    ${chip('due', `ถึงรอบเช็ค (${due})`)}
    ${chip('never', `ยังไม่เคยเช็ค (${never})`)}
    ${chip('all', `ทั้งหมด (${active.length})`)}
    <span class="lc-progress">เช็คแล้ว ${active.length - due} / ${active.length} เรื่อง · เช็คซ้ำทุก ${LC_RECHECK_DAYS} วัน · ไม่รวมเรื่องที่ดรอป</span>
  </div>`;
}
function toggleLcMode(){ allLcMode = !allLcMode; renderAllStories(); }

async function markLcChecked(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  item.lcCheck = { at: new Date().toISOString(), by: currentUserName() };
  logActivity(`เช็ค LC "${displayName(item) || item.code}" — ยังไม่มี`);
  renderAllStories();
  await persistRecurring(false);
}
async function markLcFound(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const eps = pendingEpCount(item);
  const ok = await uiConfirm(`"${displayName(item) || item.code}" มี LC แล้ว — ดรอปเรื่องนี้ด้วยเหตุผล "${DROP_META.lc.label}"?` + (eps ? `\n(ยังค้าง ${eps} ตอน จะอยู่ในงานปกติจนเคลียร์หมด)` : ''), 'ดรอป (LC)');
  if(!ok) return;
  item.lcCheck = { at: new Date().toISOString(), by: currentUserName(), found: true };
  item.dropped = 'lc';
  logActivity(`เช็ค LC "${displayName(item) || item.code}" — มี LC แล้ว → ดรอป (${DROP_META.lc.label})`);
  renderAllStories(); renderStats();
  await persistRecurring(false);
  showToast('ดรอปแล้ว: ' + DROP_META.lc.label);
}
