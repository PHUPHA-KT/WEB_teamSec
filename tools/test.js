#!/usr/bin/env node
// ทดสอบส่วนที่เคยพังเงียบๆ (merge / รีเซ็ตรายสัปดาห์ / poll) — ไม่ต้องติดตั้งอะไร
//
//   node tools/test.js                 ทดสอบ staging/index.html (ถ้ามี) และ index.html
//   node tools/test.js <ไฟล์ export>   + เช็คว่า rebuild ได้ไฟล์ตรงกับที่ commit ไว้
//
// ดึงฟังก์ชันออกจาก <script> ของหน้าเว็บมารันใน vm (ไม่ต้องมีเบราว์เซอร์)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let failed = 0, passed = 0;
function ok(cond, name){ if(cond){ passed++; } else { failed++; console.log('  ✗ ' + name); } }
function eq(a, b, name){ ok(JSON.stringify(a) === JSON.stringify(b), name + '  (ได้ ' + JSON.stringify(a) + ' ต้องเป็น ' + JSON.stringify(b) + ')'); }

// ---- ดึงฟังก์ชันตามชื่อ (นับวงเล็บปีกกา ข้ามสตริง/คอมเมนต์) ----
function extract(src, name){
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if(!m) return null;
  let i = src.indexOf('{', m.index), depth = 0;
  for(; i < src.length; i++){
    const c = src[i];
    if(c === '/' && src[i+1] === '/'){ i = src.indexOf('\n', i); continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){
      for(i++; i < src.length && src[i] !== c; i++){
        if(src[i] === '\\') i++;
        else if(c === '`' && src[i] === '$' && src[i+1] === '{'){   // ${ ... } ข้ามแบบนับปีกกา
          let d = 0;
          for(i++; i < src.length; i++){ if(src[i] === '{') d++; else if(src[i] === '}' && --d === 0) break; }
        }
      }
      continue;
    }
    if(c === '{') depth++;
    else if(c === '}' && --depth === 0) return src.slice(m.index, i + 1);
  }
  return null;
}
function constLine(src, name){ const m = new RegExp('^const ' + name + ' = .*$', 'm').exec(src); return m ? m[0] : ''; }

function load(file){
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
  const fns = ['mergeById','mergeField','isPlainObj','mergeItemFields','itemDays','isMultiDay','normalizeDays',
    'epKey','sortEpisodes','parseEpisodeInput','weekEpCount','weekEpTotal','codeSerial','sourceInfo','pruneTrash','resetNonPendingToPending','dayStatus','setDayStatus'];
  const code = [constLine(html,'DAY_ORDER'), constLine(html,'WEEKDAY_ONLY'), constLine(html,'TRASH_MAX'), constLine(html,'TRASH_KEEP_DAYS')]
    .concat(fns.map(n => extract(html, n) || '')).join('\n');
  const SOURCE = /const SOURCE_ABBR = \{[\s\S]*?\n\};/.exec(html);
  const ctx = { trash: [], esc: s => s, URL };
  vm.createContext(ctx);
  vm.runInContext((SOURCE ? SOURCE[0].replace('const ', 'var ') : '') + '\n' + code + '\nthis.__fns = {' + fns.filter(n => extract(html, n)).join(',') + '};', ctx);
  return { html, ctx, F: ctx.__fns };
}

