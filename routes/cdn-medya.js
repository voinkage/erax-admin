/**
 * CDN Medya – website/kod (genel.txt, logolar, dock-siralamasi), website/fonts için listele, yükle, sil, yeniden adlandır
 * İzin verilen path'ler: website, website/kod, website/kod/logolar, website/kod/dock-siralamasi, website/fonts
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const fileUploader = require('../utils/fileUploader');

const ALLOWED_PATHS = ['website', 'website/kod', 'website/kod/logolar', 'website/kod/icon', 'website/kod/dock-siralamasi', 'website/fonts', 'website/rozetler'];

function isPathAllowed(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const clean = targetPath.replace(/^\/+/, '').replace(/\\/g, '/');
  return ALLOWED_PATHS.some(allowed => clean === allowed || clean.startsWith(allowed + '/'));
}

const memoryStorage = multer.memoryStorage();
const uploadMw = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => { cb(null, true); }
});

router.get('/list', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const folderPath = (req.query.path || '').trim().replace(/^\/+/, '');
  if (!isPathAllowed(folderPath)) {
    return res.status(400).json({
      success: false,
      message: 'İzin verilen path: website/kod, website/kod/logolar, website/kod/icon, website/kod/dock-siralamasi, website/fonts, website/rozetler (ve alt klasörleri)'
    });
  }
  try {
    const data = await fileUploader.listFiles(folderPath, 'all');
    const result = data && typeof data === 'object' ? data : { folders: [], files: [] };
    return res.json({ success: true, data: result });
  } catch (err) {
    if (folderPath === 'website/fonts') {
      return res.json({ success: true, data: { folders: [], files: [] } });
    }
    console.error('CDN medya list hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Klasör okunamadı',
      data: { folders: [], files: [] }
    });
  }
});

router.post('/upload', authenticateToken, authorizeRoles('admin'), uploadMw.single('file'), async (req, res) => {
  try {
    const folderPath = (req.body.path || req.body.folderPath || '').trim().replace(/^\/+/, '');
    if (!isPathAllowed(folderPath)) {
      return res.status(400).json({
        success: false,
        message: 'İzin verilen path: website/kod, website/kod/logolar, website/kod/icon, website/kod/dock-siralamasi, website/fonts, website/rozetler (ve alt klasörleri)'
      });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Dosya yüklenemedi veya dosya boş'
      });
    }
    const filename = (req.body.filename || req.file.originalname || 'file').trim();
    const safeName = path.basename(filename).replace(/[^\w.\u00C0-\u024F\u0400-\u04FF-]/gi, '_') || 'file';
    const remotePath = `${folderPath}/${safeName}`;
    const publicUrl = await fileUploader.uploadFile(req.file.buffer, remotePath);
    if (folderPath === 'website' || folderPath.startsWith('website/')) {
      if (typeof fileUploader.purgeCache === 'function') {
        fileUploader.purgeCache(publicUrl).catch(() => {});
      }
      if (folderPath.startsWith('website/kod')) {
        if (typeof fileUploader.purgeWebsiteCache === 'function') {
          fileUploader.purgeWebsiteCache().then((r) => {
            if (r && (r.purged > 0 || r.failed > 0)) {
              console.log('CDN website/kod purge:', r.purged, 'purged,', r.failed, 'failed');
            }
          }).catch((err) => console.warn('CDN website/kod purge hatası:', err.message));
        }
      }
    }
    return res.json({
      success: true,
      message: 'Dosya yüklendi',
      data: { url: publicUrl, path: remotePath, name: safeName }
    });
  } catch (err) {
    console.error('CDN medya upload hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Yükleme başarısız'
    });
  }
});

/** Liderlik tablosu JSON'u anında güncelle (admin panelinden tetiklenir) */
router.post('/refresh-leaderboard', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    if (typeof fileUploader.refreshLeaderboardCdn !== 'function') {
      return res.status(503).json({
        success: false,
        message: 'Liderlik tablosu güncellemesi bu ortamda kullanılamıyor (USE_BUNNYCDN gerekli)'
      });
    }
    const result = await fileUploader.refreshLeaderboardCdn();
    return res.json(result || { success: false });
  } catch (err) {
    console.error('CDN refresh-leaderboard hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Liderlik tablosu güncellenirken hata oluştu'
    });
  }
});

router.post('/purge-cache', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    if (typeof fileUploader.purgeWebsiteCache !== 'function') {
      return res.json({
        success: true,
        message: 'CDN purge bu ortamda kullanılmıyor',
        data: { purged: 0, failed: 0 }
      });
    }
    const result = await fileUploader.purgeWebsiteCache();
    return res.json({
      success: true,
      message: `CDN önbelleği temizlendi (${result.purged} URL)`,
      data: result
    });
  } catch (err) {
    console.error('CDN purge-cache hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Önbellek temizlenemedi'
    });
  }
});

router.delete('/file', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const filePath = (req.body.path || '').trim().replace(/^\/+/, '');
    if (!isPathAllowed(filePath)) {
      return res.status(400).json({
        success: false,
        message: 'Bu path için silme izni yok'
      });
    }
    const ok = await fileUploader.deleteFile(filePath);
    return res.json({
      success: !!ok,
      message: ok ? 'Dosya silindi' : 'Silinemedi'
    });
  } catch (err) {
    console.error('CDN medya delete hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Silme başarısız'
    });
  }
});

router.put('/rename', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const filePath = (req.body.path || '').trim().replace(/^\/+/, '');
    const newName = (req.body.newName || '').trim();
    if (!isPathAllowed(filePath)) {
      return res.status(400).json({
        success: false,
        message: 'Bu path için yeniden adlandırma izni yok'
      });
    }
    if (!newName) {
      return res.status(400).json({
        success: false,
        message: 'newName gerekli'
      });
    }
    const safeName = path.basename(newName).replace(/[^\w.\u00C0-\u024F\u0400-\u04FF-]/gi, '_') || newName;
    const newPath = await fileUploader.renameFile(filePath, safeName);
    return res.json({
      success: !!newPath,
      message: newPath ? 'Yeniden adlandırıldı' : 'Yeniden adlandırılamadı',
      data: newPath ? { path: newPath } : null
    });
  } catch (err) {
    console.error('CDN medya rename hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Yeniden adlandırma başarısız'
    });
  }
});

/** Mevcut path altında yeni klasör oluştur */
router.post('/folder', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const dirPath = (req.body.path || req.body.dirPath || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const folderName = (req.body.folderName || req.body.name || '').trim().replace(/[/\\]/g, '');
    if (!dirPath || !folderName) {
      return res.status(400).json({
        success: false,
        message: 'path ve folderName gerekli'
      });
    }
    if (!isPathAllowed(dirPath)) {
      return res.status(400).json({
        success: false,
        message: 'Bu path için klasör oluşturma izni yok'
      });
    }
    const newFolderPath = dirPath ? `${dirPath}/${folderName}` : folderName;
    if (!isPathAllowed(newFolderPath)) {
      return res.status(400).json({
        success: false,
        message: 'Oluşturulacak klasör path\'i izin listesine uymalı'
      });
    }
    const created = await fileUploader.createFolder(dirPath, folderName);
    return res.json({
      success: !!created,
      message: created ? 'Klasör oluşturuldu' : 'Klasör oluşturulamadı',
      data: created ? { path: newFolderPath } : null
    });
  } catch (err) {
    console.error('CDN medya folder hatası:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Klasör oluşturulamadı'
    });
  }
});

module.exports = router;
