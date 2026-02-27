/**
 * KİTAPLAR ROUTE (Ünite Sihirbazı) – erax-admin
 * Kitaplar, kitap_sorulari, kitap_soru_secenekleri, kitap_soru_asamalari (DIGIBUCH_DB)
 * Soru türü validasyonu: routes/soru-turleri modülü.
 */
const express = require('express');
const router = express.Router();
const { digibuchPool: pool } = require('../../config/database');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth');
const { validateSoruEkle, validateSoruGuncelle } = require('../soru-turleri');

if (!pool) {
  console.warn('⚠️ Kitaplar route: DIGIBUCH_DB (digibuchPool) yapılandırılmamış; kitaplar API çalışmayacak.');
}

/** Sayı alanı: undefined, null, '', NaN -> null; geçerli sayı -> number (0 dahil) */
function numOrNull (v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** GET / - Admin: kitap listesi (sadece admin; öğrenci/öğretmen listesi eradil-mufredat'tan) */
router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { rows } = await pool.query(`
      SELECT k.*, (SELECT COUNT(*)::int FROM kitap_sorulari WHERE kitap_id = k.id) AS soru_sayisi
      FROM kitaplar k
      ORDER BY k.id DESC
    `);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Kitaplar listele hatası:', error);
    return res.status(500).json({ success: false, message: 'Kitaplar listelenirken hata oluştu' });
  }
});

