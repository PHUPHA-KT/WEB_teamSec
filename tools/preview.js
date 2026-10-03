#!/usr/bin/env node
// พรีวิวในเครื่องโดยไม่แตะ Supabase:
// ถอด shim/หน้า login ออก ใส่ storage จำลอง (เก็บใน process นี้ — รีโหลดหน้าแล้วข้อมูลยังอยู่)
//
//   node tools/preview.js                         แล้วเปิด http://localhost:8010          (index.html)
//                                                  หรือ    http://localhost:8010/staging  (staging/index.html)
//   PREVIEW_DATA=<ไฟล์ backup จากปุ่มส่งออก.json> node tools/preview.js   ใช้ข้อมูลจากไฟล์นั้น
//   node tools/preview.js --data <ไฟล์.json>       เหมือนกัน
//   (ไม่ใส่ = ใช้ seed-backup.json แบบเดิม)
//
// ใช้ดู UI / ทดสอบ logic เท่านั้น — ปิด process แล้วข้อมูลหาย ไม่ถูกบันทึกที่ไหน

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8010;

// ---- storage จำลองฝั่ง server ----
const KV = Object.create(null);   // 'g:<key>' / 'u:<key>' -> string
const VER = Object.create(null);  // key -> เลขเวอร์ชัน (เพิ่มทุกครั้งที่เขียน)
const argi = process.argv.indexOf('--data');
const DATA = argi > 0 ? process.argv[argi + 1] : process.env.PREVIEW_DATA;
if (DATA) {
  const f = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const d = f.data || f;
  const appdata = JSON.stringify({
    recurring_stories: d.recurring_stories || [], new_stories: d.new_stories || [],
    expenses: d.expenses || [], schedule_entries: d.schedule_entries || [],
    trash: d.trash || [], day_links: d.day_links || [], day_links_archive: d.day_links_archive || [],
    activity: d.activity || [],
  });
  for (const pre of ['', 'stg_']) {           // ใส่ทั้งเว็บหลักและเว็บทดลอง
    KV['g:' + pre + 'appdata'] = appdata;
    if (f.resetWeek) KV['g:' + pre + 'last_reset_week'] = f.resetWeek;
  }
  console.log('ข้อมูลจาก ' + path.basename(DATA) + ': งานประจำ ' + (d.recurring_stories || []).length + ' เรื่อง');
}

function build(file) {
  let s = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  const start = s.indexOf('<!-- ============================================================\n     Supabase storage shim');
  const endMark = '\n})();\n</script>';
  const end = s.indexOf(endMark, start);
  if (start < 0 || end < 0) throw new Error('ไม่เจอ shim ใน ' + file);

  const stub = `<script>
(function(){
  const q = k => '/__kv?k=' + encodeURIComponent(k);
  const ver = {};   // เวอร์ชันล่าสุดที่หน้านี้เห็นของแต่ละ key (จำลอง updated_at ของ Supabase)
  async function rawSet(key, v){ const r = await fetch(q(key), { method:'PUT', body:String(v) }); ver[key] = r.headers.get('X-Ver'); return true; }
  window.storage = {
    async get(k, sh){ const key = (sh?'g:':'u:')+k; const r = await fetch(q(key)); if(r.status === 404){ delete ver[key]; return null; } ver[key] = r.headers.get('X-Ver'); return { value: await r.text() }; },
    async set(k, v, sh){ return rawSet((sh?'g:':'u:')+k, v); },
    async setIfUnchanged(k, v, sh){
      const key = (sh?'g:':'u:')+k;
      if(!(key in ver)) return rawSet(key, v);   // ไม่เรียก this.set — เว็บทดลองครอบ set ไว้ (เติม stg_ ซ้ำ)
      const r = await fetch(q(key), { method:'PUT', body:String(v), headers:{ 'If-Ver': ver[key] } });
      if(r.status === 409) return false;
      ver[key] = r.headers.get('X-Ver');
      return true;
    },
    subscribe(){ return { status:'preview', eventsSeen:0, lastEventAt:0, alive(){ return false; } }; },
    realtimeInfo(){ return 'preview mode — ไม่มี realtime'; },
    currentUser(){ return { id:'preview', email:'preview@local', name: window.__previewName || 'เหนือ' }; }   // จำลองคนล็อกอิน
  };
})();
</script>`;
  s = s.slice(0, start) + stub + s.slice(end + endMark.length);

  if (!DATA) {
    const seedPath = path.join(ROOT, 'seed-backup.json');
    const seed = fs.existsSync(seedPath) ? JSON.parse(fs.readFileSync(seedPath, 'utf8')) : null;
    if (seed) {
      for (const [k, v] of Object.entries(seed)) {
        const re = new RegExp('^const ' + k + ' = .*$', 'm');
        if (re.test(s)) s = s.replace(re, 'const ' + k + ' = ' + JSON.stringify(v) + ';');
      }
    }
  }
  return s;
}

http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__kv') {
      const k = url.searchParams.get('k');
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          // If-Ver = เขียนเฉพาะเมื่อเวอร์ชันยังตรง (จำลอง update ... where updated_at = ?)
          const want = req.headers['if-ver'];
          if (want !== undefined && String(VER[k] || 0) !== want) { res.writeHead(409); res.end(); return; }
          KV[k] = body; VER[k] = (VER[k] || 0) + 1;
          res.writeHead(204, { 'X-Ver': String(VER[k]) }); res.end();
        });
        return;
      }
      if (!(k in KV)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Ver': String(VER[k] || 0) });
      res.end(KV[k]);
      return;
    }
    const file = url.pathname.replace(/\/+$/, '') === '/staging' ? 'staging/index.html' : 'index.html';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(build(file));   // สร้างใหม่ทุกครั้งที่โหลด — rebuild แล้วกด refresh ได้เลย
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e.message));
  }
}).listen(PORT, () => console.log('preview: http://localhost:' + PORT + '  และ /staging  (Ctrl+C เพื่อปิด)'));
