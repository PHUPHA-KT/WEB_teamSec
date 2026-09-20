// ===== ตอนล่าสุดที่ทำแล้ว (item.lastEp) =====
// - เก็บเป็นตัวเลขหรือข้อความ เหมือนตอนค้าง (12, 9.5, พิเศษ)
// - อัปเดตเองเมื่อกด ✕ ตอนค้าง / เคลียร์ทุกตอน (เอาตอนที่สูงกว่าเดิม) — เปลี่ยนสถานะรายสัปดาห์ไม่บวกให้เอง
// - กดป้ายเพื่อแก้เอง
function epRank(ep){ return typeof ep === 'number' ? ep : parseFloat(String(ep)); }
// ep ใหม่ "สูงกว่า" ของเดิมไหม — ข้อความ (พิเศษ) เทียบตัวเลขไม่ได้ ให้ทับได้เฉพาะเมื่อของเดิมว่าง
function isLaterEp(ep, cur){
  if(cur === undefined || cur === null || cur === '') return true;
  const a = epRank(ep), b = epRank(cur);
  if(isNaN(a) || isNaN(b)) return false;
  return a > b;
}
function bumpLastEp(item, eps){
  (Array.isArray(eps) ? eps : [eps]).forEach(ep=>{ if(isLaterEp(ep, item.lastEp)) item.lastEp = ep; });
}
function lastEpBadgeHtml(item){
  const has = item.lastEp !== undefined && item.lastEp !== null && item.lastEp !== '';
  return `<span class="lastep-badge ${has?'':'lastep-empty'}" onclick="editLastEp('${item.id}')" title="กดเพื่อแก้ตอนล่าสุดที่ทำแล้ว">${has ? 'ล่าสุด ' + esc(epLabel(item.lastEp)) : 'ล่าสุด ?'}</span>`;
}
async function editLastEp(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const cur = item.lastEp === undefined || item.lastEp === null ? '' : String(item.lastEp);
  const raw = await uiPrompt(`ตอนล่าสุดที่ทำแล้วของ "${item.name||item.code}" (เว้นว่าง = ล้าง)`, { value: cur, placeholder: 'เช่น 24, 9.5, พิเศษ' });
  if(raw === null || raw === undefined) return;
  const eps = parseEpisodeInput(raw);
  if(raw.trim() && !eps.length){ showToast('ใส่เลขตอน หรือชื่อตอน เช่น 24, 9.5, พิเศษ'); return; }
  const val = eps.length ? sortEpisodes(eps)[eps.length-1] : undefined;
  if(epKey(val) === epKey(item.lastEp) && val !== undefined) return;
  if(val === undefined) delete item.lastEp; else item.lastEp = val;
  logActivity(`ตอนล่าสุด "${item.name||item.code}" → ${val === undefined ? 'ล้าง' : epLabel(val)}`);
  renderRecurring();
  await persistRecurring(false);
}
