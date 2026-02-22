const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { kullaniciPool: pool, organizasyonPool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const fileUploader = require('../utils/fileUploader');

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rol, okul_id, sinif_id, sinif_ids, tc_kimlik_no, lisans_suresi_baslangic, lisans_suresi_bitis } = req.body;
    if (!rol || !['ogretmen', 'ogrenci'].includes(rol)) {
      return res.status(400).json({ success: false, message: 'Geçerli bir rol belirtilmelidir (ogretmen veya ogrenci). Admin rolü için aktivasyon kodu oluşturulamaz.' });
    }
    if (rol === 'admin') return res.status(400).json({ success: false, message: 'Admin rolü için aktivasyon kodu oluşturulamaz' });
    if (!okul_id) return res.status(400).json({ success: false, message: 'Okul seçilmelidir' });
    if (!lisans_suresi_baslangic || !lisans_suresi_bitis) return res.status(400).json({ success: false, message: 'Lisans başlangıç ve bitiş tarihleri gereklidir' });
    if (new Date(lisans_suresi_baslangic) > new Date(lisans_suresi_bitis)) return res.status(400).json({ success: false, message: 'Bitiş tarihi başlangıç tarihinden sonra olmalıdır' });
    if (rol === 'ogrenci' && !sinif_id) return res.status(400).json({ success: false, message: 'Öğrenci aktivasyon kodu için sınıf seçilmelidir' });
    let finalSinifId = null;
    if (rol === 'ogrenci') finalSinifId = sinif_id;
    if (!organizasyonPool) return res.status(500).json({ success: false, message: 'ORGANIZASYON_DB_URL environment variable eksik!' });
    const { rows: okullar } = await organizasyonPool.query('SELECT id FROM okullar WHERE id = $1 AND durum = $2', [okul_id, 'aktif']);
    if (okullar.length === 0) return res.status(400).json({ success: false, message: 'Seçilen okul bulunamadı veya aktif değil' });
    if (rol === 'ogrenci' && finalSinifId) {
      const { rows: siniflar } = await organizasyonPool.query('SELECT id FROM siniflar WHERE id = $1 AND okul_id = $2 AND durum = $3', [finalSinifId, okul_id, 'aktif']);
      if (siniflar.length === 0) return res.status(400).json({ success: false, message: 'Seçilen sınıf bu okula ait değil veya aktif değil' });
    }
    if (rol === 'ogretmen' && sinif_ids && Array.isArray(sinif_ids) && sinif_ids.length > 0) {
      const sinifIdNumbers = sinif_ids.map(id => Number(id)).filter(id => !isNaN(id));
      if (sinifIdNumbers.length > 0) {
        const placeholders = sinifIdNumbers.map((_, i) => `$${i + 1}`).join(',');
        const { rows: siniflar } = await organizasyonPool.query(
          `SELECT id FROM siniflar WHERE id IN (${placeholders}) AND okul_id = $${sinifIdNumbers.length + 1} AND durum = $${sinifIdNumbers.length + 2}`,
          [...sinifIdNumbers, okul_id, 'aktif']
        );
        if (siniflar.length !== sinifIdNumbers.length) return res.status(400).json({ success: false, message: 'Seçilen sınıflardan bazıları bu okula ait değil veya aktif değil' });
      }
    }
    let kod; let isUnique = false; let attempts = 0;
    while (!isUnique && attempts < 10) {
      kod = crypto.randomBytes(8).toString('hex').toUpperCase().trim();
      const { rows: existing } = await pool.query('SELECT id FROM aktivasyon_kodlari WHERE UPPER(TRIM(kod)) = $1', [kod]);
      if (existing.length === 0) isUnique = true; else attempts++;
    }
    if (!isUnique) return res.status(500).json({ success: false, message: 'Benzersiz aktivasyon kodu oluşturulamadı' });
    let sinifIdsJson = null;
    if (rol === 'ogretmen' && sinif_ids && Array.isArray(sinif_ids) && sinif_ids.length > 0) {
      const sinifIdNumbers = sinif_ids.map(id => Number(id)).filter(id => !isNaN(id));
      if (sinifIdNumbers.length > 0) sinifIdsJson = JSON.stringify(sinifIdNumbers);
    }
    const { rows: result } = await pool.query(
      'INSERT INTO aktivasyon_kodlari (kod, rol, okul_id, sinif_id, sinif_ids, tc_kimlik_no, lisans_suresi_baslangic, lisans_suresi_bitis, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [kod, rol, okul_id, finalSinifId, sinifIdsJson, tc_kimlik_no || null, lisans_suresi_baslangic, lisans_suresi_bitis, req.user.id]
    );
    res.status(201).json({
      success: true,
      message: 'Aktivasyon kodu başarıyla oluşturuldu',
      data: { id: result[0].id, kod, rol, okul_id, sinif_id: finalSinifId || null, sinif_ids: sinifIdsJson ? JSON.parse(sinifIdsJson) : null }
    });
  } catch (error) {
    console.error('Aktivasyon kodu oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Aktivasyon kodu oluşturulurken bir hata oluştu' });
  }
});

