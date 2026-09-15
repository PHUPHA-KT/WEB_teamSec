// ===== แท็บ "ทุกเรื่อง" — รายการเรื่องประจำทั้งหมด รวมที่ดรอป/จบแล้ว =====
// โชว์แค่ รหัส · ชื่อ · ลิงก์ต้นทาง (+ป้ายดรอปเล็กๆ ให้รู้ว่าเลิกทำแล้ว) มีค้นหา
let allSearch = '';

function renderAllStories(){
  const container = document.getElementById('mainContent');
  const activeEl = document.activeElement;
  const wasFocused = activeEl && activeEl.id === 'searchBoxAll';

  const q = allSearch.trim().toLowerCase();
  const list = recurring
    .filter(r => !q || (r.code||'').toLowerCase().includes(q) || (r.name||'').toLowerCase().includes(q))
    .slice()
    .sort((a,b)=> String(a.code||'').localeCompare(String(b.code||''), 'th', {numeric:true}) || String(a.name||'').localeCompare(String(b.name||''), 'th'));

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
      <td>${esc(r.name||'—')}${drop}</td>
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
