/**
 * ETKİNLİK SİHİRBAZI – Admin backend (erax-admin)
 * Etkinlikler + sorular CRUD. Cevaplar/puanlar eradil-etkinlik'te kalır.
 * Soru türü validasyonu: routes/soru-turleri modülü.
 */
const express = require('express');
const router = express.Router();
const { icerikPool: pool, organizasyonPool, seviyePool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateSoruEkle, validateSoruGuncelle } = require('./soru-turleri');

// Admin: etkinlik listesi (sadece admin; öğrenci/öğretmen listesi eradil-etkinlik'ten)
router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    let paramIndex = 1;
    const { kategori } = req.query;
    let query = `SELECT etkinlikler.*, (SELECT COUNT(*)::int FROM etkinlik_sorulari WHERE etkinlik_id = etkinlikler.id) AS soru_sayisi FROM etkinlikler WHERE 1=1`;
    const params = [];
    if (kategori) {
      query += ` AND (ana_kategori = $${paramIndex} OR (ana_kategori IS NULL AND kategori = $${paramIndex + 1}))`;
      params.push(kategori, kategori);
    }
    query += ' ORDER BY olusturma_tarihi DESC';

    const { rows: etkinlikler } = await pool.query(query, params);
    res.json({ success: true, data: etkinlikler });
  } catch (error) {
    console.error('Etkinlik listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Etkinlikler listelenirken bir hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Etkinlik ekle
router.post('/', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { ad, aciklama, kategori, sinif_seviyesi, durum, toplam_puan, toplam_yildiz, gorsel_yolu, ses_ikonu_gorsel, ilerleme_butonu_gorsel, geri_butonu_gorsel, tam_ekran_butonu_gorsel, kucuk_ekran_butonu_gorsel, dogru_tik_gorsel } = req.body;

    if (!ad) {
      return res.status(400).json({ success: false, message: 'Etkinlik adı gereklidir' });
    }
    if (!sinif_seviyesi) {
      return res.status(400).json({ success: false, message: 'Sınıf seviyesi gereklidir' });
    }

    const userRol = req.user.rol || req.user.role;
    const iconVal = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : null;
    const result = await pool.query(
      `INSERT INTO etkinlikler (ad, aciklama, kategori, sinif_seviyesi, olusturan_id, olusturan_rol, durum, tur, toplam_puan, toplam_yildiz, gorsel_yolu, ses_ikonu_gorsel, ilerleme_butonu_gorsel, geri_butonu_gorsel, tam_ekran_butonu_gorsel, kucuk_ekran_butonu_gorsel, dogru_tik_gorsel) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [ad, aciklama || null, kategori || null, sinif_seviyesi, req.user.id, userRol, durum || 'aktif', null, toplam_puan || null, toplam_yildiz || null, gorsel_yolu || null, iconVal(ses_ikonu_gorsel), iconVal(ilerleme_butonu_gorsel), iconVal(geri_butonu_gorsel), iconVal(tam_ekran_butonu_gorsel), iconVal(kucuk_ekran_butonu_gorsel), iconVal(dogru_tik_gorsel)]
    );

    res.status(201).json({
      success: true,
      message: 'Etkinlik başarıyla oluşturuldu',
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    console.error('Etkinlik ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Etkinlik eklenirken bir hata oluştu'
    });
  }
});

// Etkinlik güncelle
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { ad, aciklama, kategori, sinif_seviyesi, durum, toplam_puan, toplam_yildiz, gorsel_yolu, ses_ikonu_gorsel, ilerleme_butonu_gorsel, geri_butonu_gorsel, tam_ekran_butonu_gorsel, kucuk_ekran_butonu_gorsel, dogru_tik_gorsel } = req.body;

    const { rows: etkinlikler } = await pool.query(
      'SELECT olusturan_id, olusturan_rol FROM etkinlikler WHERE id = $1',
      [id]
    );

    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }

    const etkinlik = etkinlikler[0];
    const userRol = req.user.rol || req.user.role;
    if (userRol !== 'admin' && etkinlik.olusturan_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu etkinliği düzenleme yetkiniz yok' });
    }

    const iconVal = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : null;
    await pool.query(
      'UPDATE etkinlikler SET ad = $1, aciklama = $2, kategori = $3, sinif_seviyesi = $4, durum = $5, toplam_puan = $6, toplam_yildiz = $7, gorsel_yolu = $8, ses_ikonu_gorsel = $9, ilerleme_butonu_gorsel = $10, geri_butonu_gorsel = $11, tam_ekran_butonu_gorsel = $12, kucuk_ekran_butonu_gorsel = $13, dogru_tik_gorsel = $14 WHERE id = $15',
      [ad, aciklama, kategori || null, sinif_seviyesi, durum, toplam_puan || null, toplam_yildiz || null, gorsel_yolu ?? null, iconVal(ses_ikonu_gorsel), iconVal(ilerleme_butonu_gorsel), iconVal(geri_butonu_gorsel), iconVal(tam_ekran_butonu_gorsel), iconVal(kucuk_ekran_butonu_gorsel), iconVal(dogru_tik_gorsel), id]
    );

    if (toplam_puan) {
      await dagitPuanlari(id);
    }

    res.json({ success: true, message: 'Etkinlik başarıyla güncellendi' });
  } catch (error) {
    console.error('Etkinlik güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Etkinlik güncellenirken bir hata oluştu'
    });
  }
});

// Etkinlik sil
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: etkinlikler } = await pool.query(
      'SELECT olusturan_id, olusturan_rol FROM etkinlikler WHERE id = $1',
      [id]
    );

    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }

    const etkinlik = etkinlikler[0];
    const userRol = req.user.rol || req.user.role;
    if (userRol !== 'admin' && etkinlik.olusturan_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu etkinliği silme yetkiniz yok' });
    }

    const etkinlikIdNum = parseInt(id, 10);

    if (seviyePool) {
      try {
        await seviyePool.query(
          'DELETE FROM soru_cevaplari WHERE cevap_id IN (SELECT id FROM ogrenci_etkinlik_cevaplari WHERE etkinlik_id = $1)',
          [etkinlikIdNum]
        );
        await seviyePool.query(
          'DELETE FROM ogrenci_etkinlik_cevaplari WHERE etkinlik_id = $1',
          [etkinlikIdNum]
        );
      } catch (seviyeErr) {
        console.warn('Etkinlik silerken seviye db temizliği:', seviyeErr.message);
      }
    }

    await pool.query(
      'DELETE FROM soru_secenekleri WHERE soru_id IN (SELECT id FROM etkinlik_sorulari WHERE etkinlik_id = $1)',
      [etkinlikIdNum]
    );
    await pool.query('DELETE FROM etkinlik_sorulari WHERE etkinlik_id = $1', [etkinlikIdNum]);
    await pool.query('DELETE FROM etkinlikler WHERE id = $1', [etkinlikIdNum]);

    res.json({ success: true, message: 'Etkinlik başarıyla silindi' });
  } catch (error) {
    console.error('Etkinlik silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Etkinlik silinirken bir hata oluştu'
    });
  }
});

// Admin: etkinlik önizleme (sadece admin; öğrenci/öğretmen detay eradil-etkinlik'ten)
router.get('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: etkinlikler } = await pool.query(
      'SELECT * FROM etkinlikler WHERE id = $1',
      [id]
    );

    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }

    const { rows: sorularRaw } = await pool.query(
      `SELECT es.* FROM etkinlik_sorulari es WHERE es.etkinlik_id = $1 ORDER BY es.soru_numarasi`,
      [id]
    );

    const sorular = await Promise.all(sorularRaw.map(async (soru) => {
      const { rows: seceneklerRaw } = await pool.query(
        `SELECT so.id, so.secenek_metni, so.secenek_gorseli, so.secenek_rengi, so.secenek_ses_dosyasi, so.kategori, so.dogru_cevap, so.siralama
         FROM soru_secenekleri so WHERE so.soru_id = $1 ORDER BY so.siralama`,
        [soru.id]
      );

      const secenekler = seceneklerRaw.map(secenek => ({
        id: secenek.id,
        secenek_metni: secenek.secenek_metni || null,
        secenek_gorseli: secenek.secenek_gorseli || null,
        secenek_ses_dosyasi: secenek.secenek_ses_dosyasi || null,
        secenek_rengi: secenek.secenek_rengi || null,
        metin: secenek.secenek_metni || null,
        gorsel: secenek.secenek_gorseli || null,
        renk: secenek.secenek_rengi || null,
        kategori: secenek.kategori || null,
        dogru_cevap: secenek.dogru_cevap || 0,
        dogru: secenek.dogru_cevap || 0,
        siralama: secenek.siralama || 0
      }));

      const isAsamali = !!(soru.asamali === true || soru.asamali === 't' || soru.asamali === 'true' || soru.asamali === 1 || soru.asamali === '1');
      let asamalar = [];
      if (isAsamali) {
        const { rows: asamalarRaw } = await pool.query(
          'SELECT id, asama_numarasi, icerik FROM etkinlik_soru_asamalari WHERE soru_id = $1 ORDER BY asama_numarasi',
          [soru.id]
        );
        asamalar = asamalarRaw.map(a => {
          let icerik = a.icerik;
          if (typeof icerik === 'string') {
            try { icerik = JSON.parse(icerik) || {}; } catch { icerik = {}; }
          }
          return { asama_numarasi: a.asama_numarasi, icerik: icerik || {} };
        });
      }

      return { ...soru, asamali: isAsamali, secenekler, asamalar };
    }));

    let etkinlikData = { ...etkinlikler[0], soru_sayisi: sorular.length };
    if ((!etkinlikData.tur || etkinlikData.tur === '') && sorular.length > 0 && sorular[0].soru_turu) {
      etkinlikData = { ...etkinlikData, tur: sorular[0].soru_turu };
    }

    res.json({
      success: true,
      data: { etkinlik: etkinlikData, sorular }
    });
  } catch (error) {
    console.error('Etkinlik detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Etkinlik bilgileri alınırken bir hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Soru ekle
router.post('/:id/sorular', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const validation = validateSoruEkle(body, { kitaplarMi: false });
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { soru_numarasi, soru_turu, soru_adi, soru_metni, soru_puan, soru_yildiz, ses_dosyasi, video_url, ek_bilgi, yonerge, yonerge_ses_dosyasi, secenekler, arka_plan_gorsel_yatay, arka_plan_gorsel_dikey, secenek_arka_plan_gorseli, soru_gorseli, asamali, asamalar } = body;
    const isAsamali = asamali === true || asamali === 'true' || asamali === 1 || asamali === '1';

    const { rows: etkinlikler } = await pool.query(
      'SELECT olusturan_id, olusturan_rol FROM etkinlikler WHERE id = $1',
      [id]
    );
    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    const etkinlik = etkinlikler[0];
    const userRol = req.user.rol || req.user.role;
    if (userRol !== 'admin' && etkinlik.olusturan_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu etkinliğe soru ekleme yetkiniz yok' });
    }

    let finalSoruNumarasi = soru_numarasi;
    if (!finalSoruNumarasi) {
      const { rows: maxSira } = await pool.query(
        'SELECT COALESCE(MAX(soru_numarasi), 0) as max_sira FROM etkinlik_sorulari WHERE etkinlik_id = $1',
        [id]
      );
      finalSoruNumarasi = (maxSira[0]?.max_sira || 0) + 1;
    }

    const soruAdiInsertVal = (soru_adi != null && String(soru_adi).trim() !== '') ? String(soru_adi).trim() : null;
    const soruMetniInsertVal = (soru_metni && String(soru_metni).trim()) ? String(soru_metni).trim() : null;
    const yonergeVal = (yonerge != null && String(yonerge).trim() !== '') ? String(yonerge).trim() : null;
    const yonergeSesVal = (yonerge_ses_dosyasi != null && String(yonerge_ses_dosyasi).trim() !== '') ? String(yonerge_ses_dosyasi).trim() : null;
    const arkaPlanYatay = (arka_plan_gorsel_yatay && String(arka_plan_gorsel_yatay).trim()) ? String(arka_plan_gorsel_yatay).trim() : null;
    const arkaPlanDikey = (arka_plan_gorsel_dikey && String(arka_plan_gorsel_dikey).trim()) ? String(arka_plan_gorsel_dikey).trim() : null;
    const secenekArkaPlan = (secenek_arka_plan_gorseli && String(secenek_arka_plan_gorseli).trim()) ? String(secenek_arka_plan_gorseli).trim() : null;
    const videoUrlVal = (video_url != null && String(video_url).trim() !== '') ? String(video_url).trim() : null;
    const soruGorseliVal = (soru_gorseli != null && String(soru_gorseli).trim() !== '') ? String(soru_gorseli).trim() : null;
    const asamaliVal = isAsamali;

    const soruYildizVal = (soru_yildiz != null && Number(soru_yildiz) >= 0) ? Number(soru_yildiz) : null;
    const { rows: soruResultRows } = await pool.query(
      `INSERT INTO etkinlik_sorulari (
        etkinlik_id, soru_numarasi, soru_turu, soru_adi, soru_metni,
        soru_puan, soru_yildiz, ses_dosyasi, dogru_cevap_id, ek_bilgi, yonerge, yonerge_ses_dosyasi,
        arka_plan_gorsel_yatay, arka_plan_gorsel_dikey, secenek_arka_plan_gorseli, video_url, soru_gorseli, asamali
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [id, finalSoruNumarasi, soru_turu, soruAdiInsertVal, soruMetniInsertVal, soru_puan || null, soruYildizVal, ses_dosyasi || null, null, ek_bilgi || null, yonergeVal, yonergeSesVal, arkaPlanYatay, arkaPlanDikey, secenekArkaPlan, videoUrlVal, soruGorseliVal, asamaliVal]
    );
    const soruId = soruResultRows[0].id;

    const asamalarListesi = (isAsamali && asamalar && Array.isArray(asamalar)) ? asamalar : [];
    for (let i = 0; i < asamalarListesi.length; i++) {
      const a = asamalarListesi[i];
      const asamaNum = (a.asama_numarasi != null) ? Number(a.asama_numarasi) : (i + 1);
      const icerik = (a.icerik && typeof a.icerik === 'object') ? a.icerik : (typeof a === 'object' && !a.asama_numarasi ? a : {});
      await pool.query(
        'INSERT INTO etkinlik_soru_asamalari (soru_id, asama_numarasi, icerik) VALUES ($1, $2, $3)',
        [soruId, asamaNum, JSON.stringify(icerik)]
      );
    }

    let dogruCevapId = null;
    const secenekListesi = secenekler && Array.isArray(secenekler) ? secenekler : [];
    for (const secenek of secenekListesi) {
      const secenekMetni = (secenek.secenek_metni && secenek.secenek_metni.trim().length > 0) ? secenek.secenek_metni.trim() : null;
      const secenekGorseli = (secenek.secenek_gorseli && secenek.secenek_gorseli.trim().length > 0) ? secenek.secenek_gorseli.trim() : null;
      const secenekSesDosyasi = (secenek.secenek_ses_dosyasi && secenek.secenek_ses_dosyasi.trim().length > 0) ? secenek.secenek_ses_dosyasi.trim() : null;
      const secenekRengi = (secenek.secenek_rengi && secenek.secenek_rengi.trim().length > 0) ? secenek.secenek_rengi.trim() : null;
      const kategori = secenek.kategori || null;
      const dogruCevap = secenek.dogru_cevap === 1 || secenek.dogru_cevap === true ? 1 : 0;
      const siralama = secenek.siralama || 0;

      const secenekResult = await pool.query(
        'INSERT INTO soru_secenekleri (soru_id, secenek_metni, secenek_gorseli, secenek_ses_dosyasi, secenek_rengi, kategori, dogru_cevap, siralama) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [soruId, secenekMetni, secenekGorseli, secenekSesDosyasi, secenekRengi, kategori, dogruCevap, siralama]
      );
      if (dogruCevap === 1 && dogruCevapId === null) dogruCevapId = secenekResult.rows[0].id;
    }

    if (dogruCevapId) {
      await pool.query(
        'UPDATE etkinlik_sorulari SET dogru_cevap_id = $1 WHERE id = $2',
        [dogruCevapId, soruId]
      );
    }

    await pool.query(
      'UPDATE etkinlikler SET tur = $1 WHERE id = $2 AND tur IS NULL',
      [soru_turu, id]
    );

    await syncEtkinlikDurum(id);
    res.status(201).json({
      success: true,
      message: 'Soru başarıyla eklendi',
      data: { id: soruId }
    });
  } catch (error) {
    console.error('Soru ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Soru eklenirken bir hata oluştu'
    });
  }
});

