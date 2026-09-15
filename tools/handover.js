// ===== ย้ายคนทั้งที่ยังมีตอนค้าง: หนี้เก่ายังเป็นของคนเดิมจนเคลียร์ =====
// item.pendingOwners = { <epKey>: "ชื่อคน" }  เฉพาะตอนที่เป็นของคนอื่นที่ไม่ใช่เจ้าของเรื่องปัจจุบัน
// - ตอนที่ไม่มีใน map = ของ item.person (รวมตอนที่เพิ่มทีหลัง)
// - ไม่มี field = ทุกตอนเป็นของคนปัจจุบัน (ข้อมูลเก่าไม่ต้องย้าย)
// - ตอนไหนเคลียร์แล้วก็ลบออกจาก map, ว่างแล้วลบ field

function epOwner(item, ep){
  const m = item.pendingOwners || {};
  return m[epKey(ep)] || item.person;
}
// ตอนค้างที่เป็นของคนอื่น
function foreignPendingEps(item){
  return (item.pendingEpisodes || []).filter(e=>epOwner(item, e) !== item.person);
}
function hasForeignBacklog(item){ return foreignPendingEps(item).length > 0; }
// {person: จำนวนตอนค้าง}
function pendingEpsByPerson(item){
  const out = {};
  (item.pendingEpisodes || []).forEach(e=>{ const p = epOwner(item, e) || ''; out[p] = (out[p] || 0) + 1; });
  return out;
}
// คนที่ควรเห็นเรื่องนี้ในตัวกรองคน / งานของฉัน
function isPersonInvolved(item, person){
  return item.person === person || foreignPendingEps(item).some(e=>epOwner(item, e) === person);
}
// เอาตอนที่ไม่ค้างแล้วออกจาก map
function clearPendingOwnerIfDone(item){
  if(!item.pendingOwners) return;
  const pending = new Set((item.pendingEpisodes || []).map(epKey));
  for(const k of Object.keys(item.pendingOwners)){
    if(!pending.has(k) || item.pendingOwners[k] === item.person) delete item.pendingOwners[k];
  }
  if(!Object.keys(item.pendingOwners).length) delete item.pendingOwners;
}
// "ตอน 14, 15 ของ ยูตะ · ตอน 9 ของ เหนือ"
function foreignBacklogLabel(item){
  const by = {};
  foreignPendingEps(item).forEach(e=>{ const p = epOwner(item, e); (by[p] = by[p] || []).push(e); });
  return Object.keys(by).map(p=>sortEpisodes(by[p]).map(epLabel).join(', ') + ' ของ ' + p).join(' · ');
}

// กล่องเลือก 2 ทาง — ใช้ modal ยืนยันเดิม แต่เปลี่ยนข้อความปุ่ม
// คืน 'ok' / 'alt' / null (ปิด/ยกเลิก)
function uiChoice(message, title, okLabel, altLabel){
  return new Promise(resolve=>{
    const back = document.getElementById('modalConfirm');
    const okBtn = document.getElementById('confirmOk');
    const altBtn = document.getElementById('confirmCancel');
    const okText = okBtn.textContent, altText = altBtn.textContent;
    document.getElementById('confirmTitle').textContent = title || 'เลือก';
    document.getElementById('confirmMsg').textContent = message || '';
    okBtn.textContent = okLabel; altBtn.textContent = altLabel;
    function cleanup(result){
      back.classList.remove('show');
      okBtn.textContent = okText; altBtn.textContent = altText;
      okBtn.removeEventListener('click', onOk); altBtn.removeEventListener('click', onAlt);
      back.removeEventListener('click', onBack);
      resolve(result);
    }
    function onOk(){ cleanup('ok'); }
    function onAlt(){ cleanup('alt'); }
    function onBack(e){ if(e.target === back) cleanup(null); }
    okBtn.addEventListener('click', onOk); altBtn.addEventListener('click', onAlt);
    back.addEventListener('click', onBack);
    back.classList.add('show');
  });
}

// เรียกก่อนเปลี่ยน item.person — ถ้าคนที่กำลังจะพ้นไปยังมีตอนค้างของตัวเอง จะถามว่าใครเคลียร์
// คืน true = ไปต่อได้ (ตั้ง map ให้แล้ว), false = ผู้ใช้ปิดกล่อง ยกเลิกการย้าย
async function resolveBacklogOnReassign(item, newPerson){
  const oldOwner = item.person;
  // ตอนของคนเดิม (ไม่ใช่หนี้ที่ติดชื่อคนอื่นไว้แล้ว) — ต้องคำนวณก่อนแตะ map
  const own = (item.pendingEpisodes || []).filter(e=>epOwner(item, e) === oldOwner);
  // ตอนที่ newPerson ถือหนี้อยู่ -> พอเรื่องกลับมาเป็นของเขา หนี้นั้นก็เป็น "ของตัวเอง" ไม่ต้องจำ
  if(item.pendingOwners){
    for(const k of Object.keys(item.pendingOwners)) if(item.pendingOwners[k] === newPerson) delete item.pendingOwners[k];
    if(!Object.keys(item.pendingOwners).length) delete item.pendingOwners;
  }
  if(!own.length || !oldOwner) return true;
  const list = sortEpisodes(own).map(epLabel).join(', ');
  const choice = await uiChoice(
    `"${item.name||item.code}" ยังค้าง ${own.length} ตอน (${list})\nย้ายเรื่องไปให้ ${newPerson} แล้ว ตอนค้างพวกนี้ให้ใครเคลียร์?`,
    'ตอนค้างให้ใครทำ',
    `${oldOwner} ทำต่อ (คนเดิม)`,
    `${newPerson} รับไปด้วย`
  );
  if(choice === null) return false;
  if(choice === 'ok'){
    item.pendingOwners = item.pendingOwners || {};
    own.forEach(e=>{ item.pendingOwners[epKey(e)] = oldOwner; });
  }
  return true;
}
