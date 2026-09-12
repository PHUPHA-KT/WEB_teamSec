# ระบบจัดการงานคัดเรื่อง — GitHub Pages + Supabase

Live: https://phupha-kt.github.io/WEB_teamSec/

| ไฟล์ | คืออะไร |
|---|---|
| `index.html` | ตัวที่ deploy — แอป + ชั้น Supabase (login, cache, realtime) + patch ของ repo นี้ |
| `supabase-setup.sql` | SQL สร้างตาราง + RLS + realtime (รันครั้งเดียวตอนตั้งค่า) |
| `tools/rebuild.js` | ประกอบ `index.html` ใหม่จากไฟล์ export ของแอป (ดู "อัปเดตแอป") |
| `tools/preview.js` | พรีวิวในเครื่องด้วยข้อมูลจำลอง ไม่แตะ Supabase |
| `ระบบจัดการงานคัดเรื่อง.html` | ไฟล์ export ล่าสุดจาก host เดิม — backup, ไม่ขึ้น git |
| `tools/backup/` | backup อัตโนมัติรายวันด้วย GitHub Actions (repo private แยก) — ดู `tools/backup/README.md` |
| `seed-backup.json` | ข้อมูลทีม ณ วันย้ายขึ้น Supabase — backup, ไม่ขึ้น git **อย่าลบ** |

---

## ตั้งค่าครั้งแรก

### 1. Supabase

1. สมัคร https://supabase.com → New project (Free)
2. **SQL Editor** → วางทั้งไฟล์ `supabase-setup.sql` → **Run** (มี `drop policy if exists` — Supabase จะเตือน กด Run ได้ ไม่มีคำสั่งลบข้อมูล)
3. **Authentication → Providers → Email** → ปิด **Enable email signups**
4. **Authentication → Users → Add user** ทีละคน — ติ๊ก **Auto Confirm User** ไม่งั้นล็อกอินไม่ได้
5. **Project Settings → API** → copy `Project URL` + `anon public` key

### 2. ใส่คีย์

ใน `index.html` หา 2 บรรทัดนี้ (อยู่ต้น shim):