// Soru sıralamasını güncelle
router.put('/:id/sorular/siralama', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { soruSiralamalari } = req.body;

    if (!soruSiralamalari || !Array.isArray(soruSiralamalari)) {
      return res.status(400).json({ success: false, message: 'Soru sıralaması listesi gereklidir' });
    }

    const { rows: etkinlikler } = await pool.query(
      'SELECT olusturan_id, olusturan_rol FROM etkinlikler WHERE id = $1',
      [id]
    );
    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    const etkinlik = etkinlikler[0];
    const userRol = req.user.rol || req.user.role;
    if (userRol !== 'admin' && etkinlik.olusturan_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu etkinliğin soru sıralamasını değiştirme yetkiniz yok' });
    }

    const soruNumaralari = soruSiralamalari.map(s => s.soru_numarasi);
    const uniqueSoruNumaralari = [...new Set(soruNumaralari)];
    if (soruNumaralari.length !== uniqueSoruNumaralari.length) {
      return res.status(400).json({ success: false, message: 'Aynı etkinlikte iki soru aynı soru numarasına sahip olamaz' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const hedefNumaralar = soruSiralamalari.map(s => Number(s.soru_numarasi));
      const listedekiSoruIds = soruSiralamalari.map(s => Number(s.soru_id));

      for (const { soru_id } of soruSiralamalari) {
        const { rows: soruKontrol } = await client.query(
          'SELECT id FROM etkinlik_sorulari WHERE id = $1 AND etkinlik_id = $2',
          [soru_id, id]
        );
        if (soruKontrol.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: `Soru ID ${soru_id} bulunamadı` });
        }
      }

      const offset = 100000;
      if (hedefNumaralar.length > 0 && listedekiSoruIds.length > 0) {
        await client.query(
          `UPDATE etkinlik_sorulari SET soru_numarasi = (id + $1) WHERE etkinlik_id = $2 AND soru_numarasi = ANY($3) AND NOT (id = ANY($4))`,
          [offset, id, hedefNumaralar, listedekiSoruIds]
        );
      }
      for (const { soru_id } of soruSiralamalari) {
        await client.query(
          'UPDATE etkinlik_sorulari SET soru_numarasi = $1 WHERE id = $2 AND etkinlik_id = $3',
          [offset + Number(soru_id), soru_id, id]
        );
      }
      for (const { soru_id, soru_numarasi } of soruSiralamalari) {
        await client.query(
          'UPDATE etkinlik_sorulari SET soru_numarasi = $1 WHERE id = $2 AND etkinlik_id = $3',
          [soru_numarasi, soru_id, id]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, message: 'Soru sıralaması başarıyla güncellendi' });
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Soru sıralama güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Soru sıralaması güncellenirken bir hata oluştu'
    });
  }
});

