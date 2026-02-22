const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { organizasyonPool, kullaniciPool } = require('../config/database');
const pool = organizasyonPool;
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const fileUploader = require('../utils/fileUploader');

const memoryStorage = multer.memoryStorage();
const gorselFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Sadece görsel dosyaları yüklenebilir (jpg, png, gif, webp, svg)'), false);
};
const uploadGorsel = multer({
  storage: memoryStorage,
  fileFilter: gorselFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.get('/public', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı yapılandırılmamış' });
    const { rows: okullar } = await pool.query('SELECT id, ad, kod FROM okullar WHERE durum = $1 ORDER BY ad ASC', ['aktif']);
    res.json({ success: true, data: okullar });
  } catch (error) {
    console.error('Okul listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Okullar listelenirken bir hata oluştu' });
  }
});

router.get('/', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { rows: okullar } = await pool.query('SELECT * FROM okullar ORDER BY olusturma_tarihi DESC');
    res.json({ success: true, data: okullar });
  } catch (error) {
    console.error('Okul listeleme hatası:', error);
    res.status(500).json({ success: false, message: 'Okullar listelenirken bir hata oluştu' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ad, kod, gorsel } = req.body;
    if (!ad || !kod) return res.status(400).json({ success: false, message: 'Okul adı ve kodu gereklidir' });
    const { rows: result } = await pool.query('INSERT INTO okullar (ad, kod, gorsel) VALUES ($1, $2, $3) RETURNING id', [ad, kod, gorsel || null]);
    res.status(201).json({ success: true, message: 'Okul başarıyla eklendi', data: { id: result[0].id, ad, kod, gorsel: gorsel || null } });
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Bu okul kodu zaten kullanılıyor' });
    console.error('Okul ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Okul eklenirken bir hata oluştu' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ad, kod, durum, gorsel } = req.body;
    if (!ad || !kod) return res.status(400).json({ success: false, message: 'Okul adı ve kodu gereklidir' });
    await pool.query('UPDATE okullar SET ad = $1, kod = $2, durum = $3, gorsel = $4 WHERE id = $5', [ad, kod, durum || 'aktif', gorsel || null, id]);
    res.json({ success: true, message: 'Okul başarıyla güncellendi' });
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Bu okul kodu zaten kullanılıyor' });
    console.error('Okul güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Okul güncellenirken bir hata oluştu' });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!kullaniciPool) return res.status(500).json({ success: false, message: 'Kullanıcı veritabanı bağlantısı yapılandırılmamış' });
    const { rows: kullaniciCount } = await kullaniciPool.query('SELECT COUNT(*) as count FROM kullanicilar WHERE okul_id = $1', [id]);
    if (parseInt(kullaniciCount[0].count, 10) > 0) return res.status(400).json({ success: false, message: 'Bu okula bağlı kullanıcılar bulunmaktadır. Önce kullanıcıları silmeniz gerekiyor.' });
    const { rows: okullar } = await pool.query('SELECT gorsel FROM okullar WHERE id = $1', [id]);
    if (okullar.length > 0 && okullar[0].gorsel) {
      try { await fileUploader.deleteFile(okullar[0].gorsel); } catch (e) { console.error('Okul görseli silme hatası:', e); }
    }
    await pool.query('DELETE FROM okullar WHERE id = $1', [id]);
    res.json({ success: true, message: 'Okul başarıyla silindi' });
  } catch (error) {
    console.error('Okul silme hatası:', error);
    res.status(500).json({ success: false, message: 'Okul silinirken bir hata oluştu' });
  }
});

router.get('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: okullar } = await pool.query('SELECT * FROM okullar WHERE id = $1', [id]);
    if (okullar.length === 0) return res.status(404).json({ success: false, message: 'Okul bulunamadı' });
    res.json({ success: true, data: okullar[0] });
  } catch (error) {
    console.error('Okul detay hatası:', error);
    res.status(500).json({ success: false, message: 'Okul bilgileri alınırken bir hata oluştu' });
  }
});

router.post('/upload/gorsel', authenticateToken, authorizeRoles('admin'), uploadGorsel.single('gorsel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi' });
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(req.file.originalname);
    const name = path.basename(req.file.originalname, ext);
    const filename = `${uniqueSuffix}-${name}${ext}`;
    const remoteFilePath = `/uploads/okullar/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    res.json({ success: true, message: 'Görsel başarıyla yüklendi', data: { path: remoteFilePath, url: publicUrl, filename, originalname: req.file.originalname, size: req.file.size } });
  } catch (error) {
    console.error('Okul görsel yükleme hatası:', error);
    res.status(500).json({ success: false, message: 'Görsel yüklenirken hata: ' + error.message });
  }
});

const uploadAny = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isAudio = file.mimetype.startsWith('audio/');
    const isDocument = file.mimetype === 'application/pdf' || file.mimetype === 'application/msword' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (isImage || isAudio || isDocument) cb(null, true);
    else cb(new Error('Sadece görsel, ses veya belge dosyaları yüklenebilir'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/upload/file', authenticateToken, authorizeRoles('admin'), uploadAny.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi' });
    const { path: targetPath = '/uploads/okullar', type = 'all', filename: customFilename } = req.body;
    let filename;
    if (customFilename && customFilename.trim()) {
      const ext = path.extname(req.file.originalname);
      const customName = customFilename.trim();
      filename = customName.endsWith(ext) ? customName : customName + ext;
    } else {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(req.file.originalname);
      const name = path.basename(req.file.originalname, ext);
      filename = `${uniqueSuffix}-${name}${ext}`;
    }
    const remoteFilePath = `${targetPath}/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    res.json({ success: true, message: 'Dosya başarıyla yüklendi', data: { url: publicUrl, path: remoteFilePath, filename, originalname: req.file.originalname, size: req.file.size } });
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    res.status(500).json({ success: false, message: 'Dosya yüklenirken hata: ' + error.message });
  }
});

