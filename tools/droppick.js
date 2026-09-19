// ===== ดรอปเรื่อง: เลือกจากปุ่ม แทนการพิมพ์ =====
// กล่องเลือกหลายตัวเลือก (สร้าง modal ชั่วคราว) คืน value หรือ null ถ้าปิด/ยกเลิก
function uiPick(title, message, options){
  return new Promise(resolve=>{
    const back = document.createElement('div');
    back.className = 'modal-backdrop show';
    back.innerHTML = `<div class="modal" style="max-width:420px;">
      <h3>${esc(title)}</h3>
      <p style="font-size:13.5px;color:var(--ink-soft);margin:0 0 14px;white-space:pre-line;">${esc(message)}</p>
      <div class="pick-grid">
        ${options.map((o,i)=>`<button type="button" class="pick-btn" data-i="${i}" style="background:${o.bg};color:${o.fg};border-color:${o.fg}33;">
          <b>${esc(o.label)}</b>${o.hint?`<small>${esc(o.hint)}</small>`:''}
        </button>`).join('')}
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost pick-cancel">ยกเลิก</button></div>
    </div>`;
    function done(v){ back.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
    function onKey(e){ if(e.key === 'Escape') done(null); }
    back.addEventListener('click', e=>{
      const b = e.target.closest('.pick-btn');
      if(b) return done(options[+b.dataset.i].value);
      if(e.target.closest('.pick-cancel') || e.target === back) done(null);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
  });
}

// ===== ดรอปเรื่อง (จบซีซั่น / จบแล้ว / LC / งดไม่มีกำหนด) =====
async function openDropMenu(id){
  const item = recurring.find(r=>r.id===id);
  if(!item) return;
  const eps = pendingEpCount(item);
  const val = await uiPick(
    'ดรอปเรื่อง',
    `"${item.name||item.code}"` + (eps ? `\nยังมีตอนค้าง ${eps} ตอน — จะอยู่ในงานปกติจนเคลียร์หมด แล้วย้ายเข้าดรอปเอง` : ''),
    [
      { value:'ended',    label: DROP_META.ended.label,    hint:'ซีซั่นนี้จบ รอซีซั่นหน้า',   bg: DROP_META.ended.bg,    fg: DROP_META.ended.fg },
      { value:'finished', label: DROP_META.finished.label, hint:'เรื่องจบสมบูรณ์ ไม่มีต่อแล้ว', bg: DROP_META.finished.bg, fg: DROP_META.finished.fg },
      { value:'lc',       label: DROP_META.lc.label,       hint:'ถูกซื้อลิขสิทธิ์',           bg: DROP_META.lc.bg,       fg: DROP_META.lc.fg },
      { value:'hiatus',   label: DROP_META.hiatus.label,   hint:'พักไว้ ยังไม่รู้ว่าจะกลับมาเมื่อไหร่', bg: DROP_META.hiatus.bg, fg: DROP_META.hiatus.fg },
    ]
  );
  if(!val) return;
  item.dropped = val;
  logActivity(`ดรอปเรื่อง "${item.name||item.code}" (${DROP_META[val].label})`);
  renderRecurring(); renderStats();
  await persistRecurring();
  if(eps > 0){
    showToast(`ทำเครื่องหมาย ${DROP_META[val].label} แล้ว — ยังมีตอนค้าง ${eps} ตอน จะอยู่ในงานปกติจนเคลียร์หมด แล้วย้ายเข้าดรอปเอง`);
  } else {
    showToast('ดรอปเรื่องแล้ว: ' + DROP_META[val].label);
  }
}
