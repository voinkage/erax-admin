const express = require('express');
const router = express.Router();
const { kullaniciPool: pool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Tüm rozet ayarlarını listele (Herkes görebilir - authenticated)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { rol } = req.query;

    let query = 'SELECT * FROM rozet_ayarlari WHERE durum = $1';
    const params = ['aktif'];

    if (rol) {
      query += ` AND rol = $${params.length + 1}`;
      params.push(rol);
    }

    query += ' ORDER BY rol, sira ASC';

    const { rows: rozetler } = await pool.query(query, params);

    res.json({
      success: true,
      data: rozetler
    });
  } catch (error) {
    console.error('Rozet ayarları listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Rozet ayarları listelenirken bir hata oluştu'
    });
  }
});

// Belirli bir rozet ayarını getir
router.get('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: rozetler } = await pool.query(
      'SELECT * FROM rozet_ayarlari WHERE id = $1',
      [id]
    );

    if (rozetler.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rozet ayarı bulunamadı'
      });
    }

    res.json({
      success: true,
      data: rozetler[0]
    });
  } catch (error) {
    console.error('Rozet ayarı getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Rozet ayarı getirilirken bir hata oluştu'
    });
  }
});

// Yeni rozet ayarı ekle
router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rol, seviye, ad, gorsel_url, min_puan, max_puan, renk, emoji, sira, durum } = req.body;

    if (!rol || !seviye || !ad || !gorsel_url || min_puan === undefined || max_puan === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Rol, seviye, ad, görsel URL, min puan ve max puan gereklidir'
      });
    }

    if (seviye < 1 || seviye > 10) {
      return res.status(400).json({
        success: false,
        message: 'Seviye 1-10 arasında olmalıdır'
      });
    }

    if (min_puan >= max_puan) {
      return res.status(400).json({
        success: false,
        message: 'Min puan max puandan küçük olmalıdır'
      });
    }

    const { rows: mevcut } = await pool.query(
      'SELECT id FROM rozet_ayarlari WHERE rol = $1 AND seviye = $2',
      [rol, seviye]
    );

    if (mevcut.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu rol ve seviye için zaten bir rozet ayarı mevcut'
      });
    }

    const { rows: result } = await pool.query(
      'INSERT INTO rozet_ayarlari (rol, seviye, ad, gorsel_url, min_puan, max_puan, renk, emoji, sira, durum) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [rol, seviye, ad, gorsel_url, min_puan, max_puan, renk || '#94a3b8', emoji || '🌱', sira || seviye, durum || 'aktif']
    );

    res.status(201).json({
      success: true,
      message: 'Rozet ayarı başarıyla eklendi',
      data: { id: result[0].id }
    });
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Bu rozet ayarı zaten mevcut'
      });
    }
    console.error('Rozet ayarı ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Rozet ayarı eklenirken bir hata oluştu'
    });
  }
});

// Rozet ayarını güncelle
router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rol, seviye, ad, gorsel_url, min_puan, max_puan, renk, emoji, sira, durum } = req.body;

    const { rows: mevcut } = await pool.query(
      'SELECT * FROM rozet_ayarlari WHERE id = $1',
      [id]
    );

    if (mevcut.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rozet ayarı bulunamadı'
      });
    }

    if (min_puan !== undefined && max_puan !== undefined && min_puan >= max_puan) {
      return res.status(400).json({
        success: false,
        message: 'Min puan max puandan küçük olmalıdır'
      });
    }

    if (rol && seviye) {
      const { rows: duplicate } = await pool.query(
        'SELECT id FROM rozet_ayarlari WHERE rol = $1 AND seviye = $2 AND id != $3',
        [rol, seviye, id]
      );
      if (duplicate.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu rol ve seviye için zaten başka bir rozet ayarı mevcut'
        });
      }
    }

    const updateFields = [];
    const updateParams = [];
    if (rol !== undefined) { updateFields.push(`rol = $${updateParams.length + 1}`); updateParams.push(rol); }
    if (seviye !== undefined) { updateFields.push(`seviye = $${updateParams.length + 1}`); updateParams.push(seviye); }
    if (ad !== undefined) { updateFields.push(`ad = $${updateParams.length + 1}`); updateParams.push(ad); }
    if (gorsel_url !== undefined) { updateFields.push(`gorsel_url = $${updateParams.length + 1}`); updateParams.push(gorsel_url); }
    if (min_puan !== undefined) { updateFields.push(`min_puan = $${updateParams.length + 1}`); updateParams.push(min_puan); }
    if (max_puan !== undefined) { updateFields.push(`max_puan = $${updateParams.length + 1}`); updateParams.push(max_puan); }
    if (renk !== undefined) { updateFields.push(`renk = $${updateParams.length + 1}`); updateParams.push(renk); }
    if (emoji !== undefined) { updateFields.push(`emoji = $${updateParams.length + 1}`); updateParams.push(emoji); }
    if (sira !== undefined) { updateFields.push(`sira = $${updateParams.length + 1}`); updateParams.push(sira); }
    if (durum !== undefined) { updateFields.push(`durum = $${updateParams.length + 1}`); updateParams.push(durum); }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Güncellenecek alan belirtilmedi'
      });
    }
    updateParams.push(id);
    await pool.query(
      `UPDATE rozet_ayarlari SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    res.json({
      success: true,
      message: 'Rozet ayarı başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Rozet ayarı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Rozet ayarı güncellenirken bir hata oluştu'
    });
  }
});

// Rozet ayarını sil
router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(
      'DELETE FROM rozet_ayarlari WHERE id = $1',
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rozet ayarı bulunamadı'
      });
    }
    res.json({
      success: true,
      message: 'Rozet ayarı başarıyla silindi'
    });
  } catch (error) {
    console.error('Rozet ayarı silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Rozet ayarı silinirken bir hata oluştu'
    });
  }
});

// Toplu güncelleme
router.put('/toplu/guncelle', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rozetler } = req.body;
    if (!Array.isArray(rozetler) || rozetler.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rozet listesi gereklidir'
      });
    }
    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      for (const rozet of rozetler) {
        const { id, rol, seviye, ad, gorsel_url, min_puan, max_puan, renk, emoji, sira, durum } = rozet;
        if (!id) throw new Error('Rozet ID gereklidir');
        if (min_puan >= max_puan) throw new Error(`Rozet ${id}: Min puan max puandan küçük olmalıdır`);
        await client.query(
          'UPDATE rozet_ayarlari SET rol = $1, seviye = $2, ad = $3, gorsel_url = $4, min_puan = $5, max_puan = $6, renk = $7, emoji = $8, sira = $9, durum = $10 WHERE id = $11',
          [rol, seviye, ad, gorsel_url, min_puan, max_puan, renk || '#94a3b8', emoji || '🌱', sira || seviye, durum || 'aktif', id]
        );
      }
      await client.query('COMMIT');
      res.json({
        success: true,
        message: `${rozetler.length} rozet ayarı başarıyla güncellendi`
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Toplu rozet güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Rozet ayarları güncellenirken bir hata oluştu'
    });
  }
});

module.exports = router;
