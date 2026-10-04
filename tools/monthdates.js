// ===== เรื่องที่ลงตามวันที่ของเดือน (เช่น 8, 18, 28) =====
// item.days = ['ตามวันที่']  item.monthDates = [8,18,28]
// item.dateStatus = { '2026-10-18':'done', ... }  สถานะแยกต่อรอบ — ถึงรอบใหม่ = ยังไม่ทำ เอง (ไม่ผูกกับรีเซ็ตวันจันทร์)
// item.monthDatesSince = วันที่ตั้งค่า — กันไม่ให้เตือน "ยังไม่ทำ" ย้อนไปรอบก่อนที่จะตั้ง
// วันที่ไม่มีในเดือนนั้น (เช่น 31 ในเดือน 30 วัน) = ข้ามรอบนั้น · นับวันใหม่ตอน 2 ทุ่มเหมือนที่อื่น
const MONTH_DAY = 'ตามวันที่';

function isDateType(item){ return itemDays(item).includes(MONTH_DAY); }
function monthDates(item){
  return [...new Set((item.monthDates || []).map(Number).filter(n=>n >= 1 && n <= 31))].sort((a,b)=>a-b);
}
function parseMonthDates(raw){
  return [...new Set(String(raw || '').split(/[^\d]+/).map(Number).filter(n=>n >= 1 && n <= 31))].sort((a,b)=>a-b);
}
function ymdOf(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function effDateOnly(){ const d = effectiveNow(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// รอบล่าสุดที่ถึงแล้ว (<= วันนี้) -> 'YYYY-MM-DD' หรือ null
function currentOccurrence(item){
  const ds = monthDates(item);
  if(!ds.length) return null;
  const t = effDateOnly();
  for(let back = 0; back < 3; back++){
    const y = t.getFullYear(), mo = t.getMonth() - back;
    const dim = new Date(y, mo + 1, 0).getDate();
    for(let i = ds.length - 1; i >= 0; i--){
      if(ds[i] > dim) continue;
      const d = new Date(y, mo, ds[i]);
      if(d <= t) return ymdOf(d);
    }
  }
  return null;
}
// รอบถัดไป (> วันนี้)
function nextOccurrence(item){
  const ds = monthDates(item);
  if(!ds.length) return null;
  const t = effDateOnly();
  for(let fwd = 0; fwd < 3; fwd++){
    const y = t.getFullYear(), mo = t.getMonth() + fwd;
    const dim = new Date(y, mo + 1, 0).getDate();
    for(const n of ds){
      if(n > dim) continue;
      const d = new Date(y, mo, n);
      if(d > t) return ymdOf(d);
    }
  }
  return null;
}
function isDateToday(item){ return isDateType(item) && currentOccurrence(item) === ymdOf(effDateOnly()); }
// รอบล่าสุดผ่านไปแล้ว (ไม่ใช่วันนี้) และอยู่หลังวันที่ตั้งค่า
function dateOccPassed(item){
  const occ = currentOccurrence(item);
  return !!occ && occ < ymdOf(effDateOnly()) && (!item.monthDatesSince || occ >= item.monthDatesSince);
}
function monthDatesLabel(item){ const ds = monthDates(item); return ds.length ? 'วันที่ ' + ds.join('·') : 'ตามวันที่ (ยังไม่ตั้ง)'; }
function occLabel(ymd){ return ymd ? 'วันที่ ' + Number(ymd.slice(8)) : ''; }

// ---- modal: ช่องกรอกวันที่ โชว์เมื่อติ๊ก "ตามวันที่" ----
function syncMonthDatesField(){
  const on = !!document.querySelector('#rDays input[value="' + MONTH_DAY + '"]:checked');
  const w = document.getElementById('rMonthDatesWrap');
  if(w) w.style.display = on ? '' : 'none';
}
