/**
 * Etkinlik medya taşıma/rename sonrası ICERIK_DB referans güncellemesi (soru_secenekleri, etkinlik_sorulari)
 * ICERIK_DB_URL yoksa sessizce 0 döner.
 */
const { icerikPool } = require('../config/database');

async function updateFileReferences(oldPath, newPath) {
  if (!icerikPool) return 0;
  let updatedCount = 0;
  try {
    const normalizePath = (p) => {
      if (!p) return null;
      if (p.startsWith('http://') || p.startsWith('https://')) {
        try { return new URL(p).pathname; } catch { return p; }
      }
      return p;
    };
    const normalizedOldPath = normalizePath(oldPath);
    const normalizedNewPath = normalizePath(newPath);
    const soruSecenekleriResult = await icerikPool.query(
      `UPDATE soru_secenekleri SET secenek_gorseli = REPLACE(secenek_gorseli, $1, $2) WHERE secenek_gorseli LIKE $3 OR secenek_gorseli LIKE $4`,
      [normalizedOldPath, normalizedNewPath, `%${normalizedOldPath}%`, `%${encodeURIComponent(normalizedOldPath)}%`]
    );
    updatedCount += soruSecenekleriResult.rowCount;
    try {
      const etkinlikSorulariResult = await icerikPool.query(
        `UPDATE etkinlik_sorulari SET ses_dosyasi = REPLACE(ses_dosyasi, $1, $2), gorsel = REPLACE(gorsel, $3, $4) WHERE ses_dosyasi LIKE $5 OR ses_dosyasi LIKE $6 OR gorsel LIKE $7 OR gorsel LIKE $8`,
        [normalizedOldPath, normalizedNewPath, normalizedOldPath, normalizedNewPath, `%${normalizedOldPath}%`, `%${encodeURIComponent(normalizedOldPath)}%`, `%${normalizedOldPath}%`, `%${encodeURIComponent(normalizedOldPath)}%`]
      );
      updatedCount += etkinlikSorulariResult.rowCount;
    } catch (_) {
      // alan yoksa atla
    }
    if (updatedCount > 0) console.log(`[updateFileReferencesEtkinlik] ${updatedCount} kayıt güncellendi`);
    return updatedCount;
  } catch (error) {
    console.error('[updateFileReferencesEtkinlik] Hata:', error.message);
    return 0;
  }
}

async function updateFolderReferences(oldFolderPath, newFolderPath) {
  if (!icerikPool) return 0;
  let updatedCount = 0;
  try {
    const normalizePath = (p) => {
      if (!p) return null;
      if (p.startsWith('http://') || p.startsWith('https://')) {
        try { return new URL(p).pathname; } catch { return p; }
      }
      return (p || '').replace(/\/+$/, '');
    };
    const normalizedOldPath = normalizePath(oldFolderPath);
    const normalizedNewPath = normalizePath(newFolderPath);
    const soruSecenekleriResult = await icerikPool.query(
      `UPDATE soru_secenekleri SET secenek_gorseli = REPLACE(secenek_gorseli, $1, $2) WHERE secenek_gorseli LIKE $3 OR secenek_gorseli LIKE $4`,
      [normalizedOldPath, normalizedNewPath, `%${normalizedOldPath}%`, `%${encodeURIComponent(normalizedOldPath)}%`]
    );
    updatedCount += soruSecenekleriResult.rowCount;
    if (updatedCount > 0) console.log(`[updateFolderReferencesEtkinlik] ${updatedCount} kayıt güncellendi`);
    return updatedCount;
  } catch (error) {
    console.error('[updateFolderReferencesEtkinlik] Hata:', error.message);
    return 0;
  }
}

module.exports = { updateFileReferences, updateFolderReferences };
