// ===== ประวัติเรื่องเปิดใหม่ (new_story_history) — เก็บถาวร ไม่ขึ้นกับถังขยะ =====
// 1 บันทึกต่อ 1 การ์ด (id เดียวกัน) อัปเดตจากการ์ดทุกครั้งก่อนเซฟ — การ์ดลงถังขยะแล้ว บันทึกยังอยู่
// { id, code, link, createdAt, split:{from,to,order}, contribAt:{คน:ISO}, doneAt, promotedCode, removedAt, updatedAt }
function syncNewStoryHistory(){
  const now = new Date().toISOString();
  const live = new Set(newStories.map(n=>n.id));
  const byId = new Map(newStoryHistory.map(h=>[h.id, h]));
  let changed = false;
  newStories.forEach(n=>{
    const old = byId.get(n.id) || {};
    const contribAt = { ...(old.contribAt || {}) };
    Object.keys(n.contribAt || {}).forEach(p=>{ contribAt[p] = n.contribAt[p]; });
    PEOPLE.forEach(p=>{ if(!(n.contrib || {})[p]) delete contribAt[p]; });   // เอาติ๊กออก = ยังไม่เสร็จ
    const allDone = PEOPLE.every(p=>(n.contrib || {})[p]);
    const times = Object.values(contribAt).sort();
    const promoted = n.promotedId ? recurring.find(r=>r.id === n.promotedId) : null;
    const rec = {
      id: n.id, code: n.code || '', link: n.link || '',
      createdAt: n.createdAt || old.createdAt || '',
      split: n.split ? { from: n.split.from, to: n.split.to, order: n.split.order.slice() } : (old.split || null),
      contribAt,
      doneAt: allDone ? (old.doneAt || times[times.length - 1] || now) : '',
      promotedCode: promoted ? promoted.code : (old.promotedCode || ''),
      removedAt: '',
    };
    const same = JSON.stringify({ ...rec, updatedAt: old.updatedAt }) === JSON.stringify(old);
    if(!same){ rec.updatedAt = now; byId.set(n.id, rec); changed = true; }
  });
  // เรื่องเปิดใหม่ที่อยู่ในถังขยะแต่ยังไม่มีในประวัติ (ก่อนมีระบบนี้) — เก็บเข้าประวัติด้วย
  (trash || []).forEach(t=>{
    const n = t && t.coll === 'newstories' ? t.item : null;
    if(!n || !n.id || byId.has(n.id) || live.has(n.id)) return;
    const allDone = PEOPLE.every(p=>(n.contrib || {})[p]);
    const promoted = n.promotedId ? recurring.find(r=>r.id === n.promotedId) : null;
    byId.set(n.id, {
      id: n.id, code: n.code || '', link: n.link || '', createdAt: n.createdAt || '',
      split: n.split ? { from: n.split.from, to: n.split.to, order: n.split.order.slice() } : null,
      contribAt: { ...(n.contribAt || {}) },
      doneAt: allDone ? (t.deletedAt || now) : '', promotedCode: promoted ? promoted.code : '',
      removedAt: allDone ? '' : (t.deletedAt || now), updatedAt: now,
    });
    changed = true;
  });
  // การ์ดหายไปจากเรื่องเปิดใหม่ (ลงถังขยะ) — ทำครบแล้ว = จบตามปกติ / ยังไม่ครบ = ถูกลบ
  // ดูสถานะสุดท้ายจากการ์ดในถังขยะ (ติ๊กครบแล้วลงถังในรอบเซฟเดียวกัน ต้องนับเป็นเสร็จ ไม่ใช่ลบ)
  byId.forEach((h, id)=>{
    if(live.has(id) || h.doneAt || h.removedAt) return;
    const t = (trash || []).find(x=>x.coll === 'newstories' && x.item && x.item.id === id);
    const n = t ? t.item : null;
    const allDone = n && PEOPLE.every(p=>(n.contrib || {})[p]);
    if(allDone){
      const contribAt = { ...(h.contribAt || {}), ...(n.contribAt || {}) };
      const times = Object.values(contribAt).sort();
      const promoted = n.promotedId ? recurring.find(r=>r.id === n.promotedId) : null;
      byId.set(id, { ...h, contribAt, doneAt: times[times.length - 1] || (t && t.deletedAt) || now,
        promotedCode: promoted ? promoted.code : (h.promotedCode || ''), updatedAt: now });
    } else {
      byId.set(id, { ...h, removedAt: (t && t.deletedAt) || now, updatedAt: now });
    }
    changed = true;
  });
  if(changed) newStoryHistory = [...byId.values()];
  return changed;
}
function fmtShortDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.getDate() + ' ' + TH_MON[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2);
}
let newHistorySearch = '';
function openNewHistory(){
  syncNewStoryHistory();
  const old = document.getElementById('modalNewHistory'); if(old) old.remove();
  const back = document.createElement('div');
  back.className = 'modal-backdrop show';
  back.id = 'modalNewHistory';
  back.innerHTML = `<div class="modal" style="max-width:920px;">
    <h3>📜 ประวัติเรื่องเปิดใหม่</h3>
    <input id="newHistSearch" type="text" placeholder="ค้นหารหัส..." value="${esc(newHistorySearch)}" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
    <div id="newHistBody"></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="closeModal('modalNewHistory')">ปิด</button></div>
  </div>`;
  back.addEventListener('click', e=>{ if(e.target === back) closeModal('modalNewHistory'); });
  document.body.appendChild(back);
  const s = document.getElementById('newHistSearch');
  s.addEventListener('input', ()=>{ newHistorySearch = s.value; renderNewHistory(); });
  renderNewHistory();
}
function renderNewHistory(){
  const el = document.getElementById('newHistBody');
  if(!el) return;
  const q = newHistorySearch.trim().toLowerCase();
  const list = newStoryHistory
    .filter(h=>!q || (h.code || '').toLowerCase().includes(q))
    .slice().sort((a, b)=>(b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || ''));
  if(!list.length){ el.innerHTML = '<div class="empty-state">ยังไม่มีประวัติ</div>'; return; }
  el.innerHTML = `<div class="table-wrap"><table class="data-table nh-table"><thead><tr>
      <th>เรื่อง</th><th>มาเมื่อ</th><th>ใครได้ตอนไหน · เสร็จวันไหน</th><th>เสร็จครบ</th></tr></thead><tbody>
    ${list.map(h=>{
      const m = h.split ? computeSplit(h.split.from, h.split.to, h.split.order) : null;
      const people = (h.split ? h.split.order : PEOPLE).map(p=>{
        const eps = m ? (m[p] || []) : null;
        const at = (h.contribAt || {})[p];
        return `<div class="nh-person"><b>${esc(p)}</b>${eps ? ` <span class="nh-eps">${eps.length ? 'ตอน ' + eps.join(', ') : '—'}</span>` : ''} <span class="nh-at ${at ? 'nh-done' : ''}">${at ? '✓ ' + fmtShortDate(at) : 'ยังไม่เสร็จ'}</span></div>`;
      }).join('');
      const status = h.doneAt ? `<span class="nh-badge nh-badge-done">✓ ${fmtShortDate(h.doneAt)}</span>`
        : h.removedAt ? `<span class="nh-badge nh-badge-removed">ลบ ${fmtShortDate(h.removedAt)}</span>`
        : `<span class="nh-badge">กำลังทำ</span>`;
      return `<tr>
        <td><b>${esc(h.code)}</b>${h.split ? `<div class="nh-sub">แบ่งตอน ${h.split.from}–${h.split.to}</div>` : ''}${h.promotedCode ? `<div class="nh-sub">→ งานประจำ ${esc(h.promotedCode)}</div>` : ''}</td>
        <td style="white-space:nowrap;">${fmtShortDate(h.createdAt)}</td>
        <td>${people}</td>
        <td>${status}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}
