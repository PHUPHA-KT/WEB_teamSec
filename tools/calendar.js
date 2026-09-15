// ===== ตารางปฏิทิน (แทน renderCalendar เดิม) — ลากเรื่องย้ายวัน/ย้ายคนได้ =====
// - แต่ละเรื่องเป็น chip ลากไปวางช่อง คน × วัน ไหนก็ได้
// - เมาส์: กดลากได้เลย / มือถือ: แตะค้าง 0.3 วิ แล้วลาก (กันชนกับการเลื่อนหน้า)
// - วางแล้วเปลี่ยน day (+ person ถ้าข้ามการ์ด) -> เซฟ + ลงประวัติ
const CAL_DAYS = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ไม่ระบุวัน','จบแล้ว'];
const CAL_DAY_LABEL = { 'จันทร์':'วันจันทร์','อังคาร':'วันอังคาร','พุธ':'วันพุธ','พฤหัสบดี':'วันพฤหัสบดี','ศุกร์':'วันศุกร์','เสาร์':'วันเสาร์','อาทิตย์':'วันอาทิตย์','ไม่ระบุวัน':'ไม่ระบุวัน','จบแล้ว':'จบแล้ว' };

function renderCalendar(){
  const container = document.getElementById('mainContent');
  const active = recurring.filter(r=>!isEffectivelyDropped(r));

  let html = `<div class="cal-grid">`;
  PEOPLE.forEach(person=>{
    const mine = active.filter(r=>r.person===person);
    const color = PERSON_COLOR[person];
    html += `<div class="cal-card cal-${color}">
      <div class="cal-head cal-head-${color}">${esc(person)} <span style="opacity:.85;font-weight:700;">(${mine.length} เรื่อง)</span></div>
      <table class="cal-table"><tbody>
        ${CAL_DAYS.map(d=>{
          const items = mine.filter(r=>r.day===d);
          const chips = items.map(r=>{
            const eps = pendingEpCount(r);
            const owner = hasForeignBacklog(r) ? ' · ' + esc(r.pendingOwner) : '';
            const badge = eps ? ` <span class="cal-chip-eps">(ค้าง ${eps}${owner})</span>` : '';
            return `<span class="cal-chip" data-id="${r.id}" title="ลากเพื่อย้ายวัน/ย้ายคน">${esc((r.code?r.code+'-':'') + (r.name||''))}${badge}</span>`;
          }).join('');
          return `<tr>
            <td class="cal-day">${CAL_DAY_LABEL[d]}</td>
            <td class="cal-items ${items.length?'':'cal-empty'}" data-person="${esc(person)}" data-day="${esc(d)}">${chips || '-'}</td>
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  });
  html += `</div>`;

  container.innerHTML = `<div class="toolbar" style="justify-content:space-between;">
      <span style="font-size:13px;color:var(--ink-soft);">ลากเรื่องไปวางช่องอื่นเพื่อย้ายวัน/ย้ายคน · มือถือแตะค้างแล้วลาก (ไม่รวมเรื่องที่ดรอป)</span>
      <button class="btn btn-primary" onclick="exportCalendarImage()">📷 บันทึกเป็นรูป</button>
    </div>
    <div id="calCapture">${html}</div>`;
  bindCalendarDrag(container);
}

// ย้ายเรื่องไปช่องใหม่ (ใช้ร่วมกันทั้งเมาส์/ทัช)
async function moveCalendarItem(id, person, day){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  if(item.person === person && item.day === day) return;
  const from = `${item.person||'ไม่ระบุ'} / ${item.day||'ไม่ระบุวัน'}`;
  // ย้ายคนทั้งที่มีตอนค้าง -> ถามว่าหนี้เก่าให้ใครเคลียร์ (ปิดกล่อง = ยกเลิกการย้าย)
  if(person !== item.person && !(await resolveBacklogOnReassign(item, person))){ renderCalendar(); return; }
  item.person = person;
  item.day = day;
  const name = item.name || item.code;
  const note = hasForeignBacklog(item) ? ` (ตอนค้าง ${pendingEpCount(item)} ตอน ${item.pendingOwner} เคลียร์ต่อ)` : '';
  logActivity(`ย้าย "${name}" ${from} → ${person} / ${day}${note}`);
  renderCalendar(); renderStats();
  showToast(`ย้าย "${name}" → ${person} · ${CAL_DAY_LABEL[day] || day}`);
  await persistRecurring(false);
}

