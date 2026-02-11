# Deploy Wortle Game ke Vercel

## Prasyarat
- Akun Vercel (https://vercel.com)
- Project sudah di GitHub

## Step-by-Step Deploy

### 1. Push Project ke GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/repo-name.git
git branch -M main
git push -u origin main
```

### 2. Setup Environment Variables
**Buka https://vercel.com dan:**
1. Click "New Project"
2. Pilih repository yang sudah di-push
3. Di "Environment Variables" section, tambahkan:
   - `DB_HOST` = host database Anda (e.g., database.example.com)
   - `DB_USER` = username database
   - `DB_PASS` = password database
   - `DB_NAME` = wortle
   - `CORS_ORIGIN` = https://your-domain.vercel.app

### 3. Deploy
1. Click "Deploy" button
2. Vercel otomatis build & deploy
3. Dapatkan URL deployment (e.g., https://wortle.vercel.app)

### 4. Update Frontend URL (Opsional)
Jika ingin hardcode domain, update di `scripts/login.js`:
```javascript
const authEndpoint = 'https://your-domain.vercel.app/api/auth-google';
```

## Troubleshooting

### Error: "Cannot find module 'mysql2'"
**Solusi:** Tambahkan `package.json` di root:
```json
{
  "name": "wortle",
  "version": "1.0.0",
  "dependencies": {
    "node-fetch": "^2.6.11",
    "mysql2": "^3.0.0"
  }
}
```

### Error: Database Connection Failed
**Pastikan:**
- Database host accessible dari internet (IP whitelist)
- Credentials benar di Environment Variables
- Database user punya permission untuk access

### Error: CORS Issue
**Pastikan:**
- `CORS_ORIGIN` sesuai dengan frontend URL
- atau gunakan `*` untuk allow semua (less secure)

## Untuk Local Development

### Jalankan Vercel CLI:
```bash
npm install -g vercel
vercel dev
```
Ini akan start development server di http://localhost:3000

## Koneksi Database

Untuk production, recommended gunakan managed database service:
- **AWS RDS** (MySQL)
- **Vercel PostgreSQL** 
- **PlanetScale** (MySQL as a Service)
- **Supabase** (PostgreSQL + Auth)

Ganti `DB_HOST` dengan managed service connection string di Environment Variables.
