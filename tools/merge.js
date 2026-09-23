// ===== รวมการแก้ของ 2 เครื่องทีละช่อง (ไม่ใช่ทั้งเรื่อง) =====
// A เปลี่ยนสถานะ + B เพิ่มตอนค้าง เรื่องเดียวกันพร้อมกัน -> ได้ทั้งคู่
// - ช่องที่มีคนเดียวแก้ -> เอาของคนนั้น
// - object (statusByDay, pendingOwners, contrib) -> รวมทีละ key
// - array ค่าธรรมดา (pendingEpisodes, days) -> ใครเพิ่มก็เก็บ ใครลบก็ลบ
// - ชนกันจริง (แก้ช่องเดียวกันเป็นคนละค่า) -> ของเครื่องนี้ชนะ
function isPlainObj(x){ return x !== null && typeof x === 'object' && !Array.isArray(x); }
function mergeField(b, o, t){
  const S = x => x === undefined ? null : JSON.stringify(x);
  if(S(o) === S(b)) return t;
  if(S(t) === S(b) || S(o) === S(t)) return o;
  if(isPlainObj(o) && isPlainObj(t)){
    const base = isPlainObj(b) ? b : {};
    const out = {};
    new Set([...Object.keys(o), ...Object.keys(t)]).forEach(k=>{
      const v = mergeField(base[k], o[k], t[k]);
      if(v !== undefined) out[k] = v;
    });
    return out;
  }
  if(Array.isArray(o) && Array.isArray(t) && [...o, ...t].every(x=>x === null || typeof x !== 'object')){
    const base = new Set((Array.isArray(b) ? b : []).map(S));
    const inT = new Set(t.map(S)), inO = new Set(o.map(S));
    const out = o.filter(x=>!(base.has(S(x)) && !inT.has(S(x))));      // เขาลบ -> ลบ
    t.forEach(x=>{ if(!base.has(S(x)) && !inO.has(S(x))) out.push(x); }); // เขาเพิ่ม -> เพิ่ม
    return out;
  }
  return o;
}
function mergeItemFields(b, o, t){
  const m = mergeField(b, o, t);
  // สถานะสรุปของเรื่องหลายวันต้องตรงกับ statusByDay ที่รวมแล้ว
  if(isPlainObj(m) && Array.isArray(m.days) && typeof normalizeDays === 'function') normalizeDays(m);
  return m;
}
