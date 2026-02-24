# GarajHub Mobile

## Ishga tushirish

1. `cd "c:\Users\i7\OneDrive\Desktop\React app\ilova"`
2. `npm install`
3. MongoDB ishga tushgan bo'lsin (`mongodb://127.0.0.1:27017`)
4. `cd server && npm install`
5. `npm run server` (yoki yangi terminalda `cd server && npm run start`)
6. boshqa terminalda `npm start`

## Production (Railway)

`web` va `api` bitta serverda ishlaydi:

1. Railway'da Mongo URI env qo'ying: `MONGODB_URI` (yoki `MONGO_URL`).
2. Start command: `npm run start:railway`
3. `Procfile` ham shu scriptga yo'naltirilgan.

Web build chiqarilganda frontend API'ni avtomatik `https://YOUR_DOMAIN/api` orqali uradi.

Muhim:
- Railway portni o'zi beradi (`PORT`, ko'pincha `8080`) va bu to'g'ri.
- Local developda server default `4100` portda ishlaydi.
- `4100` ni Railway'da majburlash shart emas; app `process.env.PORT` ni oladi.

## MongoDB ulanishi

Default API:

- Web production: avtomatik `window.location.origin + /api`
- Local: `http://localhost:4100/api`

Android emulator uchun default avtomatik `http://10.0.2.2:4100/api` ga o'tadi.

Agar telefon yoki boshqa host ishlatsangiz, ilovani quyidagicha ishga tushiring:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:4100/api npm start
```

## Android

1. Android emulator yoki telefon ochiq bo'lsin
2. `npm run android`

## iOS (macOS)

1. Xcode o'rnatilgan bo'lsin
2. `npm run ios`

## AI Mentor (ixtiyoriy)

To'liq AI javoblar uchun loyiha ildizida `.env` yarating:

```env
EXPO_PUBLIC_GROQ_API_KEY=your_groq_api_key
```

Kalit bo'lmasa ham ilova ichida offline qisqa tavsiyalar ishlaydi.