/** POST / - Yeni kitap oluştur */
router.post('/', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { ad, aciklama, kategori, sinif_seviyesi, durum, toplam_puan, toplam_yildiz, gorsel_yolu, ses_ikonu_gorsel, ilerleme_butonu_gorsel, geri_butonu_gorsel, tam_ekran_butonu_gorsel, kucuk_ekran_butonu_gorsel } = req.body;
    const userRol = req.user.rol || req.user.role;
    if (!ad) return res.status(400).json({ success: false, message: 'Kitap adı gereklidir' });
    const iconVal = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : null;
    const { rows } = await pool.query(
      `INSERT INTO kitaplar (ad, aciklama, kategori, sinif_seviyesi, olusturan_id, olusturan_rol, durum, tur, toplam_puan, toplam_yildiz, gorsel_yolu, ses_ikonu_gorsel, ilerleme_butonu_gorsel, geri_butonu_gorsel, tam_ekran_butonu_gorsel, kucuk_ekran_butonu_gorsel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [ad, aciklama || null, kategori || null, sinif_seviyesi || null, req.user.id, userRol, durum || 'aktif', null, numOrNull(toplam_puan), numOrNull(toplam_yildiz), gorsel_yolu || null, iconVal(ses_ikonu_gorsel), iconVal(ilerleme_butonu_gorsel), iconVal(geri_butonu_gorsel), iconVal(tam_ekran_butonu_gorsel), iconVal(kucuk_ekran_butonu_gorsel)]
    );
    return res.status(201).json({ success: true, message: 'Kitap oluşturuldu', data: { id: rows[0].id } });
  } catch (error) {
    console.error('Kitap oluşturma hatası:', error);
    return res.status(500).json({ success: false, message: 'Kitap oluşturulurken hata oluştu' });
  }
});

/** GET /:id - Admin: kitap önizleme (sadece admin; öğrenci/öğretmen detay eradil-mufredat'tan) */
router.get('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { id } = req.params;
    const { rows: kitaplar } = await pool.query('SELECT * FROM kitaplar WHERE id = $1', [id]);
    if (kitaplar.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });

    const { rows: sorularRaw } = await pool.query(
      'SELECT * FROM kitap_sorulari WHERE kitap_id = $1 ORDER BY soru_numarasi',
      [id]
    );

    const sorular = await Promise.all(sorularRaw.map(async (soru) => {
      const { rows: seceneklerRaw } = await pool.query(
        'SELECT id, secenek_metni, secenek_gorseli, secenek_ses_dosyasi, secenek_rengi, kategori, dogru_cevap, siralama FROM kitap_soru_secenekleri WHERE soru_id = $1 ORDER BY siralama',
        [soru.id]
      );
      const secenekler = seceneklerRaw.map(s => ({
        id: s.id,
        secenek_metni: s.secenek_metni || null,
        secenek_gorseli: s.secenek_gorseli || null,
        secenek_ses_dosyasi: s.secenek_ses_dosyasi || null,
        secenek_rengi: s.secenek_rengi || null,
        metin: s.secenek_metni || null,
        gorsel: s.secenek_gorseli || null,
        renk: s.secenek_rengi || null,
        kategori: s.kategori || null,
        dogru_cevap: s.dogru_cevap || 0,
        dogru: s.dogru_cevap || 0,
        siralama: s.siralama || 0
      }));

      const isAsamali = !!(soru.asamali === true || soru.asamali === 't' || soru.asamali === 'true' || soru.asamali === 1 || soru.asamali === '1');
      let asamalar = [];
      if (isAsamali) {
        let asamalarRaw = [];
        try {
          const r = await pool.query('SELECT id, asama_numarasi, icerik FROM kitap_soru_asamalari WHERE soru_id = $1 ORDER BY asama_numarasi', [soru.id]);
          asamalarRaw = r.rows || [];
        } catch {
          asamalarRaw = [];
        }
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

    const kitapData = { ...kitaplar[0], soru_sayisi: sorular.length };
    if (sorular.length > 0 && !kitapData.tur) kitapData.tur = sorular[0].soru_turu;

    const N = sorular.length;
    if (N > 0) {
      const toplamPuan = kitapData.toplam_puan;
      const toplamYildiz = kitapData.toplam_yildiz;
      if (toplamPuan != null && toplamPuan > 0) {
        const basePuan = Math.floor(toplamPuan / N);
        const modPuan = toplamPuan % N;
        for (let i = 0; i < sorular.length; i++) {
          if (sorular[i].soru_puan == null || sorular[i].soru_puan === 0) {
            sorular[i].soru_puan = basePuan + (i < modPuan ? 1 : 0);
          }
        }
      }
      if (toplamYildiz != null && toplamYildiz > 0) {
        const baseYildiz = Math.floor(toplamYildiz / N);
        const modYildiz = toplamYildiz % N;
        for (let i = 0; i < sorular.length; i++) {
          if (sorular[i].soru_yildiz == null || sorular[i].soru_yildiz === 0) {
            sorular[i].soru_yildiz = baseYildiz + (i < modYildiz ? 1 : 0);
          }
        }
      }
    }

    return res.json({
      success: true,
      data: { etkinlik: kitapData, sorular }
    });
  } catch (error) {
    console.error('Kitap detay hatası:', error);
    return res.status(500).json({ success: false, message: 'Kitap bilgileri alınırken hata oluştu' });
  }
});

/** PUT /:id - Kitap güncelle */
router.put('/:id', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const idRaw = req.params.id;
    const id = idRaw != null && /^\d+$/.test(String(idRaw)) ? parseInt(idRaw, 10) : NaN;
    if (Number.isNaN(id) || id < 1) return res.status(400).json({ success: false, message: 'Geçersiz kitap id' });
    const body = req.body || {};
    const ad = body.ad != null ? String(body.ad).trim() : null;
    const aciklama = body.aciklama != null ? String(body.aciklama).trim() : null;
    const kategori = body.kategori != null ? String(body.kategori).trim() : null;
    const sinif_seviyesi = numOrNull(body.sinif_seviyesi);
    const durum = body.durum != null && String(body.durum).trim() !== '' ? String(body.durum).trim() : 'aktif';
    const toplam_puan = numOrNull(body.toplam_puan);
    const toplam_yildiz = numOrNull(body.toplam_yildiz);
    const gorsel_yolu = body.gorsel_yolu != null && String(body.gorsel_yolu).trim() !== '' ? String(body.gorsel_yolu).trim() : null;
    const ses_ikonu_gorsel = body.ses_ikonu_gorsel;
    const ilerleme_butonu_gorsel = body.ilerleme_butonu_gorsel;
    const geri_butonu_gorsel = body.geri_butonu_gorsel;
    const tam_ekran_butonu_gorsel = body.tam_ekran_butonu_gorsel;
    const kucuk_ekran_butonu_gorsel = body.kucuk_ekran_butonu_gorsel;

    if (!ad) return res.status(400).json({ success: false, message: 'Kitap adı gereklidir' });

    const { rows } = await pool.query('SELECT id FROM kitaplar WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM kitap_sorulari WHERE kitap_id = $1',
      [id]
    );
    const soruSayisi = countRows[0]?.n ?? 0;

    const iconVal = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : null;
    await pool.query(
      `UPDATE kitaplar SET ad = $1, aciklama = $2, kategori = $3, sinif_seviyesi = $4, durum = $5, toplam_puan = $6, toplam_yildiz = $7, gorsel_yolu = $8, ses_ikonu_gorsel = $9, ilerleme_butonu_gorsel = $10, geri_butonu_gorsel = $11, tam_ekran_butonu_gorsel = $12, kucuk_ekran_butonu_gorsel = $13 WHERE id = $14`,
      [ad, aciklama || null, kategori || null, sinif_seviyesi, durum, toplam_puan, toplam_yildiz, gorsel_yolu, iconVal(ses_ikonu_gorsel), iconVal(ilerleme_butonu_gorsel), iconVal(geri_butonu_gorsel), iconVal(tam_ekran_butonu_gorsel), iconVal(kucuk_ekran_butonu_gorsel), id]
    );
    if (soruSayisi > 0) {
      const np = numOrNull(body.toplam_puan);
      if (np != null && np > 0) {
        const { rows: kitapSorular } = await pool.query(
          'SELECT id FROM kitap_sorulari WHERE kitap_id = $1 ORDER BY soru_numarasi',
          [id]
        );
        const basePuan = Math.floor(np / kitapSorular.length);
        const modPuan = np % kitapSorular.length;
        for (let i = 0; i < kitapSorular.length; i++) {
          const puan = basePuan + (i < modPuan ? 1 : 0);
          await pool.query('UPDATE kitap_sorulari SET soru_puan = $1 WHERE id = $2', [puan, kitapSorular[i].id]);
        }
      }
      const ny = numOrNull(body.toplam_yildiz);
      if (ny != null && ny > 0) {
        const { rows: kitapSorularY } = await pool.query(
          'SELECT id FROM kitap_sorulari WHERE kitap_id = $1 ORDER BY soru_numarasi',
          [id]
        );
        const baseYildiz = Math.floor(ny / kitapSorularY.length);
        const modYildiz = ny % kitapSorularY.length;
        for (let i = 0; i < kitapSorularY.length; i++) {
          const yildiz = baseYildiz + (i < modYildiz ? 1 : 0);
          await pool.query(
            'UPDATE kitap_sorulari SET soru_yildiz = $1 WHERE id = $2',
            [yildiz, kitapSorularY[i].id]
          ).catch(() => {});
        }
      }
    }
    return res.json({ success: true, message: 'Kitap güncellendi' });
  } catch (error) {
    console.error('Kitap güncelleme hatası:', error);
    const errMsg = error.message || 'Kitap güncellenirken hata oluştu';
    return res.status(500).json({ success: false, message: 'Kitap güncellenirken hata oluştu', error: errMsg });
  }
});

/** DELETE /:id - Kitap sil */
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id FROM kitaplar WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });
    await pool.query('DELETE FROM kitaplar WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Kitap silindi' });
  } catch (error) {
    console.error('Kitap silme hatası:', error);
    return res.status(500).json({ success: false, message: 'Kitap silinirken hata oluştu' });
  }
});

/** POST /:id/sorular - Soru ekle */
router.post('/:id/sorular', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { id } = req.params;
    const body = req.body;
    const validation = validateSoruEkle(body, { kitaplarMi: true });
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const { soru_numarasi, soru_turu, soru_adi, soru_metni, soru_puan, ses_dosyasi, video_url, ek_bilgi, yonerge, yonerge_ses_dosyasi, secenekler, secenek_arka_plan_gorseli, soru_gorseli, dogru_tik_gorsel, asamali, asamalar } = body;
    const isAsamali = asamali === true || asamali === 'true' || asamali === 1 || asamali === '1';

    const { rows: kitaplar } = await pool.query('SELECT id FROM kitaplar WHERE id = $1', [id]);
    if (kitaplar.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });

    let finalSira = soru_numarasi;
    if (finalSira == null) {
      const { rows: maxRow } = await pool.query('SELECT COALESCE(MAX(soru_numarasi), 0) AS max_sira FROM kitap_sorulari WHERE kitap_id = $1', [id]);
      finalSira = (maxRow[0]?.max_sira || 0) + 1;
    }

    const soruAdiVal = (soru_adi != null && String(soru_adi).trim() !== '') ? String(soru_adi).trim() : null;
    const soruMetniVal = (soru_metni && String(soru_metni).trim()) ? String(soru_metni).trim() : null;
    const yonergeVal = (yonerge != null && String(yonerge).trim() !== '') ? String(yonerge).trim() : null;
    const yonergeSesVal = (yonerge_ses_dosyasi != null && String(yonerge_ses_dosyasi).trim() !== '') ? String(yonerge_ses_dosyasi).trim() : null;
    const secArka = (secenek_arka_plan_gorseli && String(secenek_arka_plan_gorseli).trim()) ? String(secenek_arka_plan_gorseli).trim() : null;
    const videoUrlVal = (video_url != null && String(video_url).trim() !== '') ? String(video_url).trim() : null;
    const soruGorseliVal = (soru_gorseli != null && String(soru_gorseli).trim() !== '') ? String(soru_gorseli).trim() : null;
    const dogruTikGorselVal = (dogru_tik_gorsel != null && String(dogru_tik_gorsel).trim() !== '') ? String(dogru_tik_gorsel).trim() : null;
    const asamaliVal = !!isAsamali;

    const { rows: soruRows } = await pool.query(
      `INSERT INTO kitap_sorulari (kitap_id, soru_numarasi, soru_turu, soru_adi, soru_metni, soru_puan, ses_dosyasi, dogru_cevap_id, ek_bilgi, yonerge, yonerge_ses_dosyasi, secenek_arka_plan_gorseli, video_url, soru_gorseli, dogru_tik_gorsel, asamali)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [id, finalSira, soru_turu, soruAdiVal, soruMetniVal, soru_puan || null, ses_dosyasi || null, null, ek_bilgi || null, yonergeVal, yonergeSesVal, secArka, videoUrlVal, soruGorseliVal, dogruTikGorselVal, asamaliVal]
    );
    const soruId = soruRows[0].id;

    const asamalarListesi = (isAsamali && asamalar && Array.isArray(asamalar)) ? asamalar : [];
    for (let i = 0; i < asamalarListesi.length; i++) {
      const a = asamalarListesi[i];
      const asamaNum = (a.asama_numarasi != null) ? Number(a.asama_numarasi) : (i + 1);
      const icerik = (a.icerik && typeof a.icerik === 'object') ? a.icerik : (typeof a === 'object' && !a.asama_numarasi ? a : {});
      await pool.query('INSERT INTO kitap_soru_asamalari (soru_id, asama_numarasi, icerik) VALUES ($1, $2, $3)', [soruId, asamaNum, typeof icerik === 'string' ? icerik : JSON.stringify(icerik)]).catch(() => {});
    }

    let dogruCevapId = null;
    const secenekListesi = (secenekler || []);
    for (const secenek of secenekListesi) {
      const secMetni = (secenek.secenek_metni && secenek.secenek_metni.trim()) ? secenek.secenek_metni.trim() : null;
      const secGorseli = (secenek.secenek_gorseli && secenek.secenek_gorseli.trim()) ? secenek.secenek_gorseli.trim() : null;
      const secSes = (secenek.secenek_ses_dosyasi && secenek.secenek_ses_dosyasi.trim()) ? secenek.secenek_ses_dosyasi.trim() : null;
      const secRengi = (secenek.secenek_rengi && secenek.secenek_rengi.trim()) ? secenek.secenek_rengi.trim() : null;
      const dogruCevap = secenek.dogru_cevap === true || secenek.dogru_cevap === 1 ? 1 : 0;
      const siralama = secenek.siralama ?? 0;
      const { rows: secRows } = await pool.query(
        `INSERT INTO kitap_soru_secenekleri (soru_id, secenek_metni, secenek_gorseli, secenek_ses_dosyasi, secenek_rengi, kategori, dogru_cevap, siralama) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [soruId, secMetni, secGorseli, secSes, secRengi, secenek.kategori || null, dogruCevap, siralama]
      );
      if (dogruCevap === 1 && dogruCevapId === null) dogruCevapId = secRows[0].id;
    }
    if (dogruCevapId) {
      await pool.query('UPDATE kitap_sorulari SET dogru_cevap_id = $1 WHERE id = $2', [dogruCevapId, soruId]);
    }

    return res.status(201).json({ success: true, message: 'Soru eklendi', data: { id: soruId } });
  } catch (error) {
    console.error('Kitap soru ekleme hatası:', error);
    return res.status(500).json({ success: false, message: 'Soru eklenirken hata oluştu' });
  }
});

/** PUT /:id/sorular/siralama */
router.put('/:id/sorular/siralama', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { id } = req.params;
    const { soruSiralamalari } = req.body;
    if (!soruSiralamalari || !Array.isArray(soruSiralamalari)) {
      return res.status(400).json({ success: false, message: 'soruSiralamalari gereklidir' });
    }
    const { rows } = await pool.query('SELECT id FROM kitaplar WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const offset = 100000;
      const hedefNumaralar = soruSiralamalari.map(s => Number(s.soru_numarasi));
      const listedekiSoruIds = soruSiralamalari.map(s => Number(s.soru_id));

      for (const { soru_id } of soruSiralamalari) {
        const { rows: kontrol } = await client.query('SELECT id FROM kitap_sorulari WHERE id = $1 AND kitap_id = $2', [soru_id, id]);
        if (kontrol.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: `Soru ${soru_id} bulunamadı` });
        }
      }
      if (hedefNumaralar.length > 0 && listedekiSoruIds.length > 0) {
        await client.query(
          `UPDATE kitap_sorulari SET soru_numarasi = (id + $1) WHERE kitap_id = $2 AND soru_numarasi = ANY($3) AND NOT (id = ANY($4))`,
          [offset, id, hedefNumaralar, listedekiSoruIds]
        );
      }
      for (const { soru_id } of soruSiralamalari) {
        await client.query('UPDATE kitap_sorulari SET soru_numarasi = $1 WHERE id = $2 AND kitap_id = $3', [offset + Number(soru_id), soru_id, id]);
      }
      for (const { soru_id, soru_numarasi } of soruSiralamalari) {
        await client.query('UPDATE kitap_sorulari SET soru_numarasi = $1 WHERE id = $2 AND kitap_id = $3', [soru_numarasi, soru_id, id]);
      }
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Sıralama güncellendi' });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Sıralama hatası:', error);
    return res.status(500).json({ success: false, message: 'Sıralama güncellenirken hata oluştu' });
  }
});

/** PUT /:id/sorular/:soruId - Soru güncelle */
router.put('/:id/sorular/:soruId(\\d+)', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { id, soruId } = req.params;
    const { soru_numarasi, soru_turu, soru_adi, soru_metni, soru_puan, ses_dosyasi, video_url, ek_bilgi, yonerge, yonerge_ses_dosyasi, secenekler, secenek_arka_plan_gorseli, soru_gorseli, dogru_tik_gorsel, asamali, asamalar } = req.body;

    const { rows: kitaplar } = await pool.query('SELECT id FROM kitaplar WHERE id = $1', [id]);
    if (kitaplar.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });

    const turResult = await pool.query('SELECT soru_turu FROM kitap_sorulari WHERE id = $1 AND kitap_id = $2', [soruId, id]);
    const guncelTur = soru_turu || turResult.rows[0]?.soru_turu;
    const updateValidation = validateSoruGuncelle(req.body, guncelTur, { kitaplarMi: true });
    if (!updateValidation.ok) {
      return res.status(400).json({ success: false, message: updateValidation.message });
    }

    const isAsamali = asamali === true || asamali === 'true' || asamali === 1 || asamali === '1';
    const soruAdiVal = (soru_adi != null && String(soru_adi).trim() !== '') ? String(soru_adi).trim() : null;
    const soruMetniVal = (soru_metni != null && String(soru_metni).trim() !== '') ? String(soru_metni).trim() : null;
    const yonergeVal = (yonerge != null && String(yonerge).trim() !== '') ? String(yonerge).trim() : null;
    const yonergeSesVal = (yonerge_ses_dosyasi != null && String(yonerge_ses_dosyasi).trim() !== '') ? String(yonerge_ses_dosyasi).trim() : null;
    const secArka = (secenek_arka_plan_gorseli != null && String(secenek_arka_plan_gorseli).trim() !== '') ? String(secenek_arka_plan_gorseli).trim() : null;
    const videoUrlVal = (video_url != null && String(video_url).trim() !== '') ? String(video_url).trim() : null;
    const soruGorseliVal = (soru_gorseli != null && String(soru_gorseli).trim() !== '') ? String(soru_gorseli).trim() : null;
    const dogruTikGorselVal = (dogru_tik_gorsel != null && String(dogru_tik_gorsel).trim() !== '') ? String(dogru_tik_gorsel).trim() : null;
    const asamaliVal = !!isAsamali;

    await pool.query(
      `UPDATE kitap_sorulari SET soru_turu = $1, soru_puan = $2, ses_dosyasi = $3, soru_adi = $4, soru_metni = $5, dogru_cevap_id = NULL, ek_bilgi = $6, yonerge = $7, yonerge_ses_dosyasi = $8, secenek_arka_plan_gorseli = $9, video_url = $10, soru_gorseli = $11, dogru_tik_gorsel = $12, asamali = $13${soru_numarasi != null ? ', soru_numarasi = $14' : ''} WHERE id = ${soru_numarasi != null ? '$15' : '$14'}`,
      soru_numarasi != null
        ? [guncelTur, soru_puan || null, ses_dosyasi || null, soruAdiVal, soruMetniVal, ek_bilgi || null, yonergeVal, yonergeSesVal, secArka, videoUrlVal, soruGorseliVal, dogruTikGorselVal, asamaliVal, soru_numarasi, soruId]
        : [guncelTur, soru_puan || null, ses_dosyasi || null, soruAdiVal, soruMetniVal, ek_bilgi || null, yonergeVal, yonergeSesVal, secArka, videoUrlVal, soruGorseliVal, dogruTikGorselVal, asamaliVal, soruId]
    );

    await pool.query('DELETE FROM kitap_soru_asamalari WHERE soru_id = $1', [soruId]).catch(() => {});
    const asamalarListesiGuncel = (asamaliVal && asamalar && Array.isArray(asamalar)) ? asamalar : [];
    for (let i = 0; i < asamalarListesiGuncel.length; i++) {
      const a = asamalarListesiGuncel[i];
      const asamaNum = (a.asama_numarasi != null) ? Number(a.asama_numarasi) : (i + 1);
      const icerik = (a.icerik && typeof a.icerik === 'object') ? a.icerik : (typeof a === 'object' && !a.asama_numarasi ? a : {});
      await pool.query('INSERT INTO kitap_soru_asamalari (soru_id, asama_numarasi, icerik) VALUES ($1, $2, $3)', [soruId, asamaNum, typeof icerik === 'string' ? icerik : JSON.stringify(icerik)]).catch(() => {});
    }

    await pool.query('DELETE FROM kitap_soru_secenekleri WHERE soru_id = $1', [soruId]);

    let dogruCevapId = null;
    const secenekListesiGuncelleme = (secenekler || []);
    for (const secenek of secenekListesiGuncelleme) {
      const secMetni = (secenek.secenek_metni && secenek.secenek_metni.trim()) ? secenek.secenek_metni.trim() : null;
      const secGorseli = (secenek.secenek_gorseli && secenek.secenek_gorseli.trim()) ? secenek.secenek_gorseli.trim() : null;
      const secSes = (secenek.secenek_ses_dosyasi && secenek.secenek_ses_dosyasi.trim()) ? secenek.secenek_ses_dosyasi.trim() : null;
      const secRengi = (secenek.secenek_rengi && secenek.secenek_rengi.trim()) ? secenek.secenek_rengi.trim() : null;
      const dogruCevap = secenek.dogru_cevap === true || secenek.dogru_cevap === 1 ? 1 : 0;
      const siralama = secenek.siralama ?? 0;
      const { rows: secRows } = await pool.query(
        `INSERT INTO kitap_soru_secenekleri (soru_id, secenek_metni, secenek_gorseli, secenek_ses_dosyasi, secenek_rengi, kategori, dogru_cevap, siralama) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [soruId, secMetni, secGorseli, secSes, secRengi, secenek.kategori || null, dogruCevap, siralama]
      );
      if (dogruCevap === 1 && dogruCevapId === null) dogruCevapId = secRows[0].id;
    }
    if (dogruCevapId) {
      await pool.query('UPDATE kitap_sorulari SET dogru_cevap_id = $1 WHERE id = $2', [dogruCevapId, soruId]);
    }

    return res.json({ success: true, message: 'Soru güncellendi', data: { id: soruId } });
  } catch (error) {
    console.error('Soru güncelleme hatası:', error);
    return res.status(500).json({ success: false, message: 'Soru güncellenirken hata oluştu' });
  }
});

/** DELETE /:id/sorular/:soruId */
router.delete('/:id/sorular/:soruId(\\d+)', authenticateToken, authorizeRoles('admin', 'ogretmen'), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ success: false, message: 'Kitaplar servisi yapılandırılmamış' });
    const { id, soruId } = req.params;
    const { rows } = await pool.query('SELECT id FROM kitaplar WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Kitap bulunamadı' });

    const { rows: soruRows } = await pool.query('SELECT id FROM kitap_sorulari WHERE id = $1 AND kitap_id = $2', [soruId, id]);
    if (soruRows.length === 0) return res.status(404).json({ success: false, message: 'Soru bulunamadı' });

    await pool.query('DELETE FROM kitap_soru_secenekleri WHERE soru_id = $1', [soruId]);
    await pool.query('DELETE FROM kitap_sorulari WHERE id = $1', [soruId]);
    return res.json({ success: true, message: 'Soru silindi' });
  } catch (error) {
    console.error('Soru silme hatası:', error);
    return res.status(500).json({ success: false, message: 'Soru silinirken hata oluştu' });
  }
});

module.exports = router;
