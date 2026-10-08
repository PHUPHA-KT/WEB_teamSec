// ===== พักชั่วคราว (มีวันกลับ) =====
// item.pauseUntil = 'YYYY-MM-DD' วันที่กลับมาลง — ก่อนวันนั้น (นับวันใหม่ตอน 2 ทุ่ม) = พัก
// ระหว่างพัก: อยู่ในงานประจำแบบจาง สถานะ = พัก ไม่เตือน "ผ่านวันแล้วยังไม่ทำ" ไม่นับ ตอน/สัปดาห์
// ตอนค้างที่มีอยู่ยังเตือนตามปกติ · ถึงวันกลับ = ปกติเอง ไม่ต้องกดอะไร
function isPaused(item){
  return !!item.pauseUntil && ymdOf(effDateOnly()) < item.pauseUntil;
}
function pauseBadgeHtml(item){
  if(!isPaused(item)) return '';
  return ` <span class="pause-badge" title="พักชั่วคราว — กลับมาลง ${esc(thaiDateLabel(item.pauseUntil))}">⏸ พัก · กลับ ${esc(thaiDateLabel(item.pauseUntil))}</span>`;
}
function addDaysYmd(ymd, n){
  const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return ymdOf(d);
}

function openPauseModal(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const today = ymdOf(effDateOnly());
  const old = document.getElementById('modalPause'); if(old) old.remove();
  const back = document.createElement('div');
  back.className = 'modal-backdrop show';
  back.id = 'modalPause';
  back.innerHTML = `<div class="modal" style="max-width:400px;">
    <h3>⏸ พักชั่วคราว — ${esc(displayName(item) || item.code)}</h3>
    <div class="field"><label>กลับมาลงวันที่</label><input id="pauseUntil" type="date" min="${addDaysYmd(today, 1)}" value="${esc(item.pauseUntil && item.pauseUntil > today ? item.pauseUntil : addDaysYmd(today, 7))}"></div>
    <div class="pause-quick">
      ${[[7,'+1 สัปดาห์'],[14,'+2 สัปดาห์'],[21,'+3 สัปดาห์'],[28,'+4 สัปดาห์']].map(([n,l])=>`<button type="button" class="btn btn-ghost" onclick="document.getElementById('pauseUntil').value='${addDaysYmd(today, n)}'">${l}</button>`).join('')}
    </div>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:8px;">ระหว่างพักไม่ต้องกดสถานะ · ตอนค้างที่มีอยู่ยังเตือนตามปกติ · ถึงวันกลับเป็นปกติเอง</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal('modalPause')">ยกเลิก</button>
      <button type="button" class="btn btn-primary" onclick="savePause('${item.id}')">พัก</button>
    </div>
  </div>`;
  back.addEventListener('click', e=>{ if(e.target === back) closeModal('modalPause'); });
  document.body.appendChild(back);
  const inp = document.getElementById('pauseUntil');
  inp.addEventListener('click', ()=>{ try{ inp.showPicker && inp.showPicker(); }catch(e){} });
}
async function savePause(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const v = document.getElementById('pauseUntil').value;
  if(!v || v <= ymdOf(effDateOnly())){ showToast('เลือกวันที่กลับมาลง (หลังวันนี้)'); return; }
  const undoSnap = snapItem('recurring_stories', id);
  item.pauseUntil = v;
  logActivity(`พัก "${displayName(item) || item.code}" ถึง ${thaiDateLabel(v)}`);
  offerUndo(`พัก "${displayName(item) || item.code}"`, [undoSnap]);
  closeModal('modalPause');
  renderStats(); renderTab();
  await persistRecurring(false);
}
async function unpauseStory(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const undoSnap = snapItem('recurring_stories', id);
  delete item.pauseUntil;
  logActivity(`ยกเลิกพัก "${displayName(item) || item.code}" (กลับมาก่อนกำหนด)`);
  offerUndo(`ยกเลิกพัก "${displayName(item) || item.code}"`, [undoSnap]);
  renderStats(); renderTab();
  await persistRecurring(false);
}
