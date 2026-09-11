#!/usr/bin/env node
// พรีวิว index.html ในเครื่องโดยไม่แตะ Supabase:
// ถอด shim/หน้า login ออก ใส่ storage จำลองในหน่วยความจำ + ข้อมูลจาก seed-backup.json
//
//   node tools/preview.js        แล้วเปิด http://localhost:8010
//
// ใช้ดู UI / ทดสอบ logic เท่านั้น — การแก้ในหน้านี้ไม่ถูกบันทึกที่ไหน

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8010;

function build() {
  let s = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const seedPath = path.join(ROOT, 'seed-backup.json');
  const seed = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, 'utf8')) : null;

  const start = s.indexOf('<!-- ============================================================\n     Supabase storage shim');
  const endMark = '\n})();\n</script>';
  const end = s.indexOf(endMark, start);
  if (start < 0 || end < 0) throw new Error('ไม่เจอ shim ใน index.html');

  const stub = `<script>
(function(){
  const M = {};
  window.storage = {
    async get(k, sh){ const v = M[(sh?'g:':'u:')+k]; return v===undefined ? null : {value:v}; },
    async set(k, v, sh){ M[(sh?'g:':'u:')+k] = String(v); return true; },
    subscribe(){ return { status:'preview', eventsSeen:0, lastEventAt:0, alive(){ return false; } }; },
    realtimeInfo(){ return 'preview mode — ไม่มี realtime'; }
  };
})();
</script>`;
  s = s.slice(0, start) + stub + s.slice(end + endMark.length);

  if (seed) {
    for (const [k, v] of Object.entries(seed)) {
      const re = new RegExp('^const ' + k + ' = .*$', 'm');
      if (re.test(s)) s = s.replace(re, 'const ' + k + ' = ' + JSON.stringify(v) + ';');
    }
  } else {
    console.warn('ไม่มี seed-backup.json — พรีวิวจะว่างเปล่า');
  }
  return s;
}

http.createServer((req, res) => {
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(build());   // สร้างใหม่ทุกครั้งที่โหลด — แก้ index.html แล้วกด refresh ได้เลย
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e.message));
  }
}).listen(PORT, () => console.log('preview: http://localhost:' + PORT + '  (Ctrl+C เพื่อปิด)'));
