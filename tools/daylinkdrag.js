// ===== ลิงก์โหลดรายวัน: ลากย้ายวัน / สลับลำดับ =====
// ลากที่ ⠿ ไปวางกล่องวันอื่น = ย้ายไปต่อท้ายวันนั้น · วางทับลิงก์ = แทรกก่อนลิงก์นั้น
// ลำดับในวัน = ลำดับใน dayLinks (dayLinksOf กรองตามวันแบบคงลำดับ)
async function moveDayLink(id, toDay, beforeId){
  const i = dayLinks.findIndex(x=>x.id===id);
  if(i < 0 || beforeId === id) return;
  const link = dayLinks[i];
  const fromDay = link.day;
  const arr = dayLinks.slice();
  arr.splice(i, 1);
  const moved = { ...link, day: toDay };
  let at = beforeId ? arr.findIndex(x=>x.id===beforeId) : -1;
  if(at < 0){
    // ต่อท้ายลิงก์สุดท้ายของวันปลายทาง (ไม่มีเลย = ท้ายรายการ)
    let last = -1;
    arr.forEach((x, k)=>{ if(x.day === toDay) last = k; });
    at = last < 0 ? arr.length : last + 1;
  }
  arr.splice(at, 0, moved);
  if(JSON.stringify(arr) === JSON.stringify(dayLinks)) return;
  dayLinks = arr;
  if(fromDay !== toDay) logActivity(`ย้ายลิงก์โหลด "${link.label || linkHostLabel(link.url)}" จาก${fromDay} → ${toDay}`);
  renderRecurring();
  await persistDayLinks();
}
// ผูกครั้งเดียวที่ document — แถบลิงก์ถูกวาดใหม่ทุกครั้งที่ renderRecurring
(function(){
  let dragId = null;
  const clear = () => document.querySelectorAll('.daylink-over, .daylink-before').forEach(x=>x.classList.remove('daylink-over', 'daylink-before'));
  document.addEventListener('dragstart', e=>{
    const it = e.target.closest && e.target.closest('.daylink-item[data-link]');
    if(!it) return;
    dragId = it.dataset.link;
    it.classList.add('daylink-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try{ e.dataTransfer.setData('text/plain', dragId); }catch(_){}
  });
  document.addEventListener('dragend', ()=>{ dragId = null; clear(); document.querySelectorAll('.daylink-dragging').forEach(x=>x.classList.remove('daylink-dragging')); });
  document.addEventListener('dragover', e=>{
    if(!dragId) return;
    const day = e.target.closest && e.target.closest('.daylink-day[data-day]');
    if(!day) return;
    e.preventDefault();
    clear();
    day.classList.add('daylink-over');
    const it = e.target.closest('.daylink-item[data-link]');
    if(it && it.dataset.link !== dragId) it.classList.add('daylink-before');
  });
  document.addEventListener('drop', e=>{
    if(!dragId) return;
    const day = e.target.closest && e.target.closest('.daylink-day[data-day]');
    if(!day) return;
    e.preventDefault();
    const it = e.target.closest('.daylink-item[data-link]');
    const id = dragId;
    dragId = null; clear();
    moveDayLink(id, day.dataset.day, it ? it.dataset.link : null);
  });
})();
