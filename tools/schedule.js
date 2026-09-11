// ===== กำหนดการเปิดเรื่อง (แทน renderSchedule เดิม) =====
// - ยังไม่เปิดขึ้นก่อน (ใกล้สุดก่อน) / เปิดแล้วไปท้าย (ใหม่สุดก่อน) และซ่อนที่เปิดเกิน 14 วัน
// - desktop = ตาราง, มือถือ = การ์ด (สลับด้วย CSS)
// - ปุ่ม ✓ เปิดแล้ว กดทีเดียว / ปุ่ม → สร้างเรื่องเปิดใหม่ กรอกให้จากกำหนดการ
const SCHEDULE_OPENED_KEEP_DAYS = 14;
let showAllOpened = false;

const TH_DOW = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const TH_MON = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
// 2026-09-12 -> "ส. 12 ก.ย." (ใส่ปี พ.ศ. 2 หลักเฉพาะเมื่อไม่ใช่ปีนี้)
function thaiDateLabel(dateStr){
  if(!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if(isNaN(d)) return esc(dateStr);
  const y = d.getFullYear();
  const yearPart = y === new Date().getFullYear() ? '' : ' ' + String(y + 543).slice(2);
  return TH_DOW[d.getDay()] + ' ' + d.getDate() + ' ' + TH_MON[d.getMonth()] + yearPart;
}

function scheduleActionsHtml(e){
  const open = e.status === 'opened';
  return (open
      ? `<button class="btn btn-ghost sched-act" onclick="scheduleToNewStory('${e.id}')" title="สร้างเรื่องเปิดใหม่จากกำหนดการนี้">→ เรื่องเปิดใหม่</button>`
      : `<button class="btn btn-ghost sched-act sched-act-ok" onclick="markScheduleOpened('${e.id}')" title="ทำเครื่องหมายว่าเปิดแล้ว">✓ เปิดแล้ว</button>`)
    + `<button class="icon-btn" onclick="openScheduleModal('${e.id}')" title="แก้ไข" style="color:#6b7480;">✎</button>`
    + `<button class="icon-btn" onclick="deleteSchedule('${e.id}')" title="ลบ">✕</button>`;
}

function renderSchedule(){
  const container = document.getElementById('mainContent');
  let html = `
    <div class="toolbar">
      <button class="btn btn-primary" onclick="openScheduleModal()">+ เพิ่มกำหนดการ</button>
    </div>
  `;
  if(!scheduleEntries.length){
    html += `<div class="empty-state">ยังไม่มีกำหนดการเปิดเรื่อง — กดปุ่ม "+ เพิ่มกำหนดการ" เพื่อวางแผนล่วงหน้า</div>`;
    container.innerHTML = html;
    return;
  }

  const byDateAsc = (a,b)=>{ if(!a.date) return 1; if(!b.date) return -1; return a.date.localeCompare(b.date); };
  const upcoming = scheduleEntries.filter(e=>e.status!=='opened').sort(byDateAsc);
  const openedAll = scheduleEntries.filter(e=>e.status==='opened').sort((a,b)=>byDateAsc(b,a));
  const cutoff = Date.now() - SCHEDULE_OPENED_KEEP_DAYS * 86400000;
  const isRecent = e => !e.date || Date.parse(e.date + 'T00:00:00') >= cutoff;
  const opened = showAllOpened ? openedAll : openedAll.filter(isRecent);
  const hiddenCount = openedAll.length - opened.length;

  const rowHtml = e => {
    const st = SCHEDULE_STATUS[e.status] || SCHEDULE_STATUS.planned;
    return `<tr>
      <td style="white-space:nowrap;">${thaiDateLabel(e.date)}</td>
      <td>${countdownLabel(e)}</td>
      <td><b>${esc(e.title)}</b>${e.link?` <a href="${safeUrl(e.link)}" target="_blank" style="font-size:12px;color:#1c6fd1;">🔗</a>`:''}</td>
      <td>${e.person?esc(e.person):'—'}</td>
      <td><span class="status-badge" style="background:${st.bg};color:${st.fg};">${st.label}</span></td>
      <td>${e.note?esc(e.note):'—'}</td>
      <td style="white-space:nowrap;">${scheduleActionsHtml(e)}</td>
    </tr>`;
  };
  const cardHtml = e => {
    const st = SCHEDULE_STATUS[e.status] || SCHEDULE_STATUS.planned;
    return `<div class="new-card sched-card">
      <div class="new-card-top">
        <div>
          <div class="new-code">${esc(e.title)}${e.link?` <a href="${safeUrl(e.link)}" target="_blank" style="font-size:12px;color:#1c6fd1;">🔗</a>`:''}</div>
          <div class="sched-meta">${thaiDateLabel(e.date)}${e.person?' · '+esc(e.person):''} ${countdownLabel(e)}</div>
        </div>
        <span class="status-badge" style="background:${st.bg};color:${st.fg};white-space:nowrap;">${st.label}</span>
      </div>
      ${e.note?`<div class="sched-note">${esc(e.note)}</div>`:''}
      <div class="sched-actions">${scheduleActionsHtml(e)}</div>
    </div>`;
  };
  const section = (title, list, extra) => {
    if(!list.length && !extra) return '';
    return `<div class="sched-section-head"><span>${title} <small>${list.length}</small></span>${extra||''}</div>`
      + (list.length ? `
        <div class="table-wrap sched-table"><table class="data-table">
          <thead><tr><th>วันที่เปิด</th><th>นับถอยหลัง</th><th>เรื่อง</th><th>คนทำ</th><th>สถานะ</th><th>หมายเหตุ</th><th></th></tr></thead>
          <tbody>${list.map(rowHtml).join('')}</tbody>
        </table></div>
        <div class="sched-cards">${list.map(cardHtml).join('')}</div>` : '');
  };

  html += section('📅 กำลังจะเปิด', upcoming);
  if(!upcoming.length) html += `<div class="empty-state" style="padding:18px 10px;">ไม่มีเรื่องที่รอเปิด</div>`;
  const toggle = hiddenCount
    ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px;" onclick="showAllOpened=true;renderSchedule()">ดูทั้งหมด (+${hiddenCount})</button>`
    : (showAllOpened && openedAll.length ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px;" onclick="showAllOpened=false;renderSchedule()">ซ่อนที่เก่ากว่า ${SCHEDULE_OPENED_KEEP_DAYS} วัน</button>` : '');
  if(openedAll.length) html += section('✅ เปิดแล้ว', opened, toggle);

  container.innerHTML = html;
}

async function markScheduleOpened(id){
  const e = scheduleEntries.find(x=>x.id===id);
  if(!e) return;
  e.status = 'opened';
  if(!e.date) e.date = todayDateStr();   // ไม่เคยใส่วันที่ = ถือว่าเปิดวันนี้
  logActivity(`เปิดเรื่อง "${e.title}" แล้ว`);
  renderSchedule(); renderStats();
  showToast('✓ ' + e.title + ' — เปิดแล้ว');
  await persistSchedule(false);
}

// กรอก modal "เรื่องเปิดใหม่" จากกำหนดการ ไม่ต้องพิมพ์รหัส/ชื่อ/ลิงก์ซ้ำ
function scheduleToNewStory(id){
  const e = scheduleEntries.find(x=>x.id===id);
  if(!e) return;
  openNewModal();
  document.getElementById('nCode').value = e.title || '';
  document.getElementById('nLink').value = e.link || '';
  document.getElementById('newModalTitle').textContent = 'เพิ่มเรื่องเปิดใหม่ (จากกำหนดการ)';
}
