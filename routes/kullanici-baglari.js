/**
 * Kullanıcı Bağları API - Okul – öğretmen – sınıf – öğrenci bağları (ogretmen_sinif, ogrenci_sinif)
 */
const express = require('express');
const router = express.Router();
const { organizasyonPool, kullaniciPool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.get('/ogretmen/:ogretmenId/siniflar', authenticateToken, async (req, res) => {
  try {
    const { ogretmenId } = req.params;
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB bağlantısı yok' });
    const { rows: siniflar } = await organizasyonPool.query(
      `SELECT s.*, os.durum as bag_durum, os.bag_tarihi
       FROM siniflar s
       INNER JOIN ogretmen_sinif os ON s.id = os.sinif_id
       WHERE os.ogretmen_id = $1 AND os.durum = 'aktif'
       ORDER BY s.sinif_seviyesi ASC`,
      [ogretmenId]
    );
    const okulIds = [...new Set(siniflar.map(s => s.okul_id).filter(Boolean))];
    const okulMap = new Map();
    if (okulIds.length > 0) {
      const ph = okulIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows: okullar } = await organizasyonPool.query(`SELECT id, ad FROM okullar WHERE id IN (${ph})`, okulIds);
      okullar.forEach(o => okulMap.set(o.id, o.ad));
    }
    siniflar.forEach(s => { s.okul_adi = s.okul_id ? okulMap.get(s.okul_id) || null : null; });
    res.json({ success: true, data: siniflar });
  } catch (error) {
    console.error('Öğretmen sınıfları getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıflar getirilirken bir hata oluştu' });
  }
});

router.post('/ogretmen/:ogretmenId/siniflar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ogretmenId } = req.params;
    const { sinif_id } = req.body;
    if (!sinif_id) return res.status(400).json({ success: false, message: 'sinif_id gereklidir' });
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB bağlantısı yok' });
    await organizasyonPool.query(
      `INSERT INTO ogretmen_sinif (ogretmen_id, sinif_id, durum)
       VALUES ($1, $2, 'aktif')
       ON CONFLICT (ogretmen_id, sinif_id) DO UPDATE SET durum = 'aktif', bag_tarihi = CURRENT_TIMESTAMP`,
      [ogretmenId, sinif_id]
    );
    res.json({ success: true, message: 'Öğretmen–sınıf bağı oluşturuldu' });
  } catch (error) {
    console.error('Öğretmen–sınıf bağı ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Bağ eklenirken bir hata oluştu' });
  }
});

router.delete('/ogretmen/:ogretmenId/siniflar/:sinifId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ogretmenId, sinifId } = req.params;
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB bağlantısı yok' });
    await organizasyonPool.query(
      `UPDATE ogretmen_sinif SET durum = 'pasif' WHERE ogretmen_id = $1 AND sinif_id = $2`,
      [ogretmenId, sinifId]
    );
    res.json({ success: true, message: 'Öğretmen–sınıf bağı kaldırıldı' });
  } catch (error) {
    console.error('Öğretmen–sınıf bağı kaldırma hatası:', error);
    res.status(500).json({ success: false, message: 'Bağ kaldırılırken bir hata oluştu' });
  }
});

router.get('/ogrenci/:ogrenciId/siniflar', authenticateToken, async (req, res) => {
  try {
    const { ogrenciId } = req.params;
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB bağlantısı yok' });
    const { rows: siniflar } = await organizasyonPool.query(
      `SELECT s.*, os.bag_durum, os.bag_tarihi
       FROM siniflar s
       INNER JOIN ogrenci_sinif os ON s.id = os.sinif_id
       WHERE os.ogrenci_id = $1
       ORDER BY os.bag_durum DESC, s.sinif_seviyesi ASC`,
      [ogrenciId]
    );
    const okulIds = [...new Set(siniflar.map(s => s.okul_id).filter(Boolean))];
    const okulMap = new Map();
    if (okulIds.length > 0) {
      const ph = okulIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows: okullar } = await organizasyonPool.query(`SELECT id, ad FROM okullar WHERE id IN (${ph})`, okulIds);
      okullar.forEach(o => okulMap.set(o.id, o.ad));
    }
    siniflar.forEach(s => { s.okul_adi = s.okul_id ? okulMap.get(s.okul_id) || null : null; });
    res.json({ success: true, data: siniflar });
  } catch (error) {
    console.error('Öğrenci sınıfları getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Sınıflar getirilirken bir hata oluştu' });
  }
});

router.post('/ogrenci/:ogrenciId/siniflar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ogrenciId } = req.params;
    const { sinif_id } = req.body;
    if (!sinif_id) return res.status(400).json({ success: false, message: 'sinif_id gereklidir' });
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB bağlantısı yok' });
    await organizasyonPool.query(
      `INSERT INTO ogrenci_sinif (ogrenci_id, sinif_id, bag_durum, bag_tarihi)
       VALUES ($1, $2, 'aktif', CURRENT_TIMESTAMP)
       ON CONFLICT (ogrenci_id, sinif_id) DO UPDATE SET bag_durum = 'aktif', bag_tarihi = CURRENT_TIMESTAMP`,
      [ogrenciId, sinif_id]
    );
    res.json({ success: true, message: 'Öğrenci–sınıf bağı oluşturuldu' });
  } catch (error) {
    console.error('Öğrenci–sınıf bağı ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Bağ eklenirken bir hata oluştu' });
  }
});

router.delete('/ogrenci/:ogrenciId/siniflar/:sinifId', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ogrenciId, sinifId } = req.params;
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB bağlantısı yok' });
    await organizasyonPool.query(
      `UPDATE ogrenci_sinif SET bag_durum = 'pasif' WHERE ogrenci_id = $1 AND sinif_id = $2`,
      [ogrenciId, sinifId]
    );
    res.json({ success: true, message: 'Öğrenci–sınıf bağı kaldırıldı' });
  } catch (error) {
    console.error('Öğrenci–sınıf bağı kaldırma hatası:', error);
    res.status(500).json({ success: false, message: 'Bağ kaldırılırken bir hata oluştu' });
  }
});

module.exports = router;