// Soru güncelle
router.put('/:id/sorular/:soruId(\\d+)', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { id, soruId } = req.params;
    const { soru_numarasi, soru_turu, soru_adi, soru_metni, soru_puan, soru_yildiz, ses_dosyasi, video_url, ek_bilgi, yonerge, yonerge_ses_dosyasi, secenekler, arka_plan_gorsel_yatay, arka_plan_gorsel_dikey, secenek_arka_plan_gorseli, soru_gorseli, asamali, asamalar } = req.body;

    const { rows: mevcutSorular } = await pool.query(
      'SELECT soru_turu FROM etkinlik_sorulari WHERE id = $1 AND etkinlik_id = $2',
      [soruId, id]
    );
    if (mevcutSorular.length === 0) {
      return res.status(404).json({ success: false, message: 'Soru bulunamadı' });
    }

    const guncelSoruTuru = soru_turu || mevcutSorular[0].soru_turu;
    const updateValidation = validateSoruGuncelle(req.body, guncelSoruTuru, { kitaplarMi: false });
    if (!updateValidation.ok) {
      return res.status(400).json({ success: false, message: updateValidation.message });
    }

    const { rows: etkinlikler } = await pool.query(
      'SELECT olusturan_id, olusturan_rol FROM etkinlikler WHERE id = $1',
      [id]
    );
    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    const etkinlik = etkinlikler[0];
    const userRol = req.user.rol || req.user.role;
    if (userRol !== 'admin' && etkinlik.olusturan_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu etkinliğe soru ekleme yetkiniz yok' });
    }

    const { rows: sorular } = await pool.query(
      'SELECT id, ses_dosyasi FROM etkinlik_sorulari WHERE id = $1 AND etkinlik_id = $2',
      [soruId, id]
    );
    if (sorular.length === 0) {
      return res.status(404).json({ success: false, message: 'Soru bulunamadı' });
    }
    const eskiSoru = sorular[0];

    const { rows: eskiSecenekler } = await pool.query(
      'SELECT secenek_gorseli FROM soru_secenekleri WHERE soru_id = $1',
      [soruId]
    );

    try {
      const fileUploader = require('../utils/fileUploader');
      if (eskiSoru.ses_dosyasi && eskiSoru.ses_dosyasi !== ses_dosyasi) {
        await fileUploader.deleteFile(eskiSoru.ses_dosyasi);
      }
      const yeniGorseller = (secenekler || []).map(s => s.secenek_gorseli).filter(Boolean);
      for (const eskiSecenek of eskiSecenekler) {
        if (eskiSecenek.secenek_gorseli && !yeniGorseller.includes(eskiSecenek.secenek_gorseli)) {
          await fileUploader.deleteFile(eskiSecenek.secenek_gorseli);
        }
      }
    } catch (fileError) {
      console.error('Eski soru dosyaları silinirken hata:', fileError);
    }

    await pool.query('DELETE FROM soru_secenekleri WHERE soru_id = $1', [soruId]);

    const soruAdiVal = (soru_adi != null && String(soru_adi).trim() !== '') ? String(soru_adi).trim() : null;
    const soruMetniVal = (soru_metni != null && String(soru_metni).trim() !== '') ? String(soru_metni).trim() : null;
    const yonergeVal = (yonerge != null && String(yonerge).trim() !== '') ? String(yonerge).trim() : null;
    const yonergeSesVal = (yonerge_ses_dosyasi != null && String(yonerge_ses_dosyasi).trim() !== '') ? String(yonerge_ses_dosyasi).trim() : null;
    const arkaPlanYatay = (arka_plan_gorsel_yatay != null && String(arka_plan_gorsel_yatay).trim() !== '') ? String(arka_plan_gorsel_yatay).trim() : null;
    const arkaPlanDikey = (arka_plan_gorsel_dikey != null && String(arka_plan_gorsel_dikey).trim() !== '') ? String(arka_plan_gorsel_dikey).trim() : null;
    const secenekArkaPlan = (secenek_arka_plan_gorseli != null && String(secenek_arka_plan_gorseli).trim() !== '') ? String(secenek_arka_plan_gorseli).trim() : null;
    const videoUrlVal = (video_url != null && String(video_url).trim() !== '') ? String(video_url).trim() : null;
    const soruGorseliVal = (soru_gorseli != null && String(soru_gorseli).trim() !== '') ? String(soru_gorseli).trim() : null;
    const asamaliVal = asamali === true || asamali === 'true' || asamali === 1 || asamali === '1';
    const soruYildizVal = (soru_yildiz != null && Number(soru_yildiz) >= 0) ? Number(soru_yildiz) : null;

    await pool.query(
      `UPDATE etkinlik_sorulari SET soru_turu = $1, soru_puan = $2, soru_yildiz = $3, ses_dosyasi = $4, soru_adi = $5, soru_metni = $6, dogru_cevap_id = NULL, ek_bilgi = $7, yonerge = $8, yonerge_ses_dosyasi = $9, arka_plan_gorsel_yatay = $10, arka_plan_gorsel_dikey = $11, secenek_arka_plan_gorseli = $12, video_url = $13, soru_gorseli = $14, asamali = $15${soru_numarasi != null ? ', soru_numarasi = $16' : ''} WHERE id = ${soru_numarasi != null ? '$17' : '$16'}`,
      soru_numarasi != null
        ? [guncelSoruTuru, soru_puan || null, soruYildizVal, ses_dosyasi || null, soruAdiVal, soruMetniVal, ek_bilgi || null, yonergeVal, yonergeSesVal, arkaPlanYatay, arkaPlanDikey, secenekArkaPlan, videoUrlVal, soruGorseliVal, asamaliVal, soru_numarasi, soruId]
        : [guncelSoruTuru, soru_puan || null, soruYildizVal, ses_dosyasi || null, soruAdiVal, soruMetniVal, ek_bilgi || null, yonergeVal, yonergeSesVal, arkaPlanYatay, arkaPlanDikey, secenekArkaPlan, videoUrlVal, soruGorseliVal, asamaliVal, soruId]
    );

    await pool.query('DELETE FROM etkinlik_soru_asamalari WHERE soru_id = $1', [soruId]);
    const asamalarListesiGuncel = (asamaliVal && asamalar && Array.isArray(asamalar)) ? asamalar : [];
    for (let i = 0; i < asamalarListesiGuncel.length; i++) {
      const a = asamalarListesiGuncel[i];
      const asamaNum = (a.asama_numarasi != null) ? Number(a.asama_numarasi) : (i + 1);
      const icerik = (a.icerik && typeof a.icerik === 'object') ? a.icerik : (typeof a === 'object' && !a.asama_numarasi ? a : {});
      await pool.query(
        'INSERT INTO etkinlik_soru_asamalari (soru_id, asama_numarasi, icerik) VALUES ($1, $2, $3)',
        [soruId, asamaNum, JSON.stringify(icerik)]
      );
    }

    let dogruCevapId = null;
    const secenekListesiGuncelleme = (secenekler && Array.isArray(secenekler)) ? secenekler : [];
    for (const secenek of secenekListesiGuncelleme) {
      const secenekMetni = (secenek.secenek_metni && secenek.secenek_metni.trim().length > 0) ? secenek.secenek_metni.trim() : null;
      const secenekGorseli = (secenek.secenek_gorseli && secenek.secenek_gorseli.trim().length > 0) ? secenek.secenek_gorseli.trim() : null;
      const secenekSesDosyasi = (secenek.secenek_ses_dosyasi && secenek.secenek_ses_dosyasi.trim().length > 0) ? secenek.secenek_ses_dosyasi.trim() : null;
      const secenekRengi = (secenek.secenek_rengi && secenek.secenek_rengi.trim().length > 0) ? secenek.secenek_rengi.trim() : null;
      const kategori = secenek.kategori || null;
      const dogruCevap = secenek.dogru_cevap === 1 || secenek.dogru_cevap === true ? 1 : 0;
      const siralama = secenek.siralama || 0;

      const secenekResult = await pool.query(
        'INSERT INTO soru_secenekleri (soru_id, secenek_metni, secenek_gorseli, secenek_ses_dosyasi, secenek_rengi, kategori, dogru_cevap, siralama) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [soruId, secenekMetni, secenekGorseli, secenekSesDosyasi, secenekRengi, kategori, dogruCevap, siralama]
      );
      if (dogruCevap === 1 && dogruCevapId === null) dogruCevapId = secenekResult.rows[0].id;
    }

    if (dogruCevapId) {
      await pool.query(
        'UPDATE etkinlik_sorulari SET dogru_cevap_id = $1 WHERE id = $2',
        [dogruCevapId, soruId]
      );
    }

    res.json({
      success: true,
      message: 'Soru başarıyla güncellendi',
      data: { id: soruId }
    });
  } catch (error) {
    console.error('Soru güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Soru güncellenirken bir hata oluştu'
    });
  }
});

