// ===== เรื่องเดียวมีหลายวันต่อสัปดาห์ =====
// item.days        = ['อาทิตย์','จันทร์','อังคาร']   (ไม่มี = ใช้ item.day วันเดียวเหมือนเดิม)
// item.statusByDay = { 'อาทิตย์':'done', 'จันทร์':'pending', ... }  สถานะแยกต่อวัน (เฉพาะหลายวัน)
// item.day         = วันแรก เก็บไว้ให้โค้ดเก่า/export อ่านได้เสมอ
// ตอนค้าง / ลิงก์ / คนทำ / ดรอป ใช้ร่วมกันทุกวัน — เป็นเรื่องเดียวกัน

function itemDays(item){
  return (Array.isArray(item.days) && item.days.length) ? item.days : [item.day || 'ไม่ระบุวัน'];
}
function isMultiDay(item){ return itemDays(item).length > 1; }
function dayStatus(item, day){
  if(!isMultiDay(item)) return item.status || 'pending';
  return (item.statusByDay || {})[day] || 'pending';
}
function setDayStatus(item, day, st){
  if(!isMultiDay(item)){ item.status = st; return; }
  item.statusByDay = item.statusByDay || {};
  item.statusByDay[day] = st;
  // สรุปเป็น item.status ให้ที่อื่นอ่านได้: ครบทุกวัน = done ไม่งั้น pending
  item.status = itemDays(item).every(d=>(item.statusByDay[d] || 'pending') === 'done') ? 'done' : 'pending';
}
function dayHasPassed(day){
  const idx = WEEKDAY_ONLY.indexOf(day);
  return idx !== -1 && idx < todayWeekdayIndex();
}
// หลังแก้วันใน modal / ลากในปฏิทิน: จัด day/days/statusByDay ให้สอดคล้อง
function normalizeDays(item){
  const seen = new Set();
  const days = itemDays(item).filter(d=>{ if(seen.has(d)) return false; seen.add(d); return true; });
  item.day = days[0];
  if(days.length > 1){
    item.days = days;
    item.statusByDay = item.statusByDay || {};
    for(const k of Object.keys(item.statusByDay)) if(!days.includes(k)) delete item.statusByDay[k];
    item.status = days.every(d=>(item.statusByDay[d] || 'pending') === 'done') ? 'done' : 'pending';
  } else {
    // กลับเป็นวันเดียว: เอาสถานะของวันที่เหลือมาเป็นสถานะเรื่อง
    if(item.statusByDay && item.statusByDay[days[0]]) item.status = item.statusByDay[days[0]];
    delete item.days;
    delete item.statusByDay;
  }
}

// ---- modal: ติ๊กวันได้หลายวัน ----
const DAY_CHOICES = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ไม่ระบุวัน','จบแล้ว'];
const DAY_EXCLUSIVE = ['ไม่ระบุวัน','จบแล้ว'];   // เลือกอันนี้แล้วเลือกวันอื่นไม่ได้
function dayChecksHtml(){
  return DAY_CHOICES.map(d=>`<label class="day-check"><input type="checkbox" value="${d}" onchange="onDayCheck(this)"> ${d}</label>`).join('');
}
function setDayChecks(days){
  const set = new Set(days);
  document.querySelectorAll('#rDays input').forEach(cb=>{ cb.checked = set.has(cb.value); });
}
function readDayChecks(){
  const out = Array.from(document.querySelectorAll('#rDays input:checked')).map(cb=>cb.value);
  return out.length ? out : ['ไม่ระบุวัน'];
}
function onDayCheck(cb){
  if(!cb.checked) return;
  const boxes = Array.from(document.querySelectorAll('#rDays input'));
  if(DAY_EXCLUSIVE.includes(cb.value)) boxes.forEach(b=>{ if(b !== cb) b.checked = false; });
  else boxes.forEach(b=>{ if(DAY_EXCLUSIVE.includes(b.value)) b.checked = false; });
}
