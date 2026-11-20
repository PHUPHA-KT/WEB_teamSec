// ===== ตรวจเรื่องจบซีประจำเดือน =====
// เรื่องที่ลงวัน "จบแล้ว" (จบซี รอซีใหม่) จะขึ้นในแถบให้ตรวจเดือนละครั้ง
// กด "ยังไม่มีซีใหม่" = ตรวจแล้วเดือนนี้ (seasonCheckedAt/By) -> หายจากแถบ แล้วกลับมาใหม่ต้นเดือนหน้า
// กด "มีซีใหม่" = เปิดหน้าแก้ไข ให้เลือกวันลงใหม่
const ENDED_DAY = 'จบแล้ว';
let endCheckOpen = false;
function monthKeyOf(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function endCheckDue(item){
  if(isEffectivelyDropped(item) || !itemDays(item).includes(ENDED_DAY)) return false;
  if(!item.seasonCheckedAt) return true;
  const d = new Date(item.seasonCheckedAt);
  return isNaN(d) || monthKeyOf(d) !== monthKeyOf(new Date());
}
function endCheckRows(){
  return recurring.filter(endCheckDue)
    .filter(r=>personFilter === 'ทั้งหมด' || r.person === personFilter || !PEOPLE.includes(r.person))
    .sort((a, b)=>String(a.code || '').localeCompare(String(b.code || ''), 'th', { numeric: true }));
}
function endCheckStripHtml(){
  if(showDropped) return '';
  const rows = endCheckRows();
  if(!rows.length) return '';
  return `<div class="missed-strip endcheck-strip">
    <div class="missed-head" onclick="endCheckOpen=!endCheckOpen;renderRecurring()">
      <span>🔍 เรื่องจบซี — ตรวจประจำเดือน${esc(TH_MON[new Date().getMonth()])} ว่ามีซีใหม่หรือยัง <b>${rows.length}</b> เรื่อง</span>
      <span class="missed-toggle">${endCheckOpen ? 'ซ่อน ▴' : 'ดู ▾'}</span>
    </div>
    ${endCheckOpen ? `<div class="missed-list">${rows.map(item=>{
      const last = item.seasonCheckedAt ? 'ตรวจล่าสุด ' + fmtShortDate(item.seasonCheckedAt) + (item.seasonCheckedBy ? ' · ' + item.seasonCheckedBy : '') : 'ยังไม่เคยตรวจ';
      return `<div class="missed-row">
        <span class="missed-name">${item.code ? esc(item.code) + ' · ' : ''}${esc(displayName(item) || '(ไม่มีชื่อ)')}<small>${esc(item.person || 'ไม่ระบุคน')} · ${esc(last)}</small></span>
        ${item.link ? `<a class="lc-btn" href="${safeUrl(item.link)}" target="_blank" rel="noopener">🔗 เปิดลิงก์</a>` : ''}
        <button type="button" class="lc-btn lc-btn-ok" onclick="endCheckNoNew('${item.id}')">✓ ยังไม่มีซีใหม่</button>
        <button type="button" class="lc-btn" onclick="openRecurringModal('${item.id}')" title="เปิดหน้าแก้ไข เลือกวันลงใหม่">✎ มีซีใหม่</button>
      </div>`;
    }).join('')}
    </div>` : ''}
  </div>`;
}
async function endCheckNoNew(id){
  const item = recurring.find(r=>r.id === id);
  if(!item) return;
  item.seasonCheckedAt = new Date().toISOString();
  if(myPerson) item.seasonCheckedBy = myPerson; else delete item.seasonCheckedBy;
  logActivity(`ตรวจเรื่องจบซี "${item.name || item.code}" — ยังไม่มีซีใหม่`);
  renderRecurring(); renderStats();
  showToast(`"${item.name || item.code}" ตรวจแล้ว — จะขึ้นให้ตรวจอีกเดือนหน้า`);
  await persistRecurring(false);
}
