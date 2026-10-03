// ===== B1: วันผ่านไปแล้วแต่ยัง "ยังไม่ทำ" — แถบเตือนบนงานประจำ =====
// ไล่ทุกวันที่ผ่านไปแล้วในสัปดาห์นี้ (นับวันใหม่ตอน 2 ทุ่ม) ที่สถานะของวันนั้นยังเป็น pending
// ต่อแถว: ✓ ทำแล้ว (สถานะวันนั้น = done) / ＋ ค้าง (ใส่ตอนเข้าตอนค้าง แล้วตั้งวันนั้นเป็น เลื่อน)
// เคารพตัวกรองคน (งานของฉัน) · ไม่รวมเรื่องที่ดรอปจริง · ยุบไว้ได้
let missedOpen = false;

function missedRows(){
  const rows = [];
  recurring.forEach(item=>{
    if(isEffectivelyDropped(item)) return;
    if(personFilter !== 'ทั้งหมด' && !isPersonInvolved(item, personFilter)) return;
    itemDays(item).forEach(day=>{
      if(dayHasPassed(day) && dayStatus(item, day) === 'pending') rows.push({ item, day });
    });
  });
  rows.sort((a,b)=> WEEKDAY_ONLY.indexOf(a.day) - WEEKDAY_ONLY.indexOf(b.day));
  return rows;
}
// ตอนถัดไปที่เดาได้: ตอนล่าสุด / ตอนค้างสูงสุด + 1 (ข้อความ เช่น พิเศษ เดาไม่ได้ = ว่าง)
function guessNextEp(item){
  const nums = [item.lastEp, ...(item.pendingEpisodes || [])].map(e=>typeof e === 'number' ? e : parseFloat(e)).filter(n=>!isNaN(n));
  return nums.length ? Math.floor(Math.max(...nums)) + 1 : '';
}
function missedStripHtml(){
  if(showDropped) return '';
  const rows = missedRows();
  if(!rows.length) return '';
  const who = personFilter !== 'ทั้งหมด' ? ' ของ' + esc(personFilter) : '';
  return `<div class="missed-strip">
    <div class="missed-head" onclick="missedOpen=!missedOpen;renderRecurring()">
      <span>🕗 ผ่านวันแล้วยังไม่ได้ทำ${who} <b>${rows.length}</b> รายการ</span>
      <span class="missed-toggle">${missedOpen ? 'ซ่อน ▴' : 'ดู ▾'}</span>
    </div>
    ${missedOpen ? `<div class="missed-list">${rows.map(({item, day})=>`
      <div class="missed-row">
        <span class="day-pill" style="${dayPillStyle(day)}">${day}</span>
        <span class="missed-name">${item.code ? esc(item.code) + ' · ' : ''}${esc(displayName(item) || '(ไม่มีชื่อ)')}<small>${esc(item.person || '')}</small></span>
        <button type="button" class="lc-btn lc-btn-ok" onclick="missedDone('${item.id}','${day}')">✓ ทำแล้ว</button>
        <button type="button" class="lc-btn" onclick="missedToBacklog('${item.id}','${day}')" title="ยังไม่ได้ทำตอนนี้ — ใส่เข้าตอนค้าง แล้วตั้งวันนั้นเป็น เลื่อน">＋ ค้าง</button>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}
async function missedDone(id, day){
  await updateStatus(id, 'done', day);
}
async function missedToBacklog(id, day){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const raw = await uiPrompt(`"${displayName(item) || item.code}" (${day}) ตอนที่ยังไม่ได้ทำ — ใส่เข้าตอนค้าง`, { value: String(guessNextEp(item)), placeholder: 'เช่น 24, 9.5, พิเศษ' });
  if(raw === null || raw === undefined) return;
  const eps = parseEpisodeInput(raw);
  if(!eps.length){ showToast('ใส่เลขตอน หรือชื่อตอน เช่น 24, 9.5, พิเศษ'); return; }
  const have = new Map((item.pendingEpisodes || []).map(e=>[epKey(e), e]));
  eps.forEach(e=>{ if(!have.has(epKey(e))) have.set(epKey(e), e); });
  item.pendingEpisodes = sortEpisodes([...have.values()]);
  setDayStatus(item, day, 'delayed');
  item.pendingSinceDate = null;
  logActivity(`ใส่ตอนค้าง "${displayName(item) || item.code}" ${eps.map(epLabel).join(', ')} (ยังไม่ได้ทำ${isMultiDay(item) ? ' ' + day : ''})`);
  renderRecurring(); renderStats();
  await persistRecurring(false);
  showToast('ใส่ตอนค้างแล้ว — ' + eps.map(epLabel).join(', '));
}
