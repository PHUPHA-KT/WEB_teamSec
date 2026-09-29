// ===== แท็บ "ทุกเรื่อง" — รายการเรื่องประจำทั้งหมด รวมที่ดรอป/จบแล้ว =====
// โชว์แค่ รหัส · ชื่อ · ลิงก์ต้นทาง (+ป้ายดรอปเล็กๆ ให้รู้ว่าเลิกทำแล้ว) มีค้นหา
let allSearch = '';

// ชื่อแปล — กดแก้ได้ / ยังไม่มีขึ้นชื่อต้นฉบับแทน + ปุ่ม + ชื่อแปล
function allNameHtml(r){
  if(r.name) return `<span class="name-edit" onclick="editTransName('${r.id}')" title="กดเพื่อแก้ชื่อแปล">${esc(r.name)}</span>`;
  return `<span>${esc(r.origName || '—')}</span><button type="button" class="orig-add" onclick="editTransName('${r.id}')">+ ชื่อแปล</button>`;
}
async function editTransName(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const val = await uiPrompt(`ชื่อแปลของ "${displayName(item) || item.code}" (เว้นว่าง = ล้าง)`, { value: item.name || '', placeholder: 'ชื่อเรื่องภาษาไทย' });
  if(val === null || val === undefined) return;
  if(val === (item.name || '')) return;
  if(!val && !item.origName){ showToast('เรื่องนี้ไม่มีชื่อต้นฉบับ — ล้างชื่อแปลไม่ได้'); return; }
  const before = item.name || '';
  item.name = val;
  logActivity(`ชื่อแปล "${before || item.origName || item.code}" → ${val || 'ล้าง'}`);
  renderAllStories();
  await persistRecurring(false);
}

// ชื่อต้นฉบับใต้ชื่อเรื่อง — กดแก้ได้ / ยังไม่มีขึ้นปุ่ม + ชื่อต้นฉบับ
// (ไม่มีชื่อแปล = ต้นฉบับเป็นชื่อหลักอยู่แล้ว เหลือแค่ปุ่มแก้เล็กๆ)
function allOrigHtml(r){
  if(!r.origName) return `<button type="button" class="orig-add" onclick="editOrigName('${r.id}')">+ ชื่อต้นฉบับ</button>`;
  if(!r.name) return `<button type="button" class="orig-add" onclick="editOrigName('${r.id}')">✎ ต้นฉบับ</button>`;
  return `<div class="orig-name orig-edit" onclick="editOrigName('${r.id}')" title="กดเพื่อแก้ชื่อต้นฉบับ">${esc(r.origName)} ✎</div>`;
}
async function editOrigName(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const val = await uiPrompt(`ชื่อต้นฉบับของ "${displayName(item) || item.code}" (เว้นว่าง = ล้าง)`, { value: item.origName || '', placeholder: 'เกาหลี / ญี่ปุ่น / อังกฤษ' });
  if(val === null || val === undefined) return;
  if(val === (item.origName || '')) return;
  if(!val && !item.name){ showToast('เรื่องนี้ไม่มีชื่อแปล — ล้างชื่อต้นฉบับไม่ได้'); return; }
  if(val) item.origName = val; else delete item.origName;
  logActivity(`ชื่อต้นฉบับ "${item.name || item.code}" → ${val || 'ล้าง'}`);
  renderAllStories();
  await persistRecurring(false);
}

function renderAllStories(){
  const container = document.getElementById('mainContent');
  const activeEl = document.activeElement;
  const wasFocused = activeEl && activeEl.id === 'searchBoxAll';

  const q = allSearch.trim().toLowerCase();
  const list = recurring
    .filter(r => !q || (r.code||'').toLowerCase().includes(q) || nameMatches(r, q))
    .slice()
    .sort((a,b)=> String(a.code||'').localeCompare(String(b.code||''), 'th', {numeric:true}) || displayName(a).localeCompare(displayName(b), 'th'));

  const dropped = recurring.filter(r=>r.dropped).length;

  const rows = list.map(r=>{
    const drop = r.dropped && DROP_META[r.dropped]
      ? ` <span class="drop-badge" style="background:${DROP_META[r.dropped].bg};color:${DROP_META[r.dropped].fg};">${DROP_META[r.dropped].label}</span>`
      : '';
    const link = r.link
      ? `<a href="${safeUrl(r.link)}" target="_blank" rel="noopener" class="all-link" title="${esc(r.link)}">${esc(linkHostLabel(r.link))} ↗</a>`
      : '<span style="color:var(--ink-soft);">—</span>';
    return `<tr class="${r.dropped?'all-dropped':''}">
      <td class="all-code">${esc(r.code||'—')}</td>
      <td>${allNameHtml(r)}${drop}${allOrigHtml(r)}</td>
      <td>${link}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="toolbar">
      <div class="search-wrap">
        <input type="text" id="searchBoxAll" placeholder="ค้นหารหัสหรือชื่อเรื่อง..." value="${esc(allSearch)}">
        ${allSearch ? `<button type="button" class="search-clear" onclick="allSearch='';renderAllStories();document.getElementById('searchBoxAll').focus()" title="ล้างคำค้น">✕</button>` : ''}
      </div>
      <span style="font-size:12.5px;color:var(--ink-soft);white-space:nowrap;">${list.length} / ${recurring.length} เรื่อง${dropped?` · ดรอป ${dropped}`:''}</span>
    </div>
    ${list.length ? `
      <div class="table-wrap"><table class="data-table all-table">
        <thead><tr><th>รหัส</th><th>ชื่อเรื่อง</th><th>ลิงก์ต้นทาง</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
      : `<div class="empty-state">${recurring.length ? 'ไม่พบเรื่องที่ตรงกับคำค้น' : 'ยังไม่มีเรื่อง'}</div>`}
  `;

  const box = document.getElementById('searchBoxAll');
  box.addEventListener('input', e=>{ allSearch = e.target.value; renderAllStories(); });
  if(wasFocused){ box.focus({preventScroll:true}); box.selectionStart = box.selectionEnd = box.value.length; }
}
