const express = require('express');
const router = express.Router();
const { organizasyonPool: pool, kullaniciPool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/public/okul/:okul_id', async (req, res) => {
  try {
    const { okul_id } = req.params;
    const { rows: siniflar } = await pool.query(
      'SELECT id, sinif_seviyesi, kod FROM siniflar WHERE okul_id = $1 AND durum = $2 ORDER BY sinif_seviyesi ASC',
      [okul_id, 'aktif']
    );
    res.json({ success: true, data: siniflar });
  } catch (error) {
    console.error('Sınıf listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıflar listelenirken bir hata oluştu' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = ''; let params = [];
    const userRol = req.user.rol || req.user.role;
    if (!pool) return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı yapılandırılmamış' });
    if (userRol === 'admin') {
      query = `SELECT s.*, o.ad as okul_adi FROM siniflar s LEFT JOIN okullar o ON s.okul_id = o.id ORDER BY s.sinif_seviyesi ASC, s.olusturma_tarihi DESC`;
    } else if (userRol === 'ogretmen') {
      query = `SELECT DISTINCT s.*, o.ad as okul_adi FROM siniflar s INNER JOIN ogretmen_sinif os ON s.id = os.sinif_id LEFT JOIN okullar o ON s.okul_id = o.id WHERE os.ogretmen_id = $1 AND os.durum = 'aktif' AND s.durum = 'aktif' ORDER BY s.sinif_seviyesi ASC`;
      params = [req.user.id];
    } else if (userRol === 'ogrenci') {
      query = `SELECT s.*, o.ad as okul_adi FROM siniflar s INNER JOIN ogrenci_sinif os ON s.id = os.sinif_id LEFT JOIN okullar o ON s.okul_id = o.id WHERE os.ogrenci_id = $1 AND os.bag_durum = 'aktif' AND s.durum = 'aktif' ORDER BY s.sinif_seviyesi ASC`;
      params = [req.user.id];
    } else {
      query = 'SELECT * FROM siniflar WHERE 1=0';
    }
    const { rows: siniflar } = await pool.query(query, params);
    if (siniflar.length > 0 && kullaniciPool) {
      const ogretmenIds = [...new Set(siniflar.map(s => s.ogretmen_id).filter(Boolean))];
      if (ogretmenIds.length > 0) {
        try {
          const placeholders = ogretmenIds.map((_, i) => `$${i + 1}`).join(',');
          const { rows: ogretmenler } = await kullaniciPool.query(`SELECT id, ad_soyad FROM kullanicilar WHERE id IN (${placeholders})`, ogretmenIds);
          const ogretmenMap = new Map(ogretmenler.map(o => [o.id, o.ad_soyad]));
          siniflar.forEach(sinif => { sinif.ogretmen_adi = sinif.ogretmen_id ? ogretmenMap.get(sinif.ogretmen_id) || null : null; });
        } catch (err) {
          siniflar.forEach(sinif => { sinif.ogretmen_adi = null; });
        }
      }
    }
    if (req.user.rol === 'ogrenci') {
      const siniflarWithOgrenciler = await Promise.all(siniflar.map(async (sinif) => {
        let ogrenciler = [];
        if (pool) {
          try {
            const { rows: ogrenciSiniflar } = await pool.query('SELECT ogrenci_id FROM ogrenci_sinif WHERE sinif_id = $1 AND bag_durum = $2', [sinif.id, 'aktif']);
            if (ogrenciSiniflar.length > 0 && kullaniciPool) {
              const ogrenciIds = ogrenciSiniflar.map(os => os.ogrenci_id);
              const placeholders = ogrenciIds.map((_, i) => `$${i + 1}`).join(',');
              const { rows: ogrenciListesi } = await kullaniciPool.query(`SELECT id, kullanici_adi, ad_soyad, avatar FROM kullanicilar WHERE id IN (${placeholders}) AND durum = 'aktif' ORDER BY ad_soyad`, ogrenciIds);
              ogrenciler = ogrenciListesi;
            }
          } catch (err) {}
        }
        return { ...sinif, ogrenciler };
      }));
      return res.json({ success: true, data: siniflarWithOgrenciler });
    }
    res.json({ success: true, data: siniflar });
  } catch (error) {
    console.error('Sınıf listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıflar listelenirken bir hata oluştu' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ad, kod, ogretmen_id, okul_id, sinif_seviyesi } = req.body;
    let sinifAd = ad;
    if (sinif_seviyesi && !ad) sinifAd = `${sinif_seviyesi}. Sınıf`;
    if ((!sinifAd && !sinif_seviyesi) || !kod || !okul_id) return res.status(400).json({ success: false, message: 'Sınıf seviyesi (veya ad), kod ve okul bilgileri gereklidir' });
    if (sinif_seviyesi && (sinif_seviyesi < 1 || sinif_seviyesi > 12)) return res.status(400).json({ success: false, message: 'Sınıf seviyesi 1-12 arasında olmalıdır' });
    if (ogretmen_id && kullaniciPool) {
      const { rows: ogretmenler } = await kullaniciPool.query('SELECT id FROM kullanicilar WHERE id = $1 AND rol = $2 AND durum = $3', [ogretmen_id, 'ogretmen', 'aktif']);
      if (ogretmenler.length === 0) return res.status(400).json({ success: false, message: 'Geçersiz öğretmen seçimi' });
    }
    const { rows: result } = await pool.query(
      'INSERT INTO siniflar (ad, kod, ogretmen_id, okul_id, sinif_seviyesi) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [sinifAd, kod, ogretmen_id || null, okul_id, sinif_seviyesi || null]
    );
    res.status(201).json({ success: true, message: 'Sınıf başarıyla eklendi', data: { id: result[0].id } });
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Bu sınıf kodu bu okul için zaten kullanılıyor' });
    console.error('Sınıf ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıf eklenirken bir hata oluştu' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ad, kod, ogretmen_id, okul_id, durum, sinif_seviyesi } = req.body;
    let sinifAd = ad;
    if (sinif_seviyesi && !ad) sinifAd = `${sinif_seviyesi}. Sınıf`;
    if ((!sinifAd && !sinif_seviyesi) || !kod) return res.status(400).json({ success: false, message: 'Sınıf seviyesi (veya ad) ve kodu gereklidir' });
    if (sinif_seviyesi && (sinif_seviyesi < 1 || sinif_seviyesi > 12)) return res.status(400).json({ success: false, message: 'Sınıf seviyesi 1-12 arasında olmalıdır' });
    if (ogretmen_id && kullaniciPool) {
      const { rows: ogretmenler } = await kullaniciPool.query('SELECT id FROM kullanicilar WHERE id = $1 AND rol = $2 AND durum = $3', [ogretmen_id, 'ogretmen', 'aktif']);
      if (ogretmenler.length === 0) return res.status(400).json({ success: false, message: 'Geçersiz öğretmen seçimi' });
    }
    await pool.query(
      'UPDATE siniflar SET ad = $1, kod = $2, ogretmen_id = $3, okul_id = $4, durum = $5, sinif_seviyesi = $6 WHERE id = $7',
      [sinifAd, kod, ogretmen_id || null, okul_id, durum || 'aktif', sinif_seviyesi || null, id]
    );
    if (ogretmen_id) {
      const { rows: mevcutAtama } = await pool.query('SELECT ogretmen_id FROM ogretmen_sinif WHERE sinif_id = $1 AND durum = $2', [id, 'aktif']);
      if (mevcutAtama.length > 0 && mevcutAtama[0].ogretmen_id != ogretmen_id) {
        await pool.query('UPDATE ogretmen_sinif SET durum = $1 WHERE sinif_id = $2 AND ogretmen_id = $3', ['pasif', id, mevcutAtama[0].ogretmen_id]);
      }
      await pool.query(
        'INSERT INTO ogretmen_sinif (ogretmen_id, sinif_id, durum) VALUES ($1, $2, $3) ON CONFLICT (ogretmen_id, sinif_id) DO UPDATE SET durum = $4, bag_tarihi = CURRENT_TIMESTAMP',
        [ogretmen_id, id, 'aktif', 'aktif']
      );
    } else {
      await pool.query('UPDATE ogretmen_sinif SET durum = $1 WHERE sinif_id = $2 AND durum = $3', ['pasif', id, 'aktif']);
    }
    res.json({ success: true, message: 'Sınıf başarıyla güncellendi' });
  } catch (error) {
    console.error('Sınıf güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıf güncellenirken bir hata oluştu' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM siniflar WHERE id = $1', [id]);
    res.json({ success: true, message: 'Sınıf başarıyla silindi' });
  } catch (error) {
    console.error('Sınıf silme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıf silinirken bir hata oluştu' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: siniflar } = await pool.query(
      `SELECT s.*, o.ad as okul_adi FROM siniflar s LEFT JOIN okullar o ON s.okul_id = o.id WHERE s.id = $1`,
      [id]
    );
    if (siniflar.length === 0) return res.status(404).json({ success: false, message: 'Sınıf bulunamadı' });
    const sinif = siniflar[0];
    if (sinif.ogretmen_id && kullaniciPool) {
      try {
        const { rows: ogretmenRows } = await kullaniciPool.query('SELECT ad_soyad FROM kullanicilar WHERE id = $1', [sinif.ogretmen_id]);
        sinif.ogretmen_adi = ogretmenRows.length > 0 ? ogretmenRows[0].ad_soyad : null;
      } catch (err) { sinif.ogretmen_adi = null; }
    } else sinif.ogretmen_adi = null;
    const userRol = req.user.rol || req.user.role;
    if (userRol === 'ogretmen') {
      const { rows: ogretmenSinifKontrol } = await pool.query('SELECT * FROM ogretmen_sinif WHERE ogretmen_id = $1 AND sinif_id = $2 AND durum = $3', [req.user.id, id, 'aktif']);
      if (ogretmenSinifKontrol.length === 0 && sinif.ogretmen_id !== req.user.id) return res.status(403).json({ success: false, message: 'Bu sınıfı görüntüleme yetkiniz yok' });
    }
    if (userRol === 'ogrenci') {
      const { rows: ogrenciKontrol } = await pool.query('SELECT * FROM ogrenci_sinif WHERE ogrenci_id = $1 AND sinif_id = $2 AND bag_durum = $3', [req.user.id, id, 'aktif']);
      if (ogrenciKontrol.length === 0 && req.user.rol !== 'admin') return res.status(403).json({ success: false, message: 'Bu sınıfı görüntüleme yetkiniz yok' });
    }
    let ogrenciler = [];
    if (userRol === 'admin' || userRol === 'ogretmen') {
      const { rows: ogrenciSinifRows } = await pool.query('SELECT ogrenci_id FROM ogrenci_sinif WHERE sinif_id = $1 AND bag_durum = $2', [id, 'aktif']);
      const ogrenciIds = ogrenciSinifRows.map(r => r.ogrenci_id);
      if (ogrenciIds.length > 0 && kullaniciPool) {
        const placeholders = ogrenciIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: ogrenciListesi } = await kullaniciPool.query(
          `SELECT k.id, k.kullanici_adi, k.email, k.ad_soyad, k.telefon, k.avatar, oi.son_giris_tarihi, oi.bitirdigi_son_etkinlik_id, oi.bitirdigi_son_etkinlik_tarihi, oi.toplam_etkinlik_sayisi
           FROM kullanicilar k LEFT JOIN ogrenci_istatistikleri oi ON k.id = oi.ogrenci_id
           WHERE k.id IN (${placeholders}) AND k.durum = 'aktif' ORDER BY k.ad_soyad`,
          ogrenciIds
        );
        ogrenciler = ogrenciListesi;
      }
    } else if (userRol === 'ogrenci') {
      const { rows: ogrenciSinifRows } = await pool.query('SELECT ogrenci_id FROM ogrenci_sinif WHERE sinif_id = $1 AND bag_durum = $2', [id, 'aktif']);
      const ogrenciIds = ogrenciSinifRows.map(r => r.ogrenci_id);
      if (ogrenciIds.length > 0 && kullaniciPool) {
        const placeholders = ogrenciIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: ogrenciListesi } = await kullaniciPool.query(`SELECT k.id, k.kullanici_adi, k.ad_soyad, k.avatar FROM kullanicilar k WHERE k.id IN (${placeholders}) AND k.durum = 'aktif' ORDER BY k.ad_soyad`, ogrenciIds);
        ogrenciler = ogrenciListesi;
      }
    }
    res.json({ success: true, data: { sinif, ogrenciler } });
  } catch (error) {
    console.error('Sınıf detay hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıf bilgileri alınırken bir hata oluştu' });
  }
});

