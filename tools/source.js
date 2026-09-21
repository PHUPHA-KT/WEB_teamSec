// ===== ป้ายเว็บต้นทาง (ย่อจากโดเมนของ item.link) =====
// เพิ่ม/แก้ตัวย่อที่นี่ที่เดียว — โดเมนที่ไม่อยู่ในตาราง ใช้ชื่อโดเมนส่วนแรก (vortexscans)
const SOURCE_ABBR = {
  'lezhin.com':          { abbr:'LZ',   bg:'#fdecec', fg:'#c0392b' },
  'ridibooks.com':       { abbr:'RIDI', bg:'#e6f0fb', fg:'#1f5fbf' },
  'page.kakao.com':      { abbr:'KKO',  bg:'#fff6d6', fg:'#9a6d00' },
  'toptoon.com':         { abbr:'TT',   bg:'#e8f7f1', fg:'#1a7f57' },
  'mrblue.com':          { abbr:'MRB',  bg:'#eaf2ff', fg:'#2b4c8c' },
  'mangadex.org':        { abbr:'MD',   bg:'#fdeee6', fg:'#b3541e' },
  'en-thunderscans.com': { abbr:'THS',  bg:'#f1ecfa', fg:'#6a3fb3' },
  'vortexscans.org':     { abbr:'VTX',  bg:'#f1ecfa', fg:'#6a3fb3' },
};
function sourceInfo(url){
  let host;
  try{ host = new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase(); }catch(e){ return null; }
  const known = SOURCE_ABBR[host];
  if(known) return { host, ...known };
  // ไม่รู้จัก: เอาส่วนแรกของโดเมน (ตัด TLD) ยาวสุด 8 ตัว
  const parts = host.split('.');
  parts.pop();                                                        // ตัด TLD (.com .org .kr)
  if(parts.length > 1 && /^(co|com|net|org|ac|go|or|ne)$/.test(parts[parts.length-1])) parts.pop(); // .co.kr .com.tw
  const base = parts[parts.length-1] || host;
  return { host, abbr: base.slice(0, 8), bg:'var(--gray-bg)', fg:'var(--ink-soft)' };
}
function sourceBadgeHtml(item){
  const s = sourceInfo(item.link);
  if(!s) return '';
  return `<span class="src-badge" style="background:${s.bg};color:${s.fg};" title="${esc(s.host)}">${esc(s.abbr)}</span>`;
}
