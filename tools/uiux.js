// ===== UI งานประจำ: ปุ่มสถานะคลิกเดียว / เมนู ⋯ / เมนูลอย / เลิกทำ / คีย์บอร์ด =====

// ---- เมนูลอย (ใช้กับ ▾ สถานะ และ ⋯ ของแถว) ----
let popMenuEl = null;
function closePopMenu(){
  if(popMenuEl){ popMenuEl.remove(); popMenuEl = null; }
  document.removeEventListener('mousedown', popMenuOutside, true);
}
function popMenuOutside(e){ if(popMenuEl && !popMenuEl.contains(e.target)) closePopMenu(); }
// items: [{label, onClick, danger, active}]
function openPopMenu(anchor, items){
  closePopMenu();
  const m = document.createElement('div');
  m.className = 'pop-menu';
  items.forEach(it=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pop-item' + (it.danger ? ' pop-danger' : '') + (it.active ? ' pop-active' : '');
    b.textContent = it.label;
    b.addEventListener('click', ()=>{ closePopMenu(); it.onClick(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + h + 6 > innerHeight ? r.top - h - 4 : r.bottom + 4) + 'px';
  popMenuEl = m;
  setTimeout(()=>document.addEventListener('mousedown', popMenuOutside, true), 0);
  const first = m.querySelector('.pop-item'); if(first) first.focus();
}

// ---- ปุ่มสถานะ: คลิก = สลับ ทำแล้ว/ยังไม่ทำ, ▾ = เลือก งด/เลื่อน ----
function statusCtlHtml(item, day){
  const st = dayStatus(item, day);
  const meta = STATUS_META[st] || STATUS_META.pending;
  return `<span class="st-ctl">
    <button type="button" class="st-main" style="background:${meta.bg};color:${meta.fg};" onclick="toggleDayDone('${item.id}','${day}')" title="คลิกเพื่อสลับ ทำแล้ว / ยังไม่ทำ">${st === 'done' ? '✓ ' : ''}${meta.label}</button><button type="button" class="st-more" style="background:${meta.bg};color:${meta.fg};" onclick="openStatusMenu(this,'${item.id}','${day}')" title="เลือกสถานะอื่น (งด / เลื่อน)" aria-label="เลือกสถานะอื่น">▾</button>
  </span>`;
}
function toggleDayDone(id, day){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  updateStatus(id, dayStatus(item, day) === 'done' ? 'pending' : 'done', day);
}
function openStatusMenu(btn, id, day){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const cur = dayStatus(item, day);
  openPopMenu(btn, Object.keys(STATUS_META).map(k=>({
    label: (k === cur ? '● ' : '　') + STATUS_META[k].label,
    active: k === cur,
    onClick: ()=>{ if(k !== cur) updateStatus(id, k, day); },
  })));
}
function openRowMenu(btn, id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  openPopMenu(btn, [
    { label: '✎ แก้ไข', onClick: ()=>openRecurringModal(id) },
    item.dropped
      ? { label: '↩ ยกเลิกการรอดรอป', onClick: ()=>undropStory(id) }
      : { label: '⏏ ดรอปเรื่อง…', onClick: ()=>openDropMenu(id) },
    { label: '🗑 ลบเรื่อง', danger: true, onClick: ()=>deleteRecurring(id) },
  ]);
}

// ---- เลิกทำ (5 วิ) ----
// เก็บสำเนาของรายการก่อนแก้ แล้วคืนทั้งรายการถ้ากดเลิกทำ (รวมตอนล่าสุด/ตอนค้าง/สถานะทุกวัน)
const UNDO_MS = 5000;
let undoState = null;
function snapItem(collKey, id){
  const it = (getColl(collKey) || []).find(x=>x.id===id);
  return { collKey, id, before: it ? JSON.parse(JSON.stringify(it)) : null };
}
function offerUndo(label, snaps){
  const el = document.getElementById('undoToast') || (()=>{
    const d = document.createElement('div');
    d.id = 'undoToast';
    d.className = 'undo-toast';
    d.innerHTML = '<span class="undo-msg"></span><button type="button" class="undo-btn">เลิกทำ</button>';
    d.querySelector('.undo-btn').addEventListener('click', runUndo);
    document.body.appendChild(d);
    return d;
  })();
  if(undoState) clearTimeout(undoState.timer);
  undoState = { label, snaps, timer: setTimeout(hideUndo, UNDO_MS) };
  el.querySelector('.undo-msg').textContent = label;
  el.classList.add('show');
}
function hideUndo(){
  const el = document.getElementById('undoToast');
  if(el) el.classList.remove('show');
  if(undoState) clearTimeout(undoState.timer);
  undoState = null;
}
async function runUndo(){
  const u = undoState;
  hideUndo();
  if(!u) return;
  u.snaps.forEach(({collKey, id, before})=>{
    const arr = (getColl(collKey) || []).slice();
    const i = arr.findIndex(x=>x.id===id);
    if(before){ if(i > -1) arr[i] = before; else arr.push(before); }
    else if(i > -1) arr.splice(i, 1);
    setColl(collKey, arr);
    // เคยถูกย้ายลงถังขยะระหว่างทาง (เช่น ติ๊กครบ) -> เอาออกจากถัง ไม่งั้นมี 2 ที่
    if(before) trash = trash.filter(t=>!(t.item && t.item.id === id));
  });
  logActivity('เลิกทำ: ' + u.label);
  renderStats(); renderTab();
  if(document.getElementById('modalEpisodes').classList.contains('show')) renderEpChips();
  await persistData(false);
  showToast('เลิกทำแล้ว');
}

// ---- คีย์บอร์ด: Esc ปิดสิ่งที่อยู่บนสุด, Enter ยืนยันกล่องถาม ----
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    if(popMenuEl){ closePopMenu(); e.preventDefault(); return; }
    if(typeof calSel !== 'undefined' && calSel){ calClearSel(); e.preventDefault(); return; }
    const open = [...document.querySelectorAll('.modal-backdrop.show')];
    const top = open[open.length - 1];
    if(!top || !top.id) return;                       // กล่องที่สร้างชั่วคราว (เลือกเหตุผลดรอป) จัดการเอง
    e.preventDefault();
    if(top.id === 'modalConfirm') document.getElementById('confirmCancel').click();
    else if(top.id === 'modalPrompt') document.getElementById('promptCancel').click();
    else closeModal(top.id);
  } else if(e.key === 'Enter'){
    const c = document.getElementById('modalConfirm');
    if(c && c.classList.contains('show') && !(e.target && e.target.tagName === 'BUTTON')){
      e.preventDefault();
      document.getElementById('confirmOk').click();
    }
  }
});