router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { kullanildi, rol } = req.query;
    if (!pool) return res.status(500).json({ success: false, message: 'KULLANICI_DB_URL environment variable eksik!' });
    let query = `
      SELECT ak.id, ak.kod, ak.rol, ak.okul_id, ak.sinif_id, ak.kullanici_id, ak.kullanici_adi, ak.kullanildi, ak.kullanim_tarihi, ak.olusturma_tarihi,
        ak.lisans_suresi_baslangic, ak.lisans_suresi_bitis, ak.olusturan_id, ak.tanimli_ad_soyad, ak.tanimli_kullanici_adi, ak.tc_kimlik_no,
        k.ad_soyad as kullanici_ad_soyad, k.tc_kimlik_no as kullanici_tc_kimlik_no, olusturan.ad_soyad as olusturan_ad_soyad
      FROM aktivasyon_kodlari ak
      LEFT JOIN kullanicilar k ON ak.kullanici_id = k.id
      LEFT JOIN kullanicilar olusturan ON ak.olusturan_id = olusturan.id
      WHERE 1=1
    `;
    const params = [];
    if (kullanildi !== undefined) { query += ` AND ak.kullanildi = $${params.length + 1}`; params.push(kullanildi === 'true'); }
    if (rol) { query += ` AND ak.rol = $${params.length + 1}`; params.push(rol); }
    query += ' ORDER BY ak.olusturma_tarihi DESC';
    const { rows: kodlar } = await pool.query(query, params);
    const okulIds = [...new Set(kodlar.map(k => k.okul_id).filter(Boolean))];
    const okulMap = new Map();
    if (okulIds.length > 0 && organizasyonPool) {
      try {
        const placeholders = okulIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: okullar } = await organizasyonPool.query(`SELECT id, ad FROM okullar WHERE id IN (${placeholders})`, okulIds);
        okullar.forEach(o => okulMap.set(o.id, o.ad));
      } catch (err) { console.error('Okul bilgileri alınamadı:', err.message); }
    }
    const sinifIds = [...new Set(kodlar.map(k => k.sinif_id).filter(Boolean))];
    const sinifMap = new Map();
    if (sinifIds.length > 0 && organizasyonPool) {
      try {
        const placeholders = sinifIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: siniflar } = await organizasyonPool.query(`SELECT id, sinif_seviyesi FROM siniflar WHERE id IN (${placeholders})`, sinifIds);
        siniflar.forEach(s => sinifMap.set(s.id, s.sinif_seviyesi));
      } catch (err) { console.error('Sınıf bilgileri alınamadı:', err.message); }
    }
    const formattedKodlar = kodlar.map(kod => ({
      ...kod,
      okul_adi: kod.okul_id ? okulMap.get(kod.okul_id) || null : null,
      sinif_seviyesi: kod.sinif_id ? sinifMap.get(kod.sinif_id) || null : null,
      sinif_adi: kod.sinif_id && sinifMap.get(kod.sinif_id) ? `${sinifMap.get(kod.sinif_id)}. Sınıf` : null
    }));
    res.json({ success: true, data: formattedKodlar });
  } catch (error) {
    console.error('Aktivasyon kodları listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Aktivasyon kodları listelenirken bir hata oluştu' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { lisans_suresi_baslangic, lisans_suresi_bitis } = req.body;
    const { rows: kodlar } = await pool.query('SELECT id FROM aktivasyon_kodlari WHERE id = $1', [id]);
    if (kodlar.length === 0) return res.status(404).json({ success: false, message: 'Aktivasyon kodu bulunamadı' });
    if (!lisans_suresi_baslangic || !lisans_suresi_bitis) return res.status(400).json({ success: false, message: 'Lisans başlangıç ve bitiş tarihleri gereklidir' });
    if (new Date(lisans_suresi_baslangic) > new Date(lisans_suresi_bitis)) return res.status(400).json({ success: false, message: 'Bitiş tarihi başlangıç tarihinden sonra olmalıdır' });
    await pool.query('UPDATE aktivasyon_kodlari SET lisans_suresi_baslangic = $1, lisans_suresi_bitis = $2 WHERE id = $3', [lisans_suresi_baslangic, lisans_suresi_bitis, id]);
    res.json({ success: true, message: 'Aktivasyon kodu başarıyla güncellendi' });
  } catch (error) {
    console.error('Aktivasyon kodu güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Aktivasyon kodu güncellenirken bir hata oluştu' });
  }
});

