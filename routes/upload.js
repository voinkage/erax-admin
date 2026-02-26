/**
 * Medya kütüphanesi – etkinlik/kitaplar upload (library, file, folder, ses, gorsel, baloncuk)
 * Aynı storage (Bunny/UPLOAD_URL) kullanılmalı; ICERIK_DB opsiyonel (taşıma sonrası referans güncellemesi).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const fileUploader = require('../utils/fileUploader');
const { updateFileReferences, updateFolderReferences } = require('../utils/updateFileReferencesEtkinlik');

const memoryStorage = multer.memoryStorage();
const sesFilter = (req, file, cb) => {
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac'];
  cb(allowed.includes(file.mimetype) ? null : new Error('Sadece ses dosyaları'), allowed.includes(file.mimetype));
};
const gorselFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  cb(allowed.includes(file.mimetype) ? null : new Error('Sadece görsel'), allowed.includes(file.mimetype));
};
const uploadSes = multer({ storage: memoryStorage, fileFilter: sesFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadGorsel = multer({ storage: memoryStorage, fileFilter: gorselFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const BALONCUK_MAX = 250 * 1024;
const uploadBaloncukGorsel = multer({ storage: memoryStorage, fileFilter: gorselFilter, limits: { fileSize: BALONCUK_MAX } });
const uploadAny = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/');
    cb(ok ? null : new Error('Sadece görsel veya ses'), ok);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

/** Güvenli dosya adı: path/.. kaldırılır, boşsa 'file' kullanılır */
function sanitizeFilename(originalname) {
  const base = path.basename(originalname || '').replace(/\.\./g, '').trim();
  if (!base) return 'file';
  const ext = path.extname(base);
  const name = path.basename(base, ext) || 'file';
  return (name.slice(0, 200) + ext).replace(/[<>:"|?*\x00-\x1f]/g, '_');
}

/** Orijinal dosya adını kullanır (aynı isimle yükleme aynı klasörde üzerine yazar) */
function makeFilename(originalname) {
  return sanitizeFilename(originalname);
}

router.post('/ses/:etkinlikAdi', authenticateToken, authorizeRoles('admin', 'ogretmen'), uploadSes.single('ses'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi' });
    const filename = makeFilename(req.file.originalname);
    const remoteFilePath = `/uploads/etkinlikler/${req.params.etkinlikAdi}/ses/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    res.json({
      success: true,
      message: 'Ses dosyası başarıyla yüklendi',
      data: { path: remoteFilePath, url: publicUrl, filename, originalname: req.file.originalname, size: req.file.size }
    });
  } catch (error) {
    console.error('Ses yükleme hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Ses yüklenirken hata oluştu' });
  }
});

router.post('/gorsel/:etkinlikAdi', authenticateToken, authorizeRoles('admin', 'ogretmen'), uploadGorsel.single('gorsel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi' });
    const filename = makeFilename(req.file.originalname);
    const remoteFilePath = `/uploads/etkinlikler/${req.params.etkinlikAdi}/gorseller/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    res.json({
      success: true,
      message: 'Görsel başarıyla yüklendi',
      data: { path: remoteFilePath, url: publicUrl, filename, originalname: req.file.originalname, size: req.file.size }
    });
  } catch (error) {
    console.error('Görsel yükleme hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Görsel yüklenirken hata oluştu' });
  }
});

router.post('/baloncuk-gorsel', authenticateToken, authorizeRoles('admin', 'ogretmen'), uploadBaloncukGorsel.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi' });
    const filename = makeFilename(req.file.originalname);
    const remoteFilePath = `/uploads/baloncuklar/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    res.json({
      success: true,
      message: 'Baloncuk görseli yüklendi',
      data: { path: remoteFilePath, url: publicUrl, filename, originalname: req.file.originalname, size: req.file.size }
    });
  } catch (error) {
    console.error('Baloncuk yükleme hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Baloncuk yüklenirken hata oluştu' });
  }
});

router.post('/file', authenticateToken, authorizeRoles('admin', 'ogretmen'), uploadAny.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yüklenemedi' });
    const targetPath = (req.body.path || '/uploads/etkinlikler').trim();
    const type = (req.body.type || 'all').trim();
    const filename = makeFilename(req.file.originalname);
    const remoteFilePath = `${targetPath}/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    const isImage = req.file.mimetype.startsWith('image/');
    const isAudio = req.file.mimetype.startsWith('audio/');
    res.json({
      success: true,
      message: 'Dosya başarıyla yüklendi',
      data: {
        path: remoteFilePath,
        url: publicUrl,
        filename,
        originalname: req.file.originalname,
        size: req.file.size,
        type: isImage ? 'image' : isAudio ? 'audio' : 'other'
      }
    });
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Dosya yüklenirken hata oluştu' });
  }
});

