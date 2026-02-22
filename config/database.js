const { Pool } = require('pg');
require('dotenv').config();

// erax-admin: Üye yönetimi için KULLANICI_DB ve ORGANIZASYON_DB

const createPoolFromUrl = (connectionString, dbName) => {
  if (!connectionString) {
    console.error(`❌ ${dbName} için connection string bulunamadı!`);
    return null;
  }
  return new Pool({
    connectionString,
    max: parseInt(process.env.DB_CONNECTION_LIMIT || 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || 30000),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || 60000),
    ssl: { rejectUnauthorized: false }
  });
};

const kullaniciPool = createPoolFromUrl(process.env.KULLANICI_DB_URL, 'KULLANICI_DB');
const organizasyonPool = createPoolFromUrl(process.env.ORGANIZASYON_DB_URL, 'ORGANIZASYON_DB');
// Medya/etkinlik dosya taşıma sonrası referans güncellemesi (soru_secenekleri, etkinlik_sorulari)
const icerikPool = createPoolFromUrl(process.env.ICERIK_DB_URL, 'ICERIK_DB');
// Etkinlik silme: öğrenci cevap kayıtları (soru_cevaplari, ogrenci_etkinlik_cevaplari)
const seviyePool = createPoolFromUrl(process.env.SEVIYE_DB_URL, 'SEVIYE_DB');
// Ünite Sihirbazı: kitaplar, kitap_sorulari (DIGIBUCH / müfredat içerik DB)
const digibuchPool = createPoolFromUrl(process.env.DIGIBUCH_DB_URL, 'DIGIBUCH_DB');

const testConnection = async (pool, dbName) => {
  if (!pool) return;
  try {
    const client = await pool.connect();
    console.log(`✅ ${dbName} veritabanına başarıyla bağlandı`);
    client.release();
  } catch (err) {
    console.error(`❌ ${dbName} bağlantı hatası:`, err.message);
  }
};

if (kullaniciPool && organizasyonPool) {
  Promise.all([
    testConnection(kullaniciPool, 'KULLANICI_DB'),
    testConnection(organizasyonPool, 'ORGANIZASYON_DB'),
    icerikPool ? testConnection(icerikPool, 'ICERIK_DB') : Promise.resolve(),
    seviyePool ? testConnection(seviyePool, 'SEVIYE_DB') : Promise.resolve(),
    digibuchPool ? testConnection(digibuchPool, 'DIGIBUCH_DB') : Promise.resolve()
  ]).catch(err => console.error('DB test hatası:', err));
} else {
  console.error('❌ KULLANICI_DB_URL veya ORGANIZASYON_DB_URL eksik!');
}

module.exports = {
  kullaniciPool,
  organizasyonPool,
  icerikPool,
  seviyePool,
  digibuchPool,
  get pool() { return kullaniciPool; }
};
