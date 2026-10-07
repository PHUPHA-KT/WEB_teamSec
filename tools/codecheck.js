// ===== B5: เตือนรหัสซ้ำ + คนทำติดจากกำหนดการ =====
// รหัสซ้ำ = ในรายการเดียวกัน มีเลขรัน 18-N เดียวกัน หรือรหัสตรงกันทั้งตัว
// (คนละรายการไม่นับ — กำหนดการ -> เรื่องเปิดใหม่ -> งานประจำ ใช้เลขเดียวกันตามปกติ)
const CODE_LIST_LABEL = { recurring:'งานประจำ', newstories:'เรื่องเปิดใหม่', schedule:'กำหนดการ' };
function codeListOf(coll){
  if(coll === 'recurring') return recurring.map(r=>({ id:r.id, code:r.code || '', label:(r.code || '') + (displayName(r) ? ' · ' + displayName(r) : '') }));
  if(coll === 'newstories') return newStories.map(n=>({ id:n.id, code:n.code || '', label:n.code || '' }));
  return scheduleEntries.map(e=>({ id:e.id, code:e.title || '', label:e.title || '' }));
}
function codeConflicts(coll, code, excludeId){
  const norm = String(code || '').trim().toLowerCase();
  if(!norm) return [];
  const ser = codeSerial(code);
  return codeListOf(coll).filter(x=>x.id !== excludeId && (
    String(x.code).trim().toLowerCase() === norm || (ser !== null && codeSerial(x.code) === ser)));
}
// ไม่ซ้ำ = true · ซ้ำ = ถามก่อน (ตกลง = บันทึกต่อ)
async function confirmCodeUnique(coll, code, excludeId){
  const hits = codeConflicts(coll, code, excludeId);
  if(!hits.length) return true;
  const ser = codeSerial(code);
  return uiConfirm(
    `${ser !== null ? 'เลข 18-' + ser : 'รหัส "' + code + '"'} มีอยู่แล้วใน${CODE_LIST_LABEL[coll]}:\n`
      + hits.slice(0, 5).map(h=>'• ' + h.label).join('\n') + (hits.length > 5 ? '\n• …อีก ' + (hits.length - 5) : '')
      + '\n\nบันทึกต่อไหม?',
    'รหัสซ้ำ');
}
// คนทำของเรื่องเปิดใหม่: จากกำหนดการที่ส่งมา (fromScheduleId) หรือกำหนดการที่เลข 18-N ตรงกัน
function schedulePersonFor(newItem){
  let e = newItem.fromScheduleId ? scheduleEntries.find(x=>x.id === newItem.fromScheduleId) : null;
  if(!e || !e.person){
    const ser = codeSerial(newItem.code);
    if(ser !== null) e = scheduleEntries.find(x=>x.person && codeSerial(x.title) === ser) || e;
  }
  return e && PEOPLE.includes(e.person) ? e.person : '';
}
