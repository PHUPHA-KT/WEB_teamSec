function safeUrl(u){
  const s = String(u==null?'':u).trim();
  if(!s) return '#';
  const lower = s.toLowerCase();
  if(lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) return esc(s);
  // ไม่มี scheme แต่หน้าตาเป็นโดเมน (drive.google.com/...) -> เติม https:// ให้
  if(/^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}([/?#]|$)/.test(s)) return esc('https://' + s);
  return '#';   // javascript:, data:, อย่างอื่น -> ตัดทิ้ง
}