router.delete('/upload/file', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) return res.status(400).json({ success: false, message: 'Dosya yolu gereklidir' });
    const deleted = await fileUploader.deleteFile(filePath);
    if (deleted) return res.json({ success: true, message: 'Dosya başarıyla silindi' });
    return res.status(500).json({ success: false, message: 'Dosya silinemedi' });
  } catch (error) {
    console.error('Dosya silme hatası:', error);
    res.status(500).json({ success: false, message: 'Dosya silinirken hata: ' + error.message });
  }
});

router.post('/upload/move', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    if (!sourcePath || !targetPath) return res.status(400).json({ success: false, message: 'Kaynak ve hedef yol gereklidir' });
    const moved = await fileUploader.moveFile(sourcePath, targetPath);
    if (moved) {
      const { updateFileReferences } = require('../utils/updateFileReferences');
      try { await updateFileReferences(sourcePath, targetPath); } catch (e) { console.error('[moveFile] Veritabanı güncelleme hatası:', e); }
      return res.json({ success: true, message: 'Dosya başarıyla taşındı' });
    }
    res.status(500).json({ success: false, message: 'Dosya taşınamadı' });
  } catch (error) {
    console.error('Dosya taşıma hatası:', error);
    res.status(500).json({ success: false, message: 'Dosya taşınırken hata: ' + error.message });
  }
});

router.post('/upload/rename', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: filePath, newName } = req.body;
    if (!filePath || !newName) return res.status(400).json({ success: false, message: 'Dosya yolu ve yeni ad gereklidir' });
    const renamed = await fileUploader.renameFile(filePath, newName);
    if (renamed) return res.json({ success: true, message: 'Dosya başarıyla yeniden adlandırıldı', data: { newPath: renamed } });
    return res.status(500).json({ success: false, message: 'Dosya yeniden adlandırılamadı' });
  } catch (error) {
    console.error('Dosya yeniden adlandırma hatası:', error);
    res.status(500).json({ success: false, message: 'Dosya yeniden adlandırılırken hata: ' + error.message });
  }
});

router.post('/upload/folder', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: dirPath, folderName } = req.body;
    if (!dirPath || !folderName) return res.status(400).json({ success: false, message: 'Klasör yolu ve adı gereklidir' });
    const created = await fileUploader.createFolder(dirPath, folderName);
    if (created) return res.json({ success: true, message: 'Klasör başarıyla oluşturuldu' });
    return res.status(500).json({ success: false, message: 'Klasör oluşturulamadı' });
  } catch (error) {
    console.error('Klasör oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Klasör oluşturulurken hata: ' + error.message });
  }
});

router.delete('/upload/folder', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ success: false, message: 'Klasör yolu gereklidir' });
    const deleted = await fileUploader.deleteFolder(folderPath);
    if (deleted) return res.json({ success: true, message: 'Klasör başarıyla silindi' });
    return res.status(500).json({ success: false, message: 'Klasör silinemedi' });
  } catch (error) {
    console.error('Klasör silme hatası:', error);
    res.status(500).json({ success: false, message: 'Klasör silinirken hata: ' + error.message });
  }
});

router.post('/upload/move-folder', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    if (!sourcePath || !targetPath) return res.status(400).json({ success: false, message: 'Kaynak ve hedef yol gereklidir' });
    const moved = await fileUploader.moveFolder(sourcePath, targetPath);
    if (moved) {
      const { updateFolderReferences } = require('../utils/updateFileReferences');
      try { await updateFolderReferences(sourcePath, targetPath); } catch (e) { console.error('[moveFolder] Veritabanı güncelleme hatası:', e); }
      return res.json({ success: true, message: 'Klasör başarıyla taşındı' });
    }
    res.status(500).json({ success: false, message: 'Klasör taşınamadı' });
  } catch (error) {
    console.error('Klasör taşıma hatası:', error);
    res.status(500).json({ success: false, message: 'Klasör taşınırken hata: ' + error.message });
  }
});

router.post('/upload/rename-folder', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: folderPath, newName } = req.body;
    if (!folderPath || !newName) return res.status(400).json({ success: false, message: 'Klasör yolu ve yeni ad gereklidir' });
    const renamed = await fileUploader.renameFolder(folderPath, newName);
    if (renamed) return res.json({ success: true, message: 'Klasör başarıyla yeniden adlandırıldı', data: { newPath: renamed } });
    return res.status(500).json({ success: false, message: 'Klasör yeniden adlandırılamadı' });
  } catch (error) {
    console.error('Klasör yeniden adlandırma hatası:', error);
    res.status(500).json({ success: false, message: 'Klasör yeniden adlandırılırken hata: ' + error.message });
  }
});

router.get('/upload/library', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: targetPath = '/uploads/okullar', type = 'all' } = req.query;
    const result = await fileUploader.listFiles(targetPath, type);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Dosya listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Dosya listesi alınırken hata: ' + error.message });
  }
});

module.exports = router;
