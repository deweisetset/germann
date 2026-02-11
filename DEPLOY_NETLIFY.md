# Deploy Wortle Game ke Netlify

## Prasyarat
- Akun Netlify (https://netlify.com)
- Project sudah di GitHub atau repository online

## Step-by-Step Deploy

### 1. Push Project ke GitHub
```bash
git init
git add .
git commit -m "Setup Netlify deployment"
git remote add origin https://github.com/username/repo-name.git
git branch -M main
git push -u origin main
```

### 2. Connect GitHub ke Netlify
1. Buka https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Pilih "GitHub" dan authorize
4. Pilih repository `germann`
5. Click "Deploy site"

### 3. Setup Environment Variables di Netlify
**Di Netlify Dashboard:**
1. Pilih site Anda
2. Settings → Build & deploy → Environment
3. Click "Edit variables"
4. Tambahkan:
   ```
   DB_HOST = your-database-host
   DB_USER = your-database-user
   DB_PASS = your-database-password
   DB_NAME = wortle
   CORS_ORIGIN = https://polite-mochi-6af2e8.netlify.app
   OPENAI_API_KEY = sk-your-openai-api-key
   ```
5. Click "Save"

### 4. Redeploy
- Setelah variables disimpan, Netlify otomatis redeploy
- Tunggu sampai build selesai (hijau = success ✅)
- Akses site dari URL yang diberikan

---

## Struktur Folder Netlify

```
germann/
├── netlify/
│   └── functions/
│       ├── auth-google.js         ← Google authentication
│       └── openai-example.js      ← OpenAI sentence generator
├── netlify.toml                   ← Config file
├── package.json                   ← Dependencies
├── scripts/
│   ├── login.js                   ← Updated endpoint
│   ├── wortle-game.js             ← Updated OpenAI endpoint
│   └── ...
├── wortle.html
└── ...
```

---

## Local Development dengan Netlify CLI

### Install Netlify CLI
```bash
npm install -g netlify-cli
# atau
npm install netlify-cli --save-dev
```

### Run Locally
```bash
netlify dev
```
- Akan running di `http://localhost:8888`
- Functions otomatis mock di `/.netlify/functions/`
- Hot reload supported

---

## Database Connection

### ⚠️ PENTING: Database Access dari Internet
Pastikan database Anda:
1. **Accessible dari internet** (bukan localhost XAMPP!)
2. **IP whitelist diset** atau allow all (kurang secure)

### Recommended: Managed Database Services
- **PlanetScale** (MySQL) - https://planetscale.com
- **AWS RDS** (MySQL/PostgreSQL)
- **Supabase** (PostgreSQL + Auth)
- **Railway** (All-in-one)

---

## Troubleshooting

### Error: "Cannot find module 'mysql2'" atau 'node-fetch'
**Solusi:** Dependencies sudah di `package.json`, tapi cek:
```bash
npm install
git add .
git commit -m "Install dependencies"
git push
```
Netlify akan install otomatis saat build.

### Error: "OpenAI API key not set"
**Solusi:**
1. Pastikan `OPENAI_API_KEY` sudah di Netlify Environment Variables
2. Redeploy setelah menambahkan variable
3. Check Netlify logs untuk memastikan variable terbaca

### Error: Database connection failed
**Check:**
1. Environment variables sudah set di Netlify dashboard
2. Database host accessible dari internet
3. Username & password benar
4. Database user punya permission untuk koneksi

### Error: "Unexpected token '<', "<!DOCTYPE""
**Penyebab:** Function endpoint salah
**Solusi:** 
- Pastikan endpoint di `login.js` adalah `/.netlify/functions/auth-google`
- Pastikan endpoint di `wortle-game.js` adalah `/.netlify/functions/openai-example`
- Bukan path lain

### CORS Error
**Solusi:** 
1. Pastikan `netlify.toml` punya CORS headers
2. Set `CORS_ORIGIN` environment variable ke domain Netlify Anda
3. Atau gunakan `*` untuk test (ubah di production)

---

## Production Checklist

- [ ] Database sudah setup (bukan XAMPP localhost)
- [ ] Environment variables sudah set di Netlify (DB_HOST, DB_USER, DB_PASS, OPENAI_API_KEY)
- [ ] Redeploy setelah variables diubah
- [ ] Test login functionality
- [ ] Test OpenAI example sentence generation
- [ ] CORS headers benar
- [ ] Google OAuth credentials valid
- [ ] OpenAI API key valid & has billing
- [ ] Database backup setup
- [ ] Monitor function logs di Netlify dashboard

---

## Useful Commands

```bash
# Local development
netlify dev

# Connect existing site
netlify link

# Deploy specific branch
netlify deploy --prod

# Check function logs
netlify functions:invoke auth-google

# View environment variables
netlify env:list
```

---

**Perlu bantuan? Tanyakan di terminal Netlify:**
```bash
netlify --help
```
