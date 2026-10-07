// ===== แบ่งตอนเรื่องเปิดใหม่ (แจกวนทีละคน) =====
// - น๊อตอยู่ท้ายสุดเสมอ = ได้น้อยสุด (หรือเท่า)
// - อีก 3 คนผลัดกันเป็นคนแรก (ได้เยอะสุด) ทุกครั้งที่แบ่งเรื่องใหม่ — จำรอบไว้ที่ key split_next (ใช้ร่วมทั้งทีม)
// - เก็บผลไว้ที่ item.split = { from, to, order, at, by }  (แบ่งใหม่เรื่องเดิม = ไม่วนรอบเพิ่ม)
const SPLIT_LAST = 'น๊อต';
const SPLIT_ROTATE = ['บิ๊ก', 'ยูตะ', 'เหนือ'];
let splitNext = 0;          // คนแรกของเรื่องถัดไป = SPLIT_ROTATE[splitNext]
let splitDraft = null;      // { id, from, to, order }

async function loadSplitNext(){
  try{
    const r = await window.storage.get('split_next', true);
    const n = parseInt(r && r.value, 10);
    splitNext = isNaN(n) ? 0 : ((n % 3) + 3) % 3;
  }catch(e){}
}
function splitOrderFrom(first){
  const i = ((first % 3) + 3) % 3;
  return [...SPLIT_ROTATE.slice(i), ...SPLIT_ROTATE.slice(0, i), SPLIT_LAST];
}
function computeSplit(from, to, order){
  const out = {};
  order.forEach(p=>{ out[p] = []; });
  if(!(to >= from)) return out;
  for(let ep = from, i = 0; ep <= to; ep++, i++) out[order[i % order.length]].push(ep);
  return out;
}
// ป้ายเล็กในช่องติ๊กของแต่ละคน: " · 0, 4, 8"
function splitEpsLabel(item, person){
  if(!item.split) return '';
  const eps = computeSplit(item.split.from, item.split.to, item.split.order)[person] || [];
  return eps.length ? `<span class="split-eps">${eps.join(', ')}</span>` : '';
}
function splitText(item, from, to, order){
  const m = computeSplit(from, to, order);
  return [item.code + (displayName(item) ? ' ' + displayName(item) : '') + ` (ตอน ${from}–${to})`]
    .concat(order.map(p=>`${p}: ตอนที่ ${m[p].join(', ') || '—'} (${m[p].length} ตอน)`)).join('\n');
}