```js
const SUPABASE_URL      = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

anon key เปิดเผยในหน้าเว็บได้ — RLS + login เป็นตัวกันจริง. **ห้ามใส่ `service_role` key**

### 3. GitHub Pages

push ขึ้น repo public → **Settings → Pages** → Source: `Deploy from a branch` → `main` / `/ (root)`

### 4. เช็ค

1. เปิด URL → หน้า login → ล็อกอิน → ข้อมูลขึ้น
2. แก้อะไรสักอย่าง → "บันทึกแล้ว" → refresh ยังอยู่
3. เปิด 2 เครื่อง แก้เครื่องนึง อีกเครื่องเด้ง "🔄 อัปเดตข้อมูลจากทีมแล้ว" ภายใน 1-2 วิ
4. ถ้าช้า 12 วิ = realtime ไม่ทำงาน — F12 → Console → `storage.realtimeInfo()` ดู `eventsSeen`

---

## อัปเดตแอป (เมื่อมีไฟล์ export ใหม่จาก host เดิม)

แอปยังพัฒนาต่อบน host เดิม (ไฟล์ที่ใช้ `window.storage`). **ห้าม**เอาไฟล์นั้นมาแทน `index.html` ตรงๆ —
มันไม่มี Supabase, มี SEED ข้อมูลจริงฝังอยู่ (ลิงก์ Drive 51 อัน), และไม่มี fix ของ repo นี้

```bash
node tools/rebuild.js "C:/Users/tanap/Downloads/ระบบจัดการงานคัดเรื่อง.html"
```

สคริปต์จะ:

1. ดึงชั้น Supabase (shim + คีย์ + login + realtime) จาก `index.html` ปัจจุบัน
2. ตัด SEED ออก
3. ใส่ patch ทั้งหมด (safeUrl, debounce, กันเขียนทับตอนเน็ตล่ม, มือถือ, 2 ทุ่ม, ตอน 9.5, backup รู้สัปดาห์ ฯลฯ)
4. **ข้าม**ขั้นที่ไฟล์ใหม่มีอยู่แล้ว (เช่นถ้าย้าย fix ไปใส่ฝั่ง host เอง)
5. **หยุดทันที**ถ้าโครงสร้างไฟล์เปลี่ยนจน anchor ไม่เจอ — ไม่เขียนครึ่งๆ กลางๆ บอกว่าขั้นไหน

ดูก่อน push:

```bash
node tools/preview.js
```

เปิด http://localhost:8010 — ใช้ข้อมูลจาก `seed-backup.json` ไม่ต้อง login ไม่แตะ Supabase. แก้ `index.html` แล้วกด refresh ได้เลย

พอใจแล้ว:

```bash
git add -A
git commit -m "Rebase on upstream export"
git push
```

แล้วก๊อปไฟล์ export มาทับ `ระบบจัดการงานคัดเรื่อง.html` เก็บเป็น backup

### แก้โค้ดเล็กน้อยเอง

แก้ `index.html` ตรงๆ แล้ว push ได้. **แต่**ครั้งหน้าที่รัน rebuild จากไฟล์ export ใหม่ การแก้นั้นจะหาย —
ถ้าอยากให้อยู่ถาวร เพิ่มเป็น `step(label, marker, fn)` ใน `tools/rebuild.js` (marker = ข้อความที่มีเฉพาะเมื่อ patch นั้นใส่แล้ว)

---

## หมายเหตุ

- **scope**: `global` = ข้อมูลทีม, `u:<uuid>` = ธีม/ชื่อเรา/ตัวกรอง ของแต่ละคน
- **ลบไม่ได้**: ไม่มี delete policy — ถังขยะในแอปใช้ได้ปกติ แต่แถวใน DB ลบไม่ได้ กันหายถาวร
- **กู้คืน backup**: สถานะ ทำแล้ว/ยังไม่ทำ/เลื่อน/งด กลับมาตามไฟล์เสมอ ไม่รีเซ็ตให้ (ถ้าไฟล์จากสัปดาห์อื่นจะบอกไว้ กด "รีเซ็ตสถานะ" เองได้)
- **วันเปลี่ยนตอน 2 ทุ่ม**: ก่อน 20:00 ยังนับเป็นเมื่อวาน — ตัวกรอง/เลยกำหนด/รีเซ็ตรายสัปดาห์ ใช้กติกาเดียวกัน (`DAY_ROLLOVER_HOUR`)
- **Free tier**: Supabase หยุด project ถ้าไม่มีคนใช้ 7 วัน — **หยุดเกิน 90 วัน = ลบถาวร**. ตั้ง backup รายวัน (`tools/backup/`) แล้วจะไม่หยุดอีก เพราะมีการล็อกอินทุกวัน
- **library**: `supabase-js` pin ที่ `@2.116.0` ไม่ใช่ `@2` — ไม่พังเองตอน library ออกเวอร์ชันใหม่. อัปเดตเมื่อพร้อม: แก้เลขใน `index.html` ทดสอบ login + เซฟ + realtime ก่อน push
- **ชื่อในประวัติแก้ไข**: มาจาก `user_metadata.name` ของบัญชี (ตั้งด้วย SQL ข้อ 7 ใน `supabase-setup.sql`) — ไม่ตั้ง = ใช้ชื่อจาก ⭐ หรือส่วนหน้าอีเมล. ตั้งเป็นชื่อในทีมเป๊ะ (เหนือ/บิ๊ก/ยูตะ/น๊อต) แล้ว ⭐ งานของฉัน จะตั้งให้เองตอนล็อกอิน
- **debug realtime**: Console → `storage.realtimeInfo()`
