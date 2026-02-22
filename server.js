const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || process.env.DEFAULT_PORT || 3010;

const corsOptions = {
  origin: function (origin, callback) {
    const envOrigins = process.env.CORS_ORIGIN;
    if (envOrigins === '*') return callback(null, true);
    if (!origin) return callback(null, true);
    const allowed = envOrigins ? envOrigins.split(',').map(o => o.trim()).filter(Boolean) : [];
    if (allowed.length === 0) return callback(new Error('CORS_ORIGIN belirtilmemiş'));
    callback(null, allowed.includes(origin) ? origin : new Error('CORS izni yok'));
  },
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.BODY_SIZE_LIMIT || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.BODY_SIZE_LIMIT || '10mb' }));

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT) || 200;
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  const r = requestCounts.get(ip);
  if (now > r.resetTime) {
    r.count = 1;
    r.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  if (r.count >= RATE_LIMIT) {
    return res.status(429).json({ success: false, message: 'Çok fazla istek.' });
  }
  r.count++;
  next();
});

// Auth (login/register/verify) → eradil-kullanici'de; admin'de yok
// Admin üye yönetimi API'leri
app.use('/api/okullar', require('./routes/okullar'));
app.use('/api/siniflar', require('./routes/siniflar'));
app.use('/api/kullanicilar', require('./routes/kullanicilar'));
app.use('/api/kullanici-baglari', require('./routes/kullanici-baglari'));
app.use('/api/aktivasyon-kodlari', require('./routes/aktivasyon-kodlari'));
app.use('/api/listeler', require('./routes/listeler'));
app.use('/api/rozet-ayarlari', require('./routes/rozet-ayarlari'));
app.use('/api/cdn-medya', require('./routes/cdn-medya'));
app.use('/api/tema-ayarlari', require('./routes/tema-ayarlari'));
app.use('/api/upload', require('./routes/upload'));
// Etkinlik Sihirbazı (etkinlikler + sorular CRUD)
app.use('/api/etkinlikler', require('./routes/etkinlikler'));
// Ünite Sihirbazı (kitaplar + kitap soruları)
app.use('/api/mufredat/icerikleri', require('./routes/mufredat-icerikleri'));

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ERAX Admin API çalışıyor',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint bulunamadı' });
});

app.use((err, req, res, next) => {
  console.error('Sunucu hatası:', err);
  res.status(500).json({ success: false, message: 'Sunucu hatası oluştu' });
});

app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔐 ERAX ADMIN BACKEND – Üye yönetimi');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🚀 http://localhost:${PORT}`);
  console.log('   • /api/okullar');
  console.log('   • /api/siniflar');
  console.log('   • /api/kullanicilar');
  console.log('   • /api/kullanici-baglari');
  console.log('   • /api/aktivasyon-kodlari');
  console.log('   • /api/listeler');
  console.log('   • /api/auth (verify)');
  console.log('   • /api/rozet-ayarlari');
  console.log('   • /api/cdn-medya');
  console.log('   • /api/tema-ayarlari');
  console.log('   • /api/upload (medya kütüphanesi: library, file, folder, ses, gorsel, baloncuk)');
  console.log('   • /api/etkinlikler (Etkinlik Sihirbazı: etkinlik + soru CRUD)');
  console.log('   • /api/mufredat/icerikleri/kitaplar (Ünite Sihirbazı: kitap + soru CRUD)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});