router.post('/:id/ogrenciler', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ogrenci_id } = req.body;
    if (!ogrenci_id) return res.status(400).json({ success: false, message: 'Öğrenci ID gereklidir' });
    if (req.user.rol === 'ogretmen') {
      const { rows: sinifKontrol } = await pool.query('SELECT ogretmen_id FROM siniflar WHERE id = $1', [id]);
      if (sinifKontrol.length === 0 || sinifKontrol[0].ogretmen_id !== req.user.id) return res.status(403).json({ success: false, message: 'Bu sınıfa öğrenci ekleme yetkiniz yok' });
    }
    if (kullaniciPool) {
      const { rows: ogrenciler } = await kullaniciPool.query('SELECT id FROM kullanicilar WHERE id = $1 AND rol = $2 AND durum = $3', [ogrenci_id, 'ogrenci', 'aktif']);
      if (ogrenciler.length === 0) return res.status(400).json({ success: false, message: 'Geçersiz öğrenci' });
    }
    const { rows: mevcutSinif } = await pool.query('SELECT sinif_id FROM ogrenci_sinif WHERE ogrenci_id = $1 AND bag_durum = $2 AND sinif_id != $3', [ogrenci_id, 'aktif', id]);
    if (mevcutSinif.length > 0) {
      await pool.query('UPDATE ogrenci_sinif SET bag_durum = $1 WHERE ogrenci_id = $2 AND bag_durum = $3', ['pasif', ogrenci_id, 'aktif']);
    }
    await pool.query(
      'INSERT INTO ogrenci_sinif (ogrenci_id, sinif_id, bag_durum, bag_tarihi) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (ogrenci_id, sinif_id) DO UPDATE SET bag_durum = $4, bag_tarihi = CURRENT_TIMESTAMP',
      [ogrenci_id, id, 'aktif', 'aktif']
    );
    res.json({ success: true, message: 'Öğrenci sınıfa başarıyla eklendi' });
  } catch (error) {
    console.error('Öğrenci ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Öğrenci eklenirken bir hata oluştu' });
  }
});

router.delete('/:id/ogrenciler/:ogrenci_id', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { id, ogrenci_id } = req.params;
    if (req.user.rol === 'ogretmen') {
      const { rows: sinifKontrol } = await pool.query('SELECT ogretmen_id FROM siniflar WHERE id = $1', [id]);
      if (sinifKontrol.length === 0 || sinifKontrol[0].ogretmen_id !== req.user.id) return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' });
    }
    await pool.query('UPDATE ogrenci_sinif SET bag_durum = $1 WHERE ogrenci_id = $2 AND sinif_id = $3', ['pasif', ogrenci_id, id]);
    res.json({ success: true, message: 'Öğrenci sınıftan çıkarıldı' });
  } catch (error) {
    console.error('Öğrenci çıkarma hatası:', error);
    res.status(500).json({ success: false, message: 'Öğrenci çıkarılırken bir hata oluştu' });
  }
});

module.exports = router;
