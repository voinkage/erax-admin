const { organizasyonPool } = require('../config/database');

/**
 * Dosya taşındığında veritabanındaki referansları günceller (okullar tablosu - ORGANIZASYON_DB)
 */
async function updateFileReferences(oldPath, newPath) {
  let updatedCount = 0;
  try {
    const normalizePath = (path) => {
      if (!path) return null;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        const url = new URL(path);
        return url.pathname;
      }
      return path;
    };
    const normalizedOldPath = normalizePath(oldPath);
    const normalizedNewPath = normalizePath(newPath);
    if (!organizasyonPool) return 0;
    const okullarResult = await organizasyonPool.query(
      `UPDATE okullar SET gorsel = REPLACE(gorsel, $1, $2) WHERE gorsel LIKE $3 OR gorsel LIKE $4`,
      [normalizedOldPath, normalizedNewPath, `%${normalizedOldPath}%`, `%${encodeURIComponent(normalizedOldPath)}%`]
    );
    updatedCount += okullarResult.rowCount;
    if (okullarResult.rowCount > 0) {
      console.log(`[updateFileReferences] Okullar tablosunda ${okullarResult.rowCount} kayıt güncellendi`);
    }
    return updatedCount;
  } catch (error) {
    console.error('[updateFileReferences] Hata:', error);
    throw error;
  }
}

/**
 * Klasör taşındığında veritabanındaki referansları günceller (okullar - ORGANIZASYON_DB)
 */
async function updateFolderReferences(oldFolderPath, newFolderPath) {
  let updatedCount = 0;
  try {
    const normalizePath = (path) => {
      if (!path) return null;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        const url = new URL(path);
        return url.pathname;
      }
      return (path || '').replace(/\/+$/, '');
    };
    const normalizedOldPath = normalizePath(oldFolderPath);
    const normalizedNewPath = normalizePath(newFolderPath);
    if (!organizasyonPool) return 0;
    const okullarResult = await organizasyonPool.query(
      `UPDATE okullar SET gorsel = REPLACE(gorsel, $1, $2) WHERE gorsel LIKE $3 OR gorsel LIKE $4`,
      [normalizedOldPath, normalizedNewPath, `%${normalizedOldPath}%`, `%${encodeURIComponent(normalizedOldPath)}%`]
    );
    updatedCount += okullarResult.rowCount;
    if (okullarResult.rowCount > 0) {
      console.log(`[updateFolderReferences] Okullar tablosunda ${okullarResult.rowCount} kayıt güncellendi`);
    }
    return updatedCount;
  } catch (error) {
    console.error('[updateFolderReferences] Hata:', error);
    throw error;
  }
}

module.exports = {
  updateKullaniciReferences: updateFileReferences,
  updateFileReferences,
  updateFolderReferences
};