router.patch('/:id/tanimli-bilgi', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tanimli_ad_soyad, tanimli_kullanici_adi, tc_kimlik_no } = req.body;
    const { rows: kodlar } = await pool.query('SELECT id, kullanildi FROM aktivasyon_kodlari WHERE id = $1', [id]);
    if (kodlar.length === 0) return res.status(404).json({ success: false, message: 'Aktivasyon kodu bulunamadı' });
    if (kodlar[0].kullanildi) return res.status(400).json({ success: false, message: 'Kullanılmış koda tanımlı bilgi girilemez' });
    const updates = []; const values = []; let idx = 1;
    if (tanimli_ad_soyad !== undefined) { updates.push(`tanimli_ad_soyad = $${idx++}`); values.push(tanimli_ad_soyad === '' || tanimli_ad_soyad == null ? null : String(tanimli_ad_soyad).trim()); }
    if (tanimli_kullanici_adi !== undefined) { updates.push(`tanimli_kullanici_adi = $${idx++}`); values.push(tanimli_kullanici_adi === '' || tanimli_kullanici_adi == null ? null : String(tanimli_kullanici_adi).trim()); }
    if (tc_kimlik_no !== undefined) { updates.push(`tc_kimlik_no = $${idx++}`); values.push(tc_kimlik_no === '' || tc_kimlik_no == null ? null : String(tc_kimlik_no).trim()); }
    if (updates.length === 0) return res.json({ success: true, message: 'Güncellenecek alan yok' });
    values.push(id);
    await pool.query(`UPDATE aktivasyon_kodlari SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true, message: 'Tanımlı bilgiler güncellendi' });
  } catch (error) {
    console.error('Tanımlı bilgi güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Tanımlı bilgiler güncellenirken bir hata oluştu' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: kodlar } = await pool.query('SELECT id, kullanici_id, kullanici_adi, rol, kullanildi FROM aktivasyon_kodlari WHERE id = $1', [id]);
    if (kodlar.length === 0) return res.status(404).json({ success: false, message: 'Aktivasyon kodu bulunamadı' });
    const kod = kodlar[0];
    let silinenKullanici = null;
    if (kod.kullanici_id && kod.kullanildi) {
      const { rows: kullanici } = await pool.query('SELECT id, kullanici_adi, ad_soyad, rol FROM kullanicilar WHERE id = $1', [kod.kullanici_id]);
      if (kullanici.length > 0) {
        silinenKullanici = kullanici[0];
        await pool.query('DELETE FROM kullanicilar WHERE id = $1', [kod.kullanici_id]);
      }
    }
    await pool.query('DELETE FROM aktivasyon_kodlari WHERE id = $1', [id]);
    res.json({
      success: true,
      message: silinenKullanici ? `Aktivasyon kodu ve bağlı kullanıcı (${silinenKullanici.kullanici_adi} - ${silinenKullanici.rol}) başarıyla silindi` : 'Aktivasyon kodu başarıyla silindi',
      silinenKullanici: silinenKullanici ? { id: silinenKullanici.id, kullanici_adi: silinenKullanici.kullanici_adi, ad_soyad: silinenKullanici.ad_soyad, rol: silinenKullanici.rol } : null
    });
  } catch (error) {
    console.error('Aktivasyon kodu silme hatası:', error);
    res.status(500).json({ success: false, message: 'Aktivasyon kodu silinirken bir hata oluştu' });
  }
});

const LISTELER_REMOTE_DIR = '/listeler';
const uploadListe = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Sadece PDF veya Excel dosyaları yüklenebilir'), false);
  },
  limits: { fileSize: 15 * 1024 * 1024 }
});
function sanitizeListeAdi(name) {
  if (!name || typeof name !== 'string') return 'liste';
  return name.trim().replace(/[^\w\u00C0-\u024F\u0400-\u04FF\s-]/gi, '').replace(/\s+/g, '_').slice(0, 100) || 'liste';
}
router.post('/liste-upload-to-cdn', authenticateToken, authorizeRoles('admin'), uploadListe.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi veya dosya boş' });
    const listeAdi = sanitizeListeAdi(req.body.liste_adi || req.body.listeAdi || '');
    const ext = path.extname(req.file.originalname).toLowerCase() || (req.file.mimetype === 'application/pdf' ? '.pdf' : '.xlsx');
    const safeExt = ['.pdf', '.xlsx', '.xls'].includes(ext) ? ext : '.xlsx';
    const filename = `${listeAdi}${safeExt}`;
    const remoteFilePath = `${LISTELER_REMOTE_DIR}/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    return res.json({ success: true, message: 'Liste CDN\'e yüklendi', data: { url: publicUrl, path: remoteFilePath, filename, liste_adi: listeAdi } });
  } catch (error) {
    console.error('Liste yükleme hatası:', error);
    return res.status(500).json({ success: false, message: error.message || 'Liste yüklenirken hata oluştu' });
  }
});
router.get('/liste-list-cdn', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const dir = LISTELER_REMOTE_DIR.replace(/^\/+/, '').replace(/\/+$/, '') || 'listeler';
    const data = await fileUploader.listFiles(dir, 'all');
    return res.json({ success: true, data: data && typeof data === 'object' ? data : { folders: [], files: [] } });
  } catch (err) {
    console.error('Liste listesi CDN hatası:', err);
    return res.status(500).json({ success: false, message: err.message || 'Liste klasörü okunamadı', data: { folders: [], files: [] } });
  }
});
router.delete('/liste-delete-cdn', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: filePath } = req.body || {};
    if (!filePath || typeof filePath !== 'string') return res.status(400).json({ success: false, message: 'path gerekli' });
    const ok = await fileUploader.deleteFile(filePath.trim());
    return res.json({ success: !!ok, message: ok ? 'Dosya silindi' : 'Silinemedi' });
  } catch (err) {
    console.error('Liste silme CDN hatası:', err);
    return res.status(500).json({ success: false, message: err.message || 'Silme işlemi başarısız' });
  }
});
router.put('/liste-rename-cdn', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: filePath, newName } = req.body || {};
    if (!filePath || typeof filePath !== 'string' || !newName || typeof newName !== 'string') return res.status(400).json({ success: false, message: 'path ve newName gerekli' });
    const trimmedName = newName.trim().replace(/[^\w\u00C0-\u024F\u0400-\u04FF.\s-]/gi, '').replace(/\s+/g, '_') || newName.trim();
    if (!trimmedName) return res.status(400).json({ success: false, message: 'Geçerli bir dosya adı girin' });
    const newPath = await fileUploader.renameFile(filePath.trim(), trimmedName);
    return res.json({ success: !!newPath, message: newPath ? 'Yeniden adlandırıldı' : 'Yeniden adlandırılamadı', data: newPath ? { path: newPath } : null });
  } catch (err) {
    console.error('Liste yeniden adlandırma CDN hatası:', err);
    return res.status(500).json({ success: false, message: err.message || 'Yeniden adlandırma başarısız' });
  }
});

module.exports = router;