// Soru sil
router.delete('/:id/sorular/:soruId(\\d+)', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    const { id, soruId } = req.params;

    const { rows: etkinlikler } = await pool.query(
      'SELECT olusturan_id, olusturan_rol FROM etkinlikler WHERE id = $1',
      [id]
    );
    if (etkinlikler.length === 0) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    const etkinlik = etkinlikler[0];
    const userRol = req.user.rol || req.user.role;
    if (userRol !== 'admin' && etkinlik.olusturan_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu soruyu silme yetkiniz yok' });
    }

    const { rows: sorular } = await pool.query(
      'SELECT id FROM etkinlik_sorulari WHERE id = $1 AND etkinlik_id = $2',
      [soruId, id]
    );
    if (sorular.length === 0) {
      return res.status(404).json({ success: false, message: 'Soru bulunamadı' });
    }

    const soruIdNum = parseInt(soruId, 10);

    if (seviyePool) {
      try {
        await seviyePool.query(
          'DELETE FROM soru_cevaplari WHERE soru_id = $1',
          [soruIdNum]
        );
      } catch (seviyeErr) {
        console.warn('Soru silerken seviye db temizliği:', seviyeErr.message);
      }
    }

    await pool.query('DELETE FROM soru_secenekleri WHERE soru_id = $1', [soruIdNum]);
    await pool.query('DELETE FROM etkinlik_sorulari WHERE id = $1', [soruIdNum]);
    await syncEtkinlikDurum(id);

    res.json({ success: true, message: 'Soru başarıyla silindi' });
  } catch (error) {
    console.error('Soru silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Soru silinirken bir hata oluştu'
    });
  }
});

