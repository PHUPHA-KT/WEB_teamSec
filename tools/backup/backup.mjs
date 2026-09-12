// ดึงข้อมูลทีมจาก Supabase มาเก็บเป็นไฟล์ — รันโดย GitHub Actions ทุกวัน
// ล็อกอินด้วยบัญชี backup ธรรมดา (ผ่าน RLS) อ่านอย่างเดียว ไม่แตะ service_role
//
// env ที่ต้องมี: SUPABASE_URL, SUPABASE_ANON_KEY, BACKUP_EMAIL, BACKUP_PASSWORD
// ผลลัพธ์:
//   backups/latest.json                  ข้อมูลดิบทุก key ใน scope global (อ่านง่าย diff ได้)
//   backups/latest-importable.json       รูปแบบเดียวกับปุ่ม "ส่งออก" ในแอป -> กู้คืนผ่านหน้าเว็บได้เลย
//   backups/history/YYYY/YYYY-MM-DD.json สำเนารายวัน

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error('missing env ' + k); process.exit(2); }
  return v;
};
const URL_ = need('SUPABASE_URL').replace(/\/+$/, '');
const ANON = need('SUPABASE_ANON_KEY');
const EMAIL = need('BACKUP_EMAIL');
const PASS = need('BACKUP_PASSWORD');

async function json(res, what) {
  const text = await res.text();
  if (!res.ok) throw new Error(what + ' failed: HTTP ' + res.status + ' ' + text.slice(0, 300));
  return JSON.parse(text);
}

// 1) ล็อกอิน -> access_token (นับเป็นการใช้งาน ทำให้ project ไม่ถูก pause)
const auth = await json(await fetch(URL_ + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
}), 'sign-in');
const token = auth.access_token;
if (!token) throw new Error('sign-in returned no access_token');

// 2) อ่านทุก key ใน scope global
const rows = await json(await fetch(URL_ + '/rest/v1/app_kv?scope=eq.global&select=key,value,updated_at&order=key', {
  headers: { apikey: ANON, Authorization: 'Bearer ' + token },
}), 'read app_kv');

if (!rows.length) throw new Error('no rows in scope global — refusing to write an empty backup');

// 3) แปลง value ที่เป็น JSON string ให้เป็น object เพื่อให้ไฟล์อ่านออก/diff ได้
const data = {};
for (const r of rows) {
  let v = r.value;
  try { v = JSON.parse(r.value); } catch { /* ค่าธรรมดา เก็บเป็น string */ }
  data[r.key] = { updated_at: r.updated_at, value: v };
}
const app = data.appdata && typeof data.appdata.value === 'object' ? data.appdata.value : null;
if (!app || !Array.isArray(app.recurring_stories)) throw new Error('appdata missing or malformed — refusing to write');

const now = new Date();
const stamp = now.toISOString().slice(0, 10);
const year = stamp.slice(0, 4);

mkdirSync('backups/history/' + year, { recursive: true });

const latest = JSON.stringify({ backed_up_at: now.toISOString(), scope: 'global', keys: data }, null, 1);
const importable = JSON.stringify({
  app: 'ระบบจัดการงานคัดเรื่อง',
  version: 3,
  exportedAt: now.toISOString(),
  source: 'github-actions-backup',
  data: {
    recurring_stories: app.recurring_stories || [],
    new_stories: app.new_stories || [],
    expenses: app.expenses || [],
    schedule_entries: app.schedule_entries || [],
    day_links: app.day_links || [],
    day_links_archive: app.day_links_archive || [],
  },
}, null, 1);

// เทียบกับรอบก่อน (ตัด timestamp ออก) เพื่อบอกใน commit ว่าเปลี่ยนจริงไหม
const prev = existsSync('backups/latest.json') ? readFileSync('backups/latest.json', 'utf8') : '';
const changed = prev.replace(/"backed_up_at": "[^"]+"/, '') !== latest.replace(/"backed_up_at": "[^"]+"/, '');

writeFileSync('backups/latest.json', latest);
writeFileSync('backups/latest-importable.json', importable);
writeFileSync('backups/history/' + year + '/' + stamp + '.json', latest);
// เขียนทุกครั้งแม้ข้อมูลไม่เปลี่ยน -> มี commit ทุกวัน -> GitHub ไม่ปิด schedule (กฎ 60 วันไม่มี activity)
writeFileSync('backups/last-run.txt', now.toISOString() + ' ' + (changed ? 'changed' : 'unchanged') + '\n');

const counts = {
  recurring: (app.recurring_stories || []).length,
  new_stories: (app.new_stories || []).length,
  expenses: (app.expenses || []).length,
  schedule: (app.schedule_entries || []).length,
  trash: (app.trash || []).length,
  activity: (app.activity || []).length,
};
console.log((changed ? 'changed' : 'unchanged') + ' ' + stamp + ' ' + JSON.stringify(counts));
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, 'changed=' + changed + '\nsummary=' + JSON.stringify(counts) + '\n', { flag: 'a' });
}
