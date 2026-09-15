// ===== ย้ายคนทั้งที่ยังมีตอนค้าง: หนี้เก่ายังเป็นของคนเดิม (pendingOwner) จนเคลียร์ =====
// - item.pendingOwner = ชื่อคนที่ต้องเคลียร์ตอนค้าง (ไม่มี field = คนปัจจุบัน)
// - ถามตอนย้าย (ลากในปฏิทิน / แก้ใน modal) ว่าตอนค้างให้ใครทำ
// - ป้ายค้าง / การ์ดยอดค้าง / ⭐ งานของฉัน ดูที่ pendingOwner
// - เคลียร์ครบ -> ลบ field เรื่องเป็นของคนใหม่เต็มตัว

// ใครต้องเคลียร์ตอนค้างของเรื่องนี้
function pendingOwnerOf(item){
  return (item.pendingOwner && pendingEpCount(item) > 0) ? item.pendingOwner : item.person;
}
// ตอนค้างเป็นของคนอื่นที่ไม่ใช่เจ้าของเรื่องปัจจุบันไหม
function hasForeignBacklog(item){
  return !!item.pendingOwner && pendingEpCount(item) > 0 && item.pendingOwner !== item.person;
}
function clearPendingOwnerIfDone(item){
  if(item.pendingOwner && pendingEpCount(item) === 0) delete item.pendingOwner;
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

// เรียกก่อนเปลี่ยน item.person — ถ้ามีตอนค้างจะถามว่าใครเคลียร์
// คืน true = ไปต่อได้ (ตั้ง pendingOwner ให้แล้ว), false = ผู้ใช้ปิดกล่อง ยกเลิกการย้าย
async function resolveBacklogOnReassign(item, newPerson){
  const eps = pendingEpCount(item);
  const oldOwner = pendingOwnerOf(item);
  if(!eps || !oldOwner || oldOwner === newPerson){
    if(oldOwner === newPerson) delete item.pendingOwner;
    return true;
  }
  const list = sortEpisodes(item.pendingEpisodes).map(epLabel).join(', ');
  const choice = await uiChoice(
    `"${item.name||item.code}" ยังค้าง ${eps} ตอน (${list})\nย้ายเรื่องไปให้ ${newPerson} แล้ว ตอนค้างพวกนี้ให้ใครเคลียร์?`,
    'ตอนค้างให้ใครทำ',
    `${oldOwner} ทำต่อ (คนเดิม)`,
    `${newPerson} รับไปด้วย`
  );
  if(choice === null) return false;
  if(choice === 'ok') item.pendingOwner = oldOwner;
  else delete item.pendingOwner;
  return true;
}
