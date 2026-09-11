// ===== เรื่องเปิดใหม่ (แทน renderNewStories เดิม) =====
// - แบ่ง กำลังทำ / ยังไม่เริ่ม / เสร็จแล้ว (เสร็จแล้วยุบไว้)
// - badge บอก 2/4 + บอกว่าใครยังไม่ติ๊ก
// - ชิป ⭐ ที่ฉันยังไม่ติ๊ก
// - เพิ่มเมื่อ X วันก่อน (จาก createdAt — ของเก่าไม่มีก็ไม่โชว์)
// - ปุ่ม → ย้ายเข้างานประจำ บนการ์ดที่เสร็จแล้ว (กรอก modal ให้ แล้วเรื่องเปิดใหม่ย้ายลงถังขยะเอง)
let newShowDone = false;
let newMineOnly = false;
let promoteFromNewId = null;   // เรื่องเปิดใหม่ที่กำลังถูกย้ายเข้างานประจำ (saveNewRecurring ใช้)

function newStoryProgress(item){
  const c = item.contrib || {};
  const missing = PEOPLE.filter(p=>!c[p]);
  return { done: PEOPLE.length - missing.length, total: PEOPLE.length, missing };
}
function agoLabel(iso){
  if(!iso) return '';
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if(isNaN(d) || d < 0) return '';
  if(d === 0) return 'เพิ่มวันนี้';
  if(d === 1) return 'เพิ่มเมื่อวาน';
  if(d < 30) return 'เพิ่มเมื่อ ' + d + ' วันก่อน';
  return 'เพิ่มเมื่อ ' + Math.floor(d/30) + ' เดือนก่อน';
}
// "3-18-30-선생님과 산다!" -> {code:"3-18-30", name:"선생님과 산다!"} / "18-25" -> {code:"18-25", name:"18-25"}
function splitCodeName(str){
  // ชื่อต้องมีตัวอักษรที่ไม่ใช่เลข/ขีด ไม่งั้น "18-25" จะถูกแยกเป็น 18 กับ 25
  const m = String(str||'').trim().match(/^((?:\d+-)*\d+)-(.*[^\d-].*)$/);
  if(m) return { code: m[1], name: m[2].trim() };
  return { code: String(str||'').trim(), name: String(str||'').trim() };
}

