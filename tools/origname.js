// ===== ชื่อเรื่อง 2 แบบ: ชื่อแปล (item.name) + ชื่อต้นฉบับ (item.origName) =====
// ไม่มีชื่อแปล = ใช้ชื่อต้นฉบับแสดงแทนทุกที่
function displayName(item){ return (item && (item.name || item.origName)) || ''; }
// บรรทัดชื่อต้นฉบับตัวเล็ก (โชว์เฉพาะเมื่อมีทั้ง 2 ชื่อ — ถ้ามีแต่ต้นฉบับ มันขึ้นเป็นชื่อหลักอยู่แล้ว)
function origNameHtml(item){
  return item.name && item.origName ? `<div class="orig-name">${esc(item.origName)}</div>` : '';
}
function nameMatches(item, q){
  return (item.name||'').toLowerCase().includes(q) || (item.origName||'').toLowerCase().includes(q);
}
// ข้อความมีตัวอักษรไทยไหม / เป็นอักษรเกาหลี-ญี่ปุ่น-จีนไหม (ใช้ย้ายชื่อเก่าที่ใส่ต้นฉบับไว้ในช่องชื่อแปล)
function hasThai(s){ return /[฀-๿]/.test(s || ''); }
function hasCJK(s){ return /[가-힯ᄀ-ᇿ぀-ヿ一-鿿]/.test(s || ''); }
