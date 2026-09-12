# Backup อัตโนมัติรายวัน → GitHub repo private

ทำ 2 อย่างพร้อมกัน:
- **สำเนาข้อมูลทีมทุกวัน** เก็บไว้นอก Supabase ย้อนดูได้ทุกวันผ่าน git history
- **กัน Supabase หยุด** — การล็อกอินทุกวันนับเป็นการใช้งาน project ไม่ pause แม้ทีมหยุดยาว (และไม่โดนลบตอน 90 วัน)

ใช้บัญชี Supabase ธรรมดาผ่าน RLS — **ไม่ใช้ service_role** สคริปต์อ่านอย่างเดียว

---

## ตั้งค่า (ครั้งเดียว ~10 นาที)

### 1. สร้างบัญชี backup ใน Supabase

Authentication → Users → **Add user**
- อีเมล: `backup@` อะไรก็ได้ที่ไม่ซ้ำ (เช่น `backup@team.local`)
- รหัสผ่าน: ยาวๆ สุ่ม (ไม่ต้องจำ จะไปใส่ใน GitHub secret)
- ติ๊ก **Auto Confirm User**

### 2. สร้าง repo private

GitHub → New repository → ชื่อ `WEB_teamSec-backup` → **Private** → Create

### 3. ใส่ไฟล์ 2 ตัว

| จากที่นี่ | ไปที่ (ใน repo backup) |
|---|---|
| `tools/backup/backup.mjs` | `backup.mjs` (root) |
| `tools/backup/backup.yml` | `.github/workflows/backup.yml` |

```bash
git clone https://github.com/<user>/WEB_teamSec-backup.git
cd WEB_teamSec-backup
mkdir -p .github/workflows
cp "../เว็บทีมรอง/tools/backup/backup.mjs" .
cp "../เว็บทีมรอง/tools/backup/backup.yml" .github/workflows/
git add -A && git commit -m "Add daily Supabase backup workflow" && git push
```

### 4. ใส่ค่าใน repo backup

Settings → **Secrets and variables → Actions**

แท็บ **Variables** (ไม่ลับ):
| ชื่อ | ค่า |
|---|---|
| `SUPABASE_URL` | `https://xlmjtnfoacqhypieeitc.supabase.co` |
| `SUPABASE_ANON_KEY` | anon key ตัวเดียวกับใน index.html |

แท็บ **Secrets** (ลับ):
| ชื่อ | ค่า |
|---|---|
| `BACKUP_EMAIL` | อีเมลบัญชี backup จากข้อ 1 |
| `BACKUP_PASSWORD` | รหัสผ่านบัญชี backup |

### 5. ลองรัน

Actions → **backup** → **Run workflow** → รอ ~30 วิ → เขียว ✅

ดูใน repo ต้องมี:
```
backups/
  latest.json              ข้อมูลดิบ อ่าน/diff ได้
  latest-importable.json   กู้คืนผ่านหน้าเว็บได้เลย
  last-run.txt
  history/2026/2026-09-12.json
```

ถ้าแดง ❌ กดเข้าไปดู log — ส่วนใหญ่คือ secret สะกดผิด หรือลืม Auto Confirm

---

## ตารางเวลา

ทุกวัน **03:00 เวลาไทย** (`0 20 * * *` UTC) — commit ทุกวันแม้ข้อมูลไม่เปลี่ยน (ไฟล์ `last-run.txt`)
เพื่อให้ GitHub ไม่ปิด schedule เอง (กฎ: repo ไม่มี activity 60 วัน = ปิด) — commit message บอกว่า `[changed]` หรือ `[unchanged]`

## กู้คืน

1. เปิด repo backup → `backups/latest-importable.json` → Download (หรือเลือกวันจาก `history/`)
2. เปิดเว็บ → 💾 สำรองข้อมูล → **นำเข้า** → เลือกไฟล์

หรือย้อนวันเก่ากว่านั้น: `git log -- backups/latest.json` แล้ว `git show <commit>:backups/latest-importable.json > restore.json`

## ความปลอดภัย

- สคริปต์**ไม่มี**คำสั่งเขียนไป Supabase เลย — ต่อให้ secret หลุด ทำได้แค่อ่าน (และ RLS ก็ไม่ให้ลบอยู่แล้ว)
- ปฏิเสธเขียนไฟล์ถ้า DB ว่างหรือ appdata พัง — ไม่มีทาง backup เปล่าทับ backup ดี
- repo ต้อง **private** — ข้างในคือข้อมูลจริงของทีม