// ลาก-วางด้วย Pointer Events: เมาส์เริ่มทันที ทัชต้องกดค้างก่อน
function bindCalendarDrag(root){
  const HOLD_MS = 300;
  let drag = null;   // {id, ghost, startX, startY, started, holdTimer, pointerId}

  function cellAt(x, y){
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.cal-items[data-person]') : null;
  }
  function clearHover(){ root.querySelectorAll('.cal-drop-ok').forEach(c=>c.classList.remove('cal-drop-ok')); }
  function start(chip, x, y){
    drag.started = true;
    chip.classList.add('cal-chip-dragging');
    const g = chip.cloneNode(true);
    g.classList.add('cal-ghost');
    document.body.appendChild(g);
    drag.ghost = g;
    place(x, y);
    drag.scrollRaf = requestAnimationFrame(autoScroll);
  }
  function place(x, y){
    if(!drag || !drag.ghost) return;
    drag.lastX = x; drag.lastY = y;
    drag.ghost.style.left = (x + 10) + 'px';
    drag.ghost.style.top = (y - 14) + 'px';
    clearHover();
    const cell = cellAt(x, y);
    if(cell) cell.classList.add('cal-drop-ok');
  }
  // ลากใกล้ขอบบน/ล่างจอ -> เลื่อนหน้าให้ (การ์ดคนที่ 3-4 อยู่ล่างจอ)
  function autoScroll(){
    if(!drag || !drag.started) return;
    const EDGE = 70, y = drag.lastY;
    let dy = 0;
    if(y < EDGE) dy = -Math.ceil((EDGE - y) / 4);
    else if(y > innerHeight - EDGE) dy = Math.ceil((y - (innerHeight - EDGE)) / 4);
    if(dy){ window.scrollBy(0, dy); place(drag.lastX, drag.lastY); }
    drag.scrollRaf = requestAnimationFrame(autoScroll);
  }
  function end(x, y, cancelled){
    if(!drag) return;
    clearTimeout(drag.holdTimer);
    if(drag.scrollRaf) cancelAnimationFrame(drag.scrollRaf);
    const started = drag.started, id = drag.id;
    if(drag.ghost) drag.ghost.remove();
    root.querySelectorAll('.cal-chip-dragging').forEach(c=>c.classList.remove('cal-chip-dragging'));
    clearHover();
    drag = null;
    if(!started || cancelled) return;
    const cell = cellAt(x, y);
    if(cell) moveCalendarItem(id, cell.dataset.person, cell.dataset.day);
  }

  root.addEventListener('pointerdown', e=>{
    const chip = e.target.closest('.cal-chip');
    if(!chip || e.button !== 0) return;
    drag = { id: chip.dataset.id, chip, startX: e.clientX, startY: e.clientY, started: false, pointerId: e.pointerId };
    if(e.pointerType === 'mouse'){
      start(chip, e.clientX, e.clientY);
      e.preventDefault();
    } else {
      // ทัช: รอกดค้าง — ถ้าเลื่อนนิ้วก่อนครบเวลา = ผู้ใช้ตั้งใจ scroll ไม่ใช่ลาก
      drag.holdTimer = setTimeout(()=>{ if(drag && !drag.started){ start(chip, drag.startX, drag.startY); if(navigator.vibrate) navigator.vibrate(20); } }, HOLD_MS);
    }
  });
  root.addEventListener('pointermove', e=>{
    if(!drag) return;
    if(!drag.started){
      if(Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 10){ clearTimeout(drag.holdTimer); drag = null; }
      return;
    }
    e.preventDefault();
    place(e.clientX, e.clientY);
  }, { passive:false });
  root.addEventListener('pointerup', e=>end(e.clientX, e.clientY, false));
  root.addEventListener('pointercancel', e=>end(e.clientX, e.clientY, true));
  // ถ้ากำลังลากอยู่ ห้ามหน้าเลื่อนตาม (มือถือ)
  root.addEventListener('touchmove', e=>{ if(drag && drag.started) e.preventDefault(); }, { passive:false });
}