function renderNewStories(){
  const container = document.getElementById('mainContent');
  const activeEl = document.activeElement;
  const searchWasFocused = activeEl && activeEl.id === 'searchBox2';

  const mineChip = myPerson
    ? `<div class="filter-chip ${newMineOnly?'active':''}" onclick="newMineOnly=!newMineOnly;renderNewStories()">⭐ ที่ฉันยังไม่ติ๊ก (${esc(myPerson)})</div>`
    : `<div class="filter-chip" style="opacity:.6" onclick="promptSetMe()">⭐ ที่ฉันยังไม่ติ๊ก — ตั้งชื่อก่อน</div>`;
  let html = `
    <div class="toolbar">
      <input type="text" id="searchBox2" placeholder="ค้นหา..." value="${esc(searchText)}">
      <button class="btn btn-primary" onclick="openNewModal()">+ เพิ่มเรื่องเปิดใหม่</button>
    </div>
    <div class="chip-scroll" style="margin-bottom:10px;">${mineChip}</div>
  `;

  const q = searchText.toLowerCase();
  const filtered = newStories.filter(item=>{
    if(q && !((item.code||'').toLowerCase().includes(q) || (item.name||'').toLowerCase().includes(q))) return false;
    if(newMineOnly && myPerson && (item.contrib||{})[myPerson]) return false;
    return true;
  });

  const groups = { progress: [], none: [], done: [] };
  filtered.forEach(item=>{
    const pr = newStoryProgress(item);
    if(pr.done === pr.total) groups.done.push(item);
    else if(pr.done > 0) groups.progress.push(item);
    else groups.none.push(item);
  });
  // ใหม่สุดก่อน (ของเก่าไม่มี createdAt ไปท้าย)
  const byNewest = (a,b)=> (b.createdAt||'').localeCompare(a.createdAt||'');
  Object.values(groups).forEach(g=>g.sort(byNewest));

  const cardHtml = item => {
    const pr = newStoryProgress(item);
    const isDone = pr.done === pr.total;
    let statusClass='status-none', statusLabel='ยังไม่เริ่ม';
    if(isDone){ statusClass='status-done'; statusLabel='เสร็จแล้ว'; }
    else if(pr.done>0){ statusClass='status-progress'; statusLabel=`กำลังทำ ${pr.done}/${pr.total}`; }
    const ago = agoLabel(item.createdAt);
    const metaBits = [];
    if(!isDone && pr.done>0) metaBits.push('เหลือ: ' + pr.missing.map(esc).join(', '));
    if(ago) metaBits.push(ago);
    return `<div class="new-card">
      <div class="new-card-top">
        <div>
          <div class="new-code">${esc(item.code)}</div>
          ${item.link?`<a href="${safeUrl(item.link)}" target="_blank" style="font-size:12px;color:#1c6fd1;margin-right:8px;">🔗 ลิงก์</a>`:''}
          ${item.gdrive?`<a href="${safeUrl(item.gdrive)}" target="_blank" style="font-size:12px;color:#1a9c6b;">📁 Drive</a>`:''}
          ${metaBits.length?`<div class="sched-meta">${metaBits.join(' · ')}</div>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <span class="status-badge ${statusClass}">${statusLabel}</span>
          ${isDone?`<button class="btn btn-ghost sched-act sched-act-ok" onclick="promoteNewToRecurring('${item.id}')" title="ย้ายไปเป็นงานประจำรายสัปดาห์">→ งานประจำ</button>`:''}
          <button class="icon-btn" onclick="openNewModal('${item.id}')" title="แก้ไข" style="color:#6b7480;">✎</button>
          <button class="icon-btn" onclick="deleteNewStory('${item.id}')">✕</button>
        </div>
      </div>
      <div class="contrib-grid">
        ${PEOPLE.map(p=>`
          <label class="contrib-item ${(item.contrib||{})[p]?'on':''}">
            <input type="checkbox" ${(item.contrib||{})[p]?'checked':''} onchange="toggleContrib('${item.id}','${p}')">
            ${p}
          </label>`).join('')}
      </div>
    </div>`;
  };
  const section = (title, list, extra, count) =>
    `<div class="sched-section-head"><span>${title} <small>${count==null?list.length:count}</small></span>${extra||''}</div>` + list.map(cardHtml).join('');

  if(!filtered.length){
    html += `<div class="empty-state">${newStories.length ? 'ไม่มีเรื่องที่ตรงตัวกรอง' : 'ยังไม่มีเรื่องเปิดใหม่ — กดปุ่ม "+ เพิ่มเรื่องเปิดใหม่"'}</div>`;
  } else {
    if(groups.progress.length) html += section('🔧 กำลังทำ', groups.progress);
    if(groups.none.length) html += section('⬜ ยังไม่เริ่ม', groups.none);
    if(!groups.progress.length && !groups.none.length) html += `<div class="empty-state" style="padding:18px 10px;">ไม่มีเรื่องที่ค้างอยู่ 🎉</div>`;
    if(groups.done.length){
      const toggle = `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px;" onclick="newShowDone=!newShowDone;renderNewStories()">${newShowDone?'ซ่อน':'ดู'}</button>`;
      html += section('✅ เสร็จแล้ว', newShowDone ? groups.done : [], toggle, groups.done.length);
    }
  }

  container.innerHTML = html;
  const sb2 = document.getElementById('searchBox2');
  sb2.addEventListener('input', e=>{ searchText=e.target.value; renderNewStories(); });
  if(searchWasFocused){
    sb2.focus({preventScroll:true});
    sb2.selectionStart = sb2.selectionEnd = sb2.value.length;
  }
}

// เปิด modal งานประจำโดยกรอกจากเรื่องเปิดใหม่ — เหลือเลือกแค่วันกับคนทำ
function promoteNewToRecurring(id){
  const item = newStories.find(n=>n.id===id);
  if(!item) return;
  openRecurringModal();
  const cn = splitCodeName(item.code);
  document.getElementById('rCode').value = cn.code;
  document.getElementById('rName').value = item.name || cn.name;
  document.getElementById('rLink').value = item.link || '';
  document.getElementById('rDrive').value = item.gdrive || '';
  document.getElementById('recurringModalTitle').textContent = 'ย้ายเข้างานประจำ — เลือกวันและคนทำ';
  promoteFromNewId = id;   // saveNewRecurring จะย้ายเรื่องเปิดใหม่ตัวนี้ลงถังขยะให้หลังบันทึก
}
