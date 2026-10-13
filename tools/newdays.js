// ===== วันที่ลงของเรื่องเปิดใหม่ (item.days / item.monthDates) — ไม่บังคับ =====
// เลือกไว้ตั้งแต่เพิ่มเรื่องเปิดใหม่ แล้วกรอกให้ตอนย้ายเข้างานประจำ
// มาจากกำหนดการ = เลือกวันในสัปดาห์ของวันที่เปิดให้เอง
function newDayChecksHtml(){
  const pill = d => `<label class="day-check"><input type="checkbox" value="${d}" onchange="onNewDayCheck(this)"><span>${d}</span></label>`;
  const choices = DAY_CHOICES.filter(d=>d !== 'จบแล้ว');
  const week = choices.filter(d=>WEEKDAY_ONLY.includes(d));
  const other = choices.filter(d=>!WEEKDAY_ONLY.includes(d));
  return `<div class="day-check-group">${week.map(pill).join('')}</div><div class="day-check-group day-check-other">${other.map(pill).join('')}</div>`;
}
function syncNewMonthDates(){
  const on = !!document.querySelector('#nDays input[value="' + MONTH_DAY + '"]:checked');
  const w = document.getElementById('nMonthDatesWrap');
  if(w) w.style.display = on ? '' : 'none';
}
function setNewDayChecks(days, dates){
  const box = document.getElementById('nDays');
  if(!box.children.length) box.innerHTML = newDayChecksHtml();
  const set = new Set(days || []);
  box.querySelectorAll('input').forEach(cb=>{ cb.checked = set.has(cb.value); });
  document.getElementById('nMonthDates').value = dates && dates.length ? dates.join(', ') : '';
  syncNewMonthDates();
}
function readNewDays(){ return Array.from(document.querySelectorAll('#nDays input:checked')).map(cb=>cb.value); }
function onNewDayCheck(cb){
  setTimeout(syncNewMonthDates, 0);
  if(!cb.checked) return;
  const boxes = Array.from(document.querySelectorAll('#nDays input'));
  if(DAY_EXCLUSIVE.includes(cb.value)) boxes.forEach(b=>{ if(b !== cb) b.checked = false; });
  else boxes.forEach(b=>{ if(DAY_EXCLUSIVE.includes(b.value)) b.checked = false; });
}
function weekdayOfYmd(ymd){
  const d = new Date(String(ymd) + 'T00:00:00');
  return isNaN(d) ? null : WEEKDAY_ONLY[(d.getDay() + 6) % 7];
}
// ป้ายวันบนการ์ดเรื่องเปิดใหม่
function newDaysBadgeHtml(item){
  const days = item.days || [];
  if(!days.length) return '';
  const label = days.includes(MONTH_DAY) ? 'วันที่ ' + (item.monthDates || []).join('·') : days.join(' · ');
  return ` <span class="day-pill" style="${dayPillStyle(days[0])}">${esc(label)}</span>`;
}