function suite(file, staging){
  if(!fs.existsSync(path.join(ROOT, file))) return;
  console.log('— ' + file);
  const { html, ctx, F } = load(file);

  // mergeById: เพิ่ม/แก้/ลบ จาก 2 ฝั่ง
  const A = {id:'a', v:1}, B = {id:'b', v:1};
  eq(F.mergeById([A],[A,B],[A]).map(x=>x.id), ['a','b'], 'merge: เราเพิ่ม');
  eq(F.mergeById([A,B],[A],[A,B]).map(x=>x.id), ['a'], 'merge: เราลบ');
  eq(F.mergeById([A],[A],[A,{...B}]).map(x=>x.id), ['a','b'], 'merge: เขาเพิ่ม');
  eq(F.mergeById([A],[{id:'a',v:2}],[A])[0].v, 2, 'merge: เราแก้');
  eq(F.mergeById([A],[A],[{id:'a',v:3}])[0].v, 3, 'merge: เขาแก้');
  // ถังขยะ: ไม่มี id ใช้ trashId (บั๊ก 3 ต.ค.)
  const t1 = {trashId:'t1'}, t2 = {trashId:'t2'}, t3 = {trashId:'t3'};
  eq(F.mergeById([t1],[t1,t2],[t1,t3]).map(x=>x.trashId), ['t1','t2','t3'], 'merge: ถังขยะไม่ยุบเหลือชิ้นเดียว');
  // ทีละช่อง
  if(F.mergeField){
    const base = {id:'x', status:'pending', pendingEpisodes:[3,4]};
    const m = F.mergeById([base],[{...base,status:'done'}],[{...base,pendingEpisodes:[3,4,5]}])[0];
    eq([m.status, m.pendingEpisodes], ['done',[3,4,5]], 'merge: คนละช่องได้ทั้งคู่');
    eq(F.mergeField([3,4],[4],[3,4,5]), [4,5], 'mergeField: ลบ+เพิ่มตอน');
  }
  // ตอน
  eq(F.parseEpisodeInput('12, 9.5, พิเศษ\n3 4, 0'), [12, 9.5, 'พิเศษ', 3, 4], 'parseEpisodeInput');
  // หลายวัน + ตอน/สัปดาห์
  if(F.weekEpCount){
    eq([F.weekEpCount({day:'จันทร์'}), F.weekEpCount({day:'ไม่ระบุวัน'}), F.weekEpCount({day:'จบแล้ว'}), F.weekEpCount({days:['จันทร์','พุธ','ศุกร์']})], [1,1,0,3], 'weekEpCount');
  }
  // รีเซ็ตรายสัปดาห์: ทำแล้ว/งด/เลื่อน -> ยังไม่ทำ, ค้างไม่แตะ
  const items = [{status:'done'},{status:'skipped'},{status:'pending', pendingSinceDate:'2026-09-01'},{days:['จันทร์','อังคาร'], statusByDay:{'จันทร์':'done'}, status:'pending'}];
  F.resetNonPendingToPending(items);
  eq(items.map(x=>x.status), ['pending','pending','pending','pending'], 'reset: สถานะ');
  eq(items[2].pendingSinceDate, '2026-09-01', 'reset: ไม่แตะเรื่องค้าง');
  eq(items[3].statusByDay, {}, 'reset: หลายวันล้างทุกวัน');
  // รหัส
  if(F.codeSerial) eq(['7-18-51-x','18-27','5-11-1','งาน 46 ตอน'].map(F.codeSerial), [51,27,null,null], 'codeSerial');
  if(F.sourceInfo) eq([F.sourceInfo('https://www.lezhin.com/x').abbr, F.sourceInfo('https://a.co.kr/').abbr, F.sourceInfo('bad')], ['LZ','a',null], 'sourceInfo');

  // ---- โครงสร้างที่ต้องไม่ถอยกลับ (เช็คจากโค้ด) ----
  const loadAll = extract(html, 'loadAll') || '';
  const pollOnce = extract(html, 'pollOnce') || '';
  if(staging){
    ok(loadAll.indexOf('snapshotAll()') > -1 && loadAll.indexOf('snapshotAll()') < loadAll.indexOf('resetNonPendingToPending('),
       'A1: loadAll ต้อง snapshot ก่อนรีเซ็ต (ไม่งั้นรีเซ็ตถูกย้อน)');
    ok(pollOnce.includes('maybeWeeklyReset()'), 'A6: pollOnce ต้องเช็ครีเซ็ตรายสัปดาห์');
    const afterAwait = pollOnce.slice(pollOnce.indexOf("storage.get('appdata'"));
    ok(/saveWaiter \|\| saveTimer \|\| saveInFlight/.test(afterAwait), 'A2: pollOnce ต้องเช็คงานรอเซฟอีกรอบหลังรอ remote');
    ok(afterAwait.includes('mergeById('), 'A2: pollOnce ต้อง merge กับงานในเครื่อง');
    ok(html.includes("const STAGING_KEY_PREFIX = 'stg_'"), 'เว็บทดลองต้องใช้ key stg_');
    const save = extract(html, 'persistDataNow') || '';
    ok(html.includes(".eq('updated_at', hit.updated_at)"), 'A3: shim ต้องเขียนแบบเช็ค updated_at');
    ok(save.includes('setIfUnchanged(') && /attempt < 3/.test(save), 'A3: เซฟต้องเช็คเวอร์ชันและวนอ่านใหม่เมื่อชน (มีทางออกหลัง 3 รอบ)');
  } else {
    ok(!html.includes('STAGING_KEY_PREFIX'), 'เว็บหลักต้องไม่มี key stg_');
  }
}

// ---- rebuild ตรงกับไฟล์ที่ commit ----
const SRC = process.argv[2];
if(SRC){
  for(const flag of [[], ['--staging']]){
    try{ execFileSync(process.execPath, [path.join(__dirname, 'rebuild.js'), SRC, '--check', ...flag], { stdio: 'pipe' }); passed++; }
    catch(e){ failed++; console.log('  ✗ rebuild ' + (flag[0] || '') + ' ไม่ตรงกับไฟล์ที่มีอยู่: ' + String(e.stderr || e.message).trim()); }
  }
}

suite('staging/index.html', true);
suite('index.html', false);
console.log((failed ? '✗ ' : '✓ ') + passed + ' ผ่าน' + (failed ? ', ' + failed + ' ไม่ผ่าน' : ''));
process.exit(failed ? 1 : 0);
