/**
 * Özel işlemler – OZEL_ISLEM_KEY ile korunan, riskli/admin işlemleri
 * Örn: herkesin puanını sıfırlama
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

/** Herkesin puanını sıfırla: body.ozel_islem_key === process.env.OZEL_ISLEM_KEY olmalı; sonra kullanici backend internal reset çağrılır */
router.post('/reset-all-puan', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const ozelKey = req.body && (req.body.ozel_islem_key != null) ? String(req.body.ozel_islem_key).trim() : '';
    const envKey = process.env.OZEL_ISLEM_KEY;
    if (!envKey || ozelKey !== envKey) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz veya eksik özel işlem anahtarı. .env dosyasındaki OZEL_ISLEM_KEY değerini girmelisiniz.'
      });
    }
    const base = (process.env.KULLANICI_BACKEND_URL || '').replace(/\/+$/, '');
    const secret = process.env.LIDERLIK_EXPORT_SECRET;
    if (!base || !secret) {
      return res.status(500).json({
        success: false,
        message: 'Sunucu yapılandırması eksik (KULLANICI_BACKEND_URL, LIDERLIK_EXPORT_SECRET).'
      });
    }
    const r = await axios.post(`${base}/api/puanlar/internal/reset-all`, {}, {
      headers: { 'X-Internal-Secret': secret },
      timeout: 30000
    });
    return res.json(r.data || { success: true });
  } catch (err) {
    const msg = err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : (err.message || 'Puanlar sıfırlanırken hata oluştu');
    console.error('Özel işlem reset-all-puan hatası:', err);
    return res.status(err.response && err.response.status ? err.response.status : 500).json({
      success: false,
      message: msg
    });
  }
});

module.exports = router;