async function openSplitModal(id){
  const item = newStories.find(n=>n.id===id);
  if(!item) return;
  const s = item.split;
  if(!s) await loadSplitNext();   // เอารอบล่าสุดของทีม (เพื่อนอาจเพิ่งแบ่งเรื่องอื่นไป)
  splitDraft = { id, from: s ? s.from : 1, to: s ? s.to : '', order: s ? s.order.slice() : splitOrderFrom(splitNext) };
  const old = document.getElementById('modalSplit'); if(old) old.remove();
  const back = document.createElement('div');
  back.className = 'modal-backdrop show';
  back.id = 'modalSplit';
  back.innerHTML = `<div class="modal" style="max-width:480px;">
    <h3>✂ แบ่งตอน — ${esc(item.code)}</h3>
    <div class="split-range">
      <div class="field"><label>ตอนแรก</label><input id="splitFrom" type="number" min="0" value="${splitDraft.from}"></div>
      <div class="field"><label>ถึงตอน</label><input id="splitTo" type="number" min="0" value="${splitDraft.to}" placeholder="เช่น 21"></div>
    </div>
    <div class="split-order-row"><span>ลำดับ (คนแรกได้เยอะสุด · ${SPLIT_LAST}ท้ายเสมอ)</span>
      <button type="button" class="btn btn-ghost" onclick="rotateSplitOrder()" title="ให้คนถัดไปเป็นคนได้เยอะ">↻ สลับ</button></div>
    <div id="splitPreview"></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal('modalSplit')">ยกเลิก</button>
      <button type="button" class="btn btn-ghost" onclick="copySplit()">📋 คัดลอก</button>
      <button type="button" class="btn btn-primary" onclick="saveSplit()">บันทึก</button>
    </div>
  </div>`;
  back.addEventListener('click', e=>{ if(e.target === back) closeModal('modalSplit'); });
  document.body.appendChild(back);
  ['splitFrom', 'splitTo'].forEach(i=>document.getElementById(i).addEventListener('input', renderSplitPreview));
  renderSplitPreview();
  setTimeout(()=>{ const t = document.getElementById(s ? 'splitFrom' : 'splitTo'); if(t) t.focus(); }, 50);
}
function readSplitRange(){
  const from = parseInt(document.getElementById('splitFrom').value, 10);
  const to = parseInt(document.getElementById('splitTo').value, 10);
  return { from, to, ok: !isNaN(from) && !isNaN(to) && to >= from && from >= 0 && to - from < 2000 };
}
function renderSplitPreview(){
  const el = document.getElementById('splitPreview');
  if(!el || !splitDraft) return;
  const { from, to, ok } = readSplitRange();
  const m = ok ? computeSplit(from, to, splitDraft.order) : null;
  el.innerHTML = `<table class="data-table split-table"><thead><tr><th>#</th><th>รายชื่อ</th><th>เลขตอนที่ได้</th><th>จำนวน</th></tr></thead><tbody>
    ${splitDraft.order.map((p, i)=>`<tr><td>${i + 1}</td><td><b>${esc(p)}</b></td><td>${m ? (m[p].length ? 'ตอนที่ ' + m[p].join(', ') : '—') : '<span style="color:var(--ink-soft)">ใส่ช่วงตอน</span>'}</td><td>${m ? m[p].length + ' ตอน' : ''}</td></tr>`).join('')}
  </tbody></table>`;
}
function rotateSplitOrder(){
  if(!splitDraft) return;
  const r = splitDraft.order.filter(p=>p !== SPLIT_LAST);
  splitDraft.order = [...r.slice(1), r[0], SPLIT_LAST];
  renderSplitPreview();
}
async function copySplit(){
  const item = newStories.find(n=>n.id===(splitDraft && splitDraft.id));
  const { from, to, ok } = readSplitRange();
  if(!item || !ok){ showToast('ใส่ช่วงตอนให้ครบก่อน'); return; }
  try{ await navigator.clipboard.writeText(splitText(item, from, to, splitDraft.order)); showToast('คัดลอกแล้ว — วางในแชทได้เลย'); }
  catch(e){ showToast('คัดลอกไม่ได้ (เบราว์เซอร์ไม่อนุญาต)'); }
}
async function saveSplit(){
  const item = newStories.find(n=>n.id===(splitDraft && splitDraft.id));
  if(!item) return;
  const { from, to, ok } = readSplitRange();
  if(!ok){ showToast('ใส่ตอนแรกและถึงตอนให้ถูก (ถึงตอน ≥ ตอนแรก)'); return; }
  const firstTime = !item.split;
  item.split = { from, to, order: splitDraft.order.slice(), at: new Date().toISOString(), by: currentUserName() };
  logActivity(`แบ่งตอน "${item.code}" ตอน ${from}–${to} (${splitDraft.order[0]} ได้เยอะสุด)`);
  closeModal('modalSplit');
  renderNewStories();
  await persistNew(false);
  // เรื่องใหม่ = วนรอบให้คนถัดไปได้เยอะ (ต่อจากคนแรกที่ใช้จริง เผื่อกด ↻ เอง)
  if(firstTime){
    const used = SPLIT_ROTATE.indexOf(item.split.order[0]);
    splitNext = ((used < 0 ? splitNext : used) + 1) % 3;
    try{ await window.storage.set('split_next', String(splitNext), true); }catch(e){}
  }
  showToast('บันทึกการแบ่งตอนแล้ว');
}
