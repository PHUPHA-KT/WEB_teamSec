# Deploy: GitHub Pages + Supabase

ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | คืออะไร |
|---|---|
| `index.html` | ตัวที่ deploy — ของเดิม + shim ต่อ Supabase + หน้า login (ต่อไปแก้ไฟล์นี้) |
| `ระบบจัดการงานคัดเรื่อง.html` | ต้นฉบับเดิม เก็บไว้เป็น backup ไม่ต้อง deploy |
| `supabase-setup.sql` | SQL สร้างตาราง + RLS |

---

## 1. Supabase

1. สมัคร https://supabase.com → New project (Free) → จด Database password ไว้
2. **SQL Editor** → New query → วางทั้งไฟล์ `supabase-setup.sql` → **Run**
3. **Authentication → Providers → Email** → ปิด **Enable email signups**
   (กันคนนอกสมัครเอง — เปิดบัญชีให้ทีมเองทีละคน)
4. **Authentication → Users → Add user** × 4 (เหนือ / บิ๊ก / ยูตะ / น๊อต)
   - ใส่อีเมล + รหัสผ่าน
   - ติ๊ก **Auto Confirm User** ทุกคน ไม่งั้นล็อกอินไม่ได้
5. **Project Settings → API** → copy 2 ค่า
   - `Project URL`
   - `anon` `public` key

## 2. ใส่คีย์ลง index.html

เปิด `index.html` หาบรรทัด 599 แก้ 2 บรรทัดนี้

```js
const SUPABASE_URL      = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

anon key เปิดเผยในหน้าเว็บได้ตามปกติ — RLS + login เป็นตัวกันจริง

## 3. GitHub Pages

```bash
git init
git add .
git commit -m "Deploy story management app on GitHub Pages with Supabase backend"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `/ (root)` → Save

รอ ~1 นาที ได้ URL `https://<user>.github.io/<repo>/`

> repo เป็น **public** ได้ (Pages ฟรีต้อง public ถ้าไม่ใช่ Pro) — โค้ดเปิด แต่ข้อมูลอยู่ Supabase หลัง login

## 4. เช็คว่าใช้ได้

1. เปิด URL → เจอหน้า login
2. ล็อกอิน → ข้อมูลขึ้น → แก้อะไรสักอย่าง → เด้ง "บันทึกแล้ว"
3. Supabase → Table Editor → `app_kv` → เจอแถว `global` / `appdata`
4. refresh → ข้อมูลยังอยู่
5. เปิดอีกเครื่อง ล็อกอินคนละบัญชี → เห็นข้อมูลชุดเดียวกัน (sync ทุก 12 วิ)

---

## หมายเหตุ

- **ข้อมูลตั้งต้น**: ครั้งแรกที่ล็อกอิน แอปจะ seed ข้อมูลที่ hardcode ในไฟล์ขึ้น Supabase ให้เอง
- **scope**: `global` = ข้อมูลทีมใช้ร่วมกัน, `u:<uuid>` = ธีม/ชื่อเรา/ตัวกรองวันนี้ ของแต่ละคน
- **ลบไม่ได้**: SQL ไม่ให้ delete policy — ถังขยะในแอปยังใช้ได้ปกติ (มันเก็บใน appdata) แต่แถวใน DB ลบไม่ได้ กันข้อมูลหายถาวร
- **Free tier**: Supabase 500MB + หยุด project ถ้าไม่มีคนใช้ 7 วัน (กด restore ได้ในแดชบอร์ด)
- **แก้โค้ดแอปทีหลัง**: แก้ที่ `index.html` แล้ว `git push` — Pages อัปเดตเอง
