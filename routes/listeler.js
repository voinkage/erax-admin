/**
 * Listeler - Aktivasyon kod listelerini CDN /listeler klasörüne yükleme, listeleme, silme, yeniden adlandırma
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const fileUploader = require('../utils/fileUploader');

const LISTELER_CDN_DIR = 'listeler';
const memoryStorage = multer.memoryStorage();
const LISTELER_REMOTE_DIR = '/listeler';
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

const uploadListe = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Sadece PDF veya Excel (.xlsx) dosyaları yüklenebilir'), false);
  },
  limits: { fileSize: MAX_FILE_SIZE }
});

function sanitizeListeAdi(name) {
  if (!name || typeof name !== 'string') return 'liste';
  return name.trim().replace(/[^\w\u00C0-\u024F\u0400-\u04FF\s-]/gi, '').replace(/\s+/g, '_').slice(0, 100) || 'liste';
}

router.post('/upload', authenticateToken, authorizeRoles('admin'), uploadListe.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Dosya yüklenemedi veya dosya boş' });
    }
    const listeAdi = sanitizeListeAdi(req.body.liste_adi || req.body.listeAdi || '');
    const ext = path.extname(req.file.originalname).toLowerCase() || (req.file.mimetype === 'application/pdf' ? '.pdf' : '.xlsx');
    const safeExt = ['.pdf', '.xlsx', '.xls'].includes(ext) ? ext : '.xlsx';
    const filename = `${listeAdi}${safeExt}`;
    const remoteFilePath = `${LISTELER_REMOTE_DIR}/${filename}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remoteFilePath);
    return res.json({
      success: true,
      message: 'Liste CDN\'e yüklendi',
      data: { url: publicUrl, path: remoteFilePath, filename, liste_adi: listeAdi }
    });
  } catch (error) {
    console.error('Liste yükleme hatası:', error);
    return res.status(500).json({ success: false, message: error.message || 'Liste yüklenirken hata oluştu' });
  }
});

router.get('/list-cdn', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const data = await fileUploader.listFiles(LISTELER_CDN_DIR, 'all');
    return res.json({
      success: true,
      data: data && typeof data === 'object' ? data : { folders: [], files: [] }
    });
  } catch (err) {
    console.error('Liste listesi CDN hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Liste klasörü okunamadı',
      data: { folders: [], files: [] }
    });
  }
});

router.delete('/delete-cdn', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: filePath } = req.body || {};
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, message: 'path gerekli' });
    }
    const ok = await fileUploader.deleteFile(filePath.trim());
    return res.json({ success: !!ok, message: ok ? 'Dosya silindi' : 'Silinemedi' });
  } catch (err) {
    console.error('Liste silme CDN hatası:', err);
    return res.status(500).json({ success: false, message: err.message || 'Silme işlemi başarısız' });
  }
});

router.put('/rename-cdn', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { path: filePath, newName } = req.body || {};
    if (!filePath || typeof filePath !== 'string' || !newName || typeof newName !== 'string') {
      return res.status(400).json({ success: false, message: 'path ve newName gerekli' });
    }
    const trimmedName = newName.trim().replace(/[^\w\u00C0-\u024F\u0400-\u04FF.\s-]/gi, '').replace(/\s+/g, '_') || newName.trim();
    if (!trimmedName) return res.status(400).json({ success: false, message: 'Geçerli bir dosya adı girin' });
    const newPath = await fileUploader.renameFile(filePath.trim(), trimmedName);
    return res.json({
      success: !!newPath,
      message: newPath ? 'Yeniden adlandırıldı' : 'Yeniden adlandırılamadı',
      data: newPath ? { path: newPath } : null
    });
  } catch (err) {
    console.error('Liste yeniden adlandırma CDN hatası:', err);
    return res.status(500).json({ success: false, message: err.message || 'Yeniden adlandırma başarısız' });
  }
});

module.exports = router;
