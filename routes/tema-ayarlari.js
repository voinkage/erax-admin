const express = require('express');
const router = express.Router();
const { kullaniciPool: pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Tema ayarlarını getir (admin – Ayarlar sayfası listeleme; öğrenci teması genel.txt'ten)
router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rows: ayarlar } = await pool.query(
      'SELECT * FROM sinif_tema_ayarlari ORDER BY sinif_seviyesi ASC'
    );
    res.json({
      success: true,
      data: ayarlar
    });
  } catch (error) {
    console.error('Tema ayarları getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tema ayarları alınırken bir hata oluştu'
    });
  }
});

// Tema ayarını güncelle
router.put('/:sinif_seviyesi', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { sinif_seviyesi } = req.params;
    const { tema } = req.body;
    if (!tema || !['kids', 'junior', 'teenager'].includes(tema)) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir tema seçilmelidir (kids, junior, teenager)'
      });
    }
    const seviye = parseInt(sinif_seviyesi);
    if (seviye < 1 || seviye > 12) {
      return res.status(400).json({
        success: false,
        message: 'Sınıf seviyesi 1-12 arasında olmalıdır'
      });
    }
    await pool.query(
      'INSERT INTO sinif_tema_ayarlari (sinif_seviyesi, tema) VALUES ($1, $2) ON CONFLICT (sinif_seviyesi) DO UPDATE SET tema = $3',
      [seviye, tema, tema]
    );
    res.json({
      success: true,
      message: 'Tema ayarı başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Tema ayarı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Tema ayarı güncellenirken bir hata oluştu'
    });
  }
});

// Toplu tema ayarı güncelle
router.put('/toplu', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { ayarlar } = req.body;
    if (!Array.isArray(ayarlar)) {
      return res.status(400).json({
        success: false,
        message: 'Ayarlar bir dizi olmalıdır'
      });
    }
    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      for (const ayar of ayarlar) {
        const { sinif_seviyesi, tema } = ayar;
        if (!sinif_seviyesi || !tema || !['kids', 'junior', 'teenager'].includes(tema)) {
          throw new Error(`Geçersiz ayar: ${JSON.stringify(ayar)}`);
        }
        const seviye = parseInt(sinif_seviyesi);
        if (seviye < 1 || seviye > 12) {
          throw new Error(`Geçersiz sınıf seviyesi: ${seviye}`);
        }
        await client.query(
          'INSERT INTO sinif_tema_ayarlari (sinif_seviyesi, tema) VALUES ($1, $2) ON CONFLICT (sinif_seviyesi) DO UPDATE SET tema = $3',
          [seviye, tema, tema]
        );
      }
      await client.query('COMMIT');
      res.json({
        success: true,
        message: 'Tema ayarları başarıyla güncellendi'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Toplu tema ayarı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Tema ayarları güncellenirken bir hata oluştu'
    });
  }
});

module.exports = router;