async function syncEtkinlikDurum(etkinlikId) {
  try {
    const { rows: r } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM etkinlik_sorulari WHERE etkinlik_id = $1',
      [etkinlikId]
    );
    const durum = (r[0]?.n || 0) >= 1 ? 'aktif' : 'taslak';
    await pool.query('UPDATE etkinlikler SET durum = $1 WHERE id = $2', [durum, etkinlikId]);
  } catch (e) {
    console.warn('syncEtkinlikDurum hatası:', e.message);
  }
}

async function dagitPuanlari(etkinlikId) {
  try {
    const { rows: etkinlikler } = await pool.query(
      'SELECT toplam_puan FROM etkinlikler WHERE id = $1',
      [etkinlikId]
    );
    if (etkinlikler.length === 0 || !etkinlikler[0].toplam_puan) return;

    const toplamPuan = etkinlikler[0].toplam_puan;
    const { rows: sorular } = await pool.query(
      'SELECT id, soru_puan, soru_turu FROM etkinlik_sorulari WHERE etkinlik_id = $1 ORDER BY soru_numarasi',
      [etkinlikId]
    );
    if (sorular.length === 0) return;

    const ozelPuanliSorular = sorular.filter(s => s.soru_puan && s.soru_puan > 0);
    const ozelPuanToplam = ozelPuanliSorular.reduce((sum, s) => sum + (s.soru_puan || 0), 0);
    const kalanPuan = toplamPuan - ozelPuanToplam;
    const kalanSoruSayisi = sorular.length - ozelPuanliSorular.length;

    if (kalanSoruSayisi > 0 && kalanPuan > 0) {
      const soruBasiPuan = Math.floor(kalanPuan / kalanSoruSayisi);
      const kalanMod = kalanPuan % kalanSoruSayisi;
      for (let i = 0; i < sorular.length; i++) {
        const soru = sorular[i];
        if (!soru.soru_puan || soru.soru_puan === 0) {
          let puan = soruBasiPuan;
          if (i === 0 && kalanMod > 0) puan += kalanMod;
          await pool.query(
            'UPDATE etkinlik_sorulari SET soru_puan = $1 WHERE id = $2',
            [puan, soru.id]
          );
        }
      }
    } else if (kalanSoruSayisi === sorular.length && kalanPuan > 0) {
      const soruBasiPuan = Math.floor(kalanPuan / sorular.length);
      const kalanMod = kalanPuan % sorular.length;
      for (let i = 0; i < sorular.length; i++) {
        let puan = soruBasiPuan;
        if (i === 0 && kalanMod > 0) puan += kalanMod;
        await pool.query(
          'UPDATE etkinlik_sorulari SET soru_puan = $1 WHERE id = $2',
          [puan, sorular[i].id]
        );
      }
    }
  } catch (error) {
    console.error('Puan dağıtım hatası:', error);
  }
}

module.exports = router;