router.delete('/file', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const filePath = req.body.path;
    if (!filePath) return res.status(400).json({ success: false, message: 'Dosya yolu gereklidir' });
    const deleted = await fileUploader.deleteFile(filePath);
    res.json({ success: !!deleted, message: deleted ? 'Dosya başarıyla silindi' : 'Dosya silinemedi' });
  } catch (error) {
    console.error('Dosya silme hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Dosya silinirken hata oluştu' });
  }
});

router.post('/move', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    if (!sourcePath || !targetPath) return res.status(400).json({ success: false, message: 'Kaynak ve hedef yol gereklidir' });
    const moved = await fileUploader.moveFile(sourcePath, targetPath);
    if (moved) {
      try { await updateFileReferences(sourcePath, targetPath); } catch (e) { console.error('[move] updateFileReferences:', e.message); }
      res.json({ success: true, message: 'Dosya başarıyla taşındı' });
    } else {
      res.status(500).json({ success: false, message: 'Dosya taşınamadı' });
    }
  } catch (error) {
    console.error('Dosya taşıma hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Dosya taşınırken hata oluştu' });
  }
});

router.post('/rename', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { path: filePath, newName } = req.body;
    if (!filePath || !newName) return res.status(400).json({ success: false, message: 'Dosya yolu ve yeni ad gereklidir' });
    const renamed = await fileUploader.renameFile(filePath, newName);
    res.json(renamed
      ? { success: true, message: 'Dosya yeniden adlandırıldı', data: { newPath: renamed } }
      : { success: false, message: 'Dosya yeniden adlandırılamadı' });
  } catch (error) {
    console.error('Dosya yeniden adlandırma hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Yeniden adlandırılırken hata oluştu' });
  }
});

router.post('/folder', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { path: dirPath, folderName } = req.body;
    if (!dirPath || !folderName) return res.status(400).json({ success: false, message: 'Klasör yolu ve adı gereklidir' });
    const created = await fileUploader.createFolder(dirPath, folderName);
    res.json({ success: !!created, message: created ? 'Klasör oluşturuldu' : 'Klasör oluşturulamadı' });
  } catch (error) {
    console.error('Klasör oluşturma hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Klasör oluşturulurken hata oluştu' });
  }
});

router.delete('/folder', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const folderPath = req.body.path;
    if (!folderPath) return res.status(400).json({ success: false, message: 'Klasör yolu gereklidir' });
    const deleted = await fileUploader.deleteFolder(folderPath);
    res.json({ success: !!deleted, message: deleted ? 'Klasör silindi' : 'Klasör silinemedi' });
  } catch (error) {
    console.error('Klasör silme hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Klasör silinirken hata oluştu' });
  }
});

router.post('/move-folder', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    if (!sourcePath || !targetPath) return res.status(400).json({ success: false, message: 'Kaynak ve hedef yol gereklidir' });
    const moved = await fileUploader.moveFolder(sourcePath, targetPath);
    if (moved) {
      try { await updateFolderReferences(sourcePath, targetPath); } catch (e) { console.error('[move-folder] updateFolderReferences:', e.message); }
      res.json({ success: true, message: 'Klasör taşındı' });
    } else {
      res.status(500).json({ success: false, message: 'Klasör taşınamadı' });
    }
  } catch (error) {
    console.error('Klasör taşıma hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Klasör taşınırken hata oluştu' });
  }
});

router.post('/rename-folder', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { path: folderPath, newName } = req.body;
    if (!folderPath || !newName) return res.status(400).json({ success: false, message: 'Klasör yolu ve yeni ad gereklidir' });
    const renamed = await fileUploader.renameFolder(folderPath, newName);
    res.json(renamed
      ? { success: true, message: 'Klasör yeniden adlandırıldı', data: { newPath: renamed } }
      : { success: false, message: 'Klasör yeniden adlandırılamadı' });
  } catch (error) {
    console.error('Klasör yeniden adlandırma hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Yeniden adlandırılırken hata oluştu' });
  }
});

router.get('/library', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const targetPath = (req.query.path || '/uploads/etkinlikler').trim();
    const type = (req.query.type || 'all').trim();
    const result = await fileUploader.listFiles(targetPath, type);
    res.json({ success: true, data: result || { folders: [], files: [] } });
  } catch (error) {
    console.error('Dosya listesi hatası:', error);
    res.status(500).json({ success: false, message: error.message || 'Dosya listesi alınamadı' });
  }
});

module.exports = router;
