const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { kullaniciPool: pool, organizasyonPool } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Tüm kullanıcıları listele (Admin - tüm kullanıcılar, Öğretmen - sınıfındaki öğrenciler)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = '';
    let params = [];

    // Pool kontrolü
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'KULLANICI_DB_URL environment variable eksik!'
      });
    }

    if (req.user.rol === 'admin') {
      query = `
        SELECT k.id, k.kullanici_adi, k.email, k.ad_soyad, k.telefon, k.rol, k.okul_id, k.avatar, k.durum
        FROM kullanicilar k
        WHERE k.rol != 'admin'
        ORDER BY k.olusturma_tarihi DESC
      `;
    } else if (req.user.rol === 'ogretmen') {
      // Önce öğretmenin sınıflarındaki öğrenci ID'lerini al (ORGANIZASYON_DB'den)
      let ogrenciIds = [];
      if (organizasyonPool) {
        try {
          const { rows: ogretmenSiniflar } = await organizasyonPool.query(
            'SELECT sinif_id FROM ogretmen_sinif WHERE ogretmen_id = $1 AND durum = $2',
            [req.user.id, 'aktif']
          );
          const sinifIds = ogretmenSiniflar.map(os => os.sinif_id);
          if (sinifIds.length > 0) {
            const placeholders = sinifIds.map((_, i) => `$${i + 1}`).join(',');
            const { rows: ogrenciSiniflar } = await organizasyonPool.query(
              `SELECT DISTINCT ogrenci_id FROM ogrenci_sinif WHERE sinif_id IN (${placeholders}) AND bag_durum = $${sinifIds.length + 1}`,
              [...sinifIds, 'aktif']
            );
            ogrenciIds = ogrenciSiniflar.map(os => os.ogrenci_id);
          }
        } catch (err) {
          console.error('Öğretmen sınıf bilgisi alınamadı:', err.message);
        }
      }
      
      if (ogrenciIds.length > 0) {
        const placeholders = ogrenciIds.map((_, i) => `$${i + 1}`).join(',');
        query = `
          SELECT k.id, k.kullanici_adi, k.email, k.ad_soyad, k.telefon, k.rol, k.okul_id, k.avatar, k.durum
          FROM kullanicilar k
          WHERE k.id IN (${placeholders}) AND k.rol = 'ogrenci' AND k.durum = 'aktif'
          ORDER BY k.ad_soyad
        `;
        params = ogrenciIds;
      } else {
        query = 'SELECT * FROM kullanicilar WHERE 1=0';
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    const { rows: kullanicilar } = await pool.query(query, params);

    // Okul bilgilerini ayrı sorgu ile al (ORGANIZASYON_DB'den)
    const okulIds = [...new Set(kullanicilar.map(k => k.okul_id).filter(Boolean))];
    const okulMap = new Map();
    if (okulIds.length > 0 && organizasyonPool) {
      try {
        const placeholders = okulIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows: okullar } = await organizasyonPool.query(
          `SELECT id, ad FROM okullar WHERE id IN (${placeholders})`,
          okulIds
        );
        okullar.forEach(o => okulMap.set(o.id, o.ad));
      } catch (err) {
        console.error('Okul bilgileri alınamadı:', err.message);
      }
    }

    // Sınıf bilgilerini ayrı sorgu ile al (ORGANIZASYON_DB'den)
    const sinifMap = new Map();
    if (organizasyonPool) {
      try {
        // Öğrenci sınıf ilişkileri
        const ogrenciIds = kullanicilar.filter(k => k.rol === 'ogrenci').map(k => k.id);
        if (ogrenciIds.length > 0) {
          const placeholders = ogrenciIds.map((_, i) => `$${i + 1}`).join(',');
          const { rows: ogrenciSiniflar } = await organizasyonPool.query(
            `SELECT os.ogrenci_id, s.id as sinif_id, s.sinif_seviyesi, s.kod 
             FROM ogrenci_sinif os
             INNER JOIN siniflar s ON os.sinif_id = s.id
             WHERE os.ogrenci_id IN (${placeholders}) AND os.bag_durum = 'aktif'`,
            ogrenciIds
          );
          ogrenciSiniflar.forEach(os => {
            if (!sinifMap.has(os.ogrenci_id)) {
              sinifMap.set(os.ogrenci_id, {
                id: os.sinif_id,
                sinif_seviyesi: os.sinif_seviyesi,
                kod: os.kod
              });
            }
          });
        }
        
        // Öğretmen sınıf ilişkileri
        const ogretmenIds = kullanicilar.filter(k => k.rol === 'ogretmen').map(k => k.id);
        if (ogretmenIds.length > 0) {
          const placeholders = ogretmenIds.map((_, i) => `$${i + 1}`).join(',');
          const { rows: ogretmenSiniflar } = await organizasyonPool.query(
            `SELECT ogs.ogretmen_id, s.id as sinif_id, s.sinif_seviyesi, s.kod 
             FROM ogretmen_sinif ogs
             INNER JOIN siniflar s ON ogs.sinif_id = s.id
             WHERE ogs.ogretmen_id IN (${placeholders}) AND ogs.durum = 'aktif'
             LIMIT 1`,
            ogretmenIds
          );
          ogretmenSiniflar.forEach(ogs => {
            if (!sinifMap.has(ogs.ogretmen_id)) {
              sinifMap.set(ogs.ogretmen_id, {
                id: ogs.sinif_id,
                sinif_seviyesi: ogs.sinif_seviyesi,
                kod: ogs.kod
              });
            }
          });
        }
      } catch (err) {
        console.error('Sınıf bilgileri alınamadı:', err.message);
      }
    }

    // Kullanıcılara okul ve sınıf bilgilerini ekle
    const kullanicilarWithSiniflar = kullanicilar.map((kullanici) => {
      const sinifBilgisi = sinifMap.get(kullanici.id);

      return {
        id: kullanici.id,
        kullanici_adi: kullanici.kullanici_adi,
        email: kullanici.email,
        ad_soyad: kullanici.ad_soyad,
        telefon: kullanici.telefon,
        rol: kullanici.rol,
        okul_id: kullanici.okul_id,
        avatar: kullanici.avatar,
        durum: kullanici.durum,
        okul_adi: kullanici.okul_id ? okulMap.get(kullanici.okul_id) || null : null,
        sinif_id: sinifBilgisi ? sinifBilgisi.id : null,
        sinif_ad: sinifBilgisi && sinifBilgisi.sinif_seviyesi ? `${sinifBilgisi.sinif_seviyesi}. Sınıf` : null,
        sinif_kod: sinifBilgisi ? sinifBilgisi.kod : null
      };
    });

    res.json({
      success: true,
      data: kullanicilarWithSiniflar
    });
  } catch (error) {
    console.error('Kullanıcı listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcılar listelenirken bir hata oluştu'
    });
  }
});

// Kullanıcı ekle
router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { kullanici_adi, email, sifre, ad_soyad, telefon, tc_kimlik_no, rol, okul_id } = req.body;

    if (!kullanici_adi || !email || !sifre || !ad_soyad || !telefon || !rol) {
      return res.status(400).json({
        success: false,
        message: 'Tüm zorunlu alanlar doldurulmalıdır (kullanıcı adı, email, şifre, ad soyad, telefon, rol)'
      });
    }

    if (!['admin', 'ogretmen', 'ogrenci', 'veli'].includes(rol)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz rol'
      });
    }

    // TC Kimlik No validasyonu (11 haneli olmalı)
    if (tc_kimlik_no && tc_kimlik_no.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'TC Kimlik No 11 haneli olmalıdır'
      });
    }

    // TC Kimlik No unique kontrolü (eğer girilmişse)
    if (tc_kimlik_no) {
      const { rows: existingTc } = await pool.query(
        'SELECT id FROM kullanicilar WHERE tc_kimlik_no = $1',
        [tc_kimlik_no]
      );
      
      if (existingTc.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu TC Kimlik No zaten kullanılıyor'
        });
      }
    }

    // Kullanıcı adı, email ve telefon kontrolü
    const { rows: existingUser } = await pool.query(
      'SELECT id, kullanici_adi, email, telefon FROM kullanicilar WHERE kullanici_adi = $1 OR email = $2 OR telefon = $3',
      [kullanici_adi, email, telefon]
    );

    if (existingUser.length > 0) {
      const existing = existingUser[0];
      if (existing.kullanici_adi === kullanici_adi) {
        return res.status(400).json({
          success: false,
          message: 'Bu kullanıcı adı zaten kullanılıyor'
        });
      }
      if (existing.email === email) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
      if (existing.telefon === telefon) {
        return res.status(400).json({
          success: false,
          message: 'Bu telefon numarası zaten kullanılıyor'
        });
      }
    }

    // Şifreyi hashle
    const hashedPassword = await bcrypt.hash(sifre, 10);

    const { rows: result } = await pool.query(
      'INSERT INTO kullanicilar (kullanici_adi, email, sifre, ad_soyad, telefon, tc_kimlik_no, rol, okul_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [kullanici_adi, email, hashedPassword, ad_soyad, telefon, tc_kimlik_no || null, rol, okul_id || null]
    );

    // Öğrenci ise istatistik kaydı oluştur
    if (rol === 'ogrenci') {
      await pool.query(
        'INSERT INTO ogrenci_istatistikleri (ogrenci_id) VALUES ($1)',
        [result[0].id]
      );
    }
    // Not: ogretmen_puanlari tablosu backend_etkinlik veritabanında
    // Öğretmen puan kaydı ilk puan kazanıldığında otomatik oluşturulacak

    res.status(201).json({
      success: true,
      message: 'Kullanıcı başarıyla eklendi',
      data: { id: result[0].id }
    });
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı adı veya email zaten kullanılıyor'
      });
    }
    console.error('Kullanıcı ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı eklenirken bir hata oluştu'
    });
  }
});

// Kullanıcı güncelle
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { kullanici_adi, email, ad_soyad, telefon, tc_kimlik_no, sifre, okul_id, avatar, durum, sinif_id, sinif_ids } = req.body;

    // Yetki kontrolü: Admin herkesi, kullanıcılar sadece kendilerini düzenleyebilir
    if (req.user.rol !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    let updateFields = [];
    let updateValues = [];

    // Güncelleme için mevcut kullanıcı bilgilerini al
    const { rows: currentUser } = await pool.query(
      'SELECT kullanici_adi, email, telefon, tc_kimlik_no, rol FROM kullanicilar WHERE id = $1',
      [id]
    );

    if (currentUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const current = currentUser[0];
    const isOgrenciSelfEdit = current.rol === 'ogrenci' && req.user.id === parseInt(id);

    if (kullanici_adi && kullanici_adi !== current.kullanici_adi && !isOgrenciSelfEdit) {
      // Kullanıcı adı değiştiriliyorsa kontrol et
      const { rows: existing } = await pool.query(
        'SELECT id FROM kullanicilar WHERE kullanici_adi = $1 AND id != $2',
        [kullanici_adi, id]
      );
      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu kullanıcı adı zaten kullanılıyor'
        });
      }
      updateFields.push(`kullanici_adi = $${updateValues.length + 1}`);
      updateValues.push(kullanici_adi);
    }
    
    if (email && email !== current.email) {
      // Email değiştiriliyorsa kontrol et
      const { rows: existing } = await pool.query(
        'SELECT id FROM kullanicilar WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
      updateFields.push(`email = $${updateValues.length + 1}`);
      updateValues.push(email);
    }
    
    if (ad_soyad && !isOgrenciSelfEdit) {
      updateFields.push(`ad_soyad = $${updateValues.length + 1}`);
      updateValues.push(ad_soyad);
    }
    
    if (telefon !== undefined) {
      if (!telefon || telefon.trim() === '') {
        // Telefon alanı zorunlu
        return res.status(400).json({
          success: false,
          message: 'Telefon alanı zorunludur'
        });
      }
      const telefonTrimmed = telefon.trim();
      if (telefonTrimmed !== current.telefon) {
        // Telefon değiştiriliyorsa kontrol et
        const { rows: existing } = await pool.query(
          'SELECT id FROM kullanicilar WHERE telefon = $1 AND id != $2',
          [telefonTrimmed, id]
        );
        if (existing.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Bu telefon numarası zaten kullanılıyor'
          });
        }
      }
      updateFields.push(`telefon = $${updateValues.length + 1}`);
      updateValues.push(telefonTrimmed);
    }
    
    if (tc_kimlik_no !== undefined && !isOgrenciSelfEdit) {
      // TC Kimlik No validasyonu (11 haneli olmalı)
      if (tc_kimlik_no && tc_kimlik_no.trim().length > 0 && tc_kimlik_no.trim().length !== 11) {
        return res.status(400).json({
          success: false,
          message: 'TC Kimlik No 11 haneli olmalıdır'
        });
      }
      
      const tcKimlikTrimmed = tc_kimlik_no ? tc_kimlik_no.trim() : null;
      
      // TC Kimlik No değiştiriliyorsa ve girilmişse unique kontrolü yap
      if (tcKimlikTrimmed && tcKimlikTrimmed !== (current.tc_kimlik_no || '')) {
        const { rows: existingTc } = await pool.query(
          'SELECT id FROM kullanicilar WHERE tc_kimlik_no = $1 AND id != $2',
          [tcKimlikTrimmed, id]
        );
        if (existingTc.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Bu TC Kimlik No zaten kullanılıyor'
          });
        }
      }
      
      updateFields.push(`tc_kimlik_no = $${updateValues.length + 1}`);
      updateValues.push(tcKimlikTrimmed);
    }
    
    if (sifre) {
      const hashedPassword = await bcrypt.hash(sifre, 10);
      updateFields.push(`sifre = $${updateValues.length + 1}`);
      updateValues.push(hashedPassword);
    }
    if (okul_id !== undefined && req.user.rol === 'admin') {
      updateFields.push(`okul_id = $${updateValues.length + 1}`);
      updateValues.push(okul_id);
    }
    if (avatar !== undefined) {
      updateFields.push(`avatar = $${updateValues.length + 1}`);
      updateValues.push(avatar);
    }
    if (durum !== undefined && req.user.rol === 'admin') {
      updateFields.push(`durum = $${updateValues.length + 1}`);
      updateValues.push(durum);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Güncellenecek alan belirtilmedi'
      });
    }

    updateValues.push(id);
    await pool.query(
      `UPDATE kullanicilar SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
      updateValues
    );

    // Eğer öğretmen ise ve sinif_ids verilmişse, ogretmen_sinif tablosunu güncelle
    if (sinif_ids !== undefined && Array.isArray(sinif_ids) && organizasyonPool) {
      try {
        // Önce kullanıcının öğretmen olup olmadığını kontrol et
        const { rows: kullanici } = await pool.query(
          'SELECT rol FROM kullanicilar WHERE id = $1',
          [id]
        );

        if (kullanici.length > 0 && kullanici[0].rol === 'ogretmen') {
          // Öğretmenin mevcut aktif sınıflarını al
          const { rows: mevcutSiniflar } = await organizasyonPool.query(
            'SELECT sinif_id FROM ogretmen_sinif WHERE ogretmen_id = $1 AND durum = $2',
            [id, 'aktif']
          );
          const mevcutSinifIds = mevcutSiniflar.map(s => s.sinif_id);
          
          // Yeni sınıf ID'lerini number'a çevir
          const yeniSinifIds = sinif_ids.map(sid => Number(sid)).filter(sid => !isNaN(sid));
          
          // Kaldırılacak sınıfları bul (mevcut ama yeni listede yok)
          const kaldirilacakSiniflar = mevcutSinifIds.filter(sid => !yeniSinifIds.includes(sid));
          
          // Eklenmesi gereken sınıfları bul (yeni listede var ama mevcut değil)
          const eklenecekSiniflar = yeniSinifIds.filter(sid => !mevcutSinifIds.includes(sid));
          
          // Kaldırılacak sınıfları pasif yap
          if (kaldirilacakSiniflar.length > 0) {
            const placeholders = kaldirilacakSiniflar.map((_, i) => `$${i + 1}`).join(',');
            await organizasyonPool.query(
              `UPDATE ogretmen_sinif SET durum = 'pasif' WHERE ogretmen_id = $${kaldirilacakSiniflar.length + 1} AND sinif_id IN (${placeholders})`,
              [...kaldirilacakSiniflar, id]
            );
          }
          
          // Yeni sınıfları ekle veya güncelle
          for (const sinifId of eklenecekSiniflar) {
            // Sınıf kontrolü
            const { rows: siniflar } = await organizasyonPool.query(
              'SELECT id FROM siniflar WHERE id = $1 AND durum = $2',
              [sinifId, 'aktif']
            );
            
            if (siniflar.length > 0) {
              await organizasyonPool.query(
                `INSERT INTO ogretmen_sinif (ogretmen_id, sinif_id, durum, bag_tarihi) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
                 ON CONFLICT (ogretmen_id, sinif_id) 
                 DO UPDATE SET durum = $3, bag_tarihi = CURRENT_TIMESTAMP`,
                [id, sinifId, 'aktif']
              );
            }
          }
          
          console.log(`✅ Öğretmen ${id} için ${eklenecekSiniflar.length} sınıf eklendi, ${kaldirilacakSiniflar.length} sınıf kaldırıldı`);
        }
      } catch (error) {
        console.error('Öğretmen sınıf güncelleme hatası:', error);
      }
    }

    // Eğer öğrenci ise ve sinif_id verilmişse, ogrenci_sinif tablosunu güncelle
    if (sinif_id !== undefined && sinif_id !== null && sinif_id !== '' && organizasyonPool) {
      try {
        // Önce kullanıcının öğrenci olup olmadığını kontrol et
        const { rows: kullanici } = await pool.query(
          'SELECT rol FROM kullanicilar WHERE id = $1',
          [id]
        );

        if (kullanici.length > 0 && kullanici[0].rol === 'ogrenci') {
          const sinifIdNum = Number(sinif_id);
          
          // Sınıf kontrolü
          const { rows: siniflar } = await organizasyonPool.query(
            'SELECT id FROM siniflar WHERE id = $1 AND durum = $2',
            [sinifIdNum, 'aktif']
          );

          if (siniflar.length > 0) {
            // Öğrencinin mevcut aktif sınıflarını pasif yap
            await organizasyonPool.query(
              'UPDATE ogrenci_sinif SET bag_durum = $1 WHERE ogrenci_id = $2 AND bag_durum = $3',
              ['pasif', id, 'aktif']
            );

            // Yeni sınıf ilişkisini ekle veya güncelle
            await organizasyonPool.query(
              `INSERT INTO ogrenci_sinif (ogrenci_id, sinif_id, bag_durum, bag_tarihi) 
               VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
               ON CONFLICT (ogrenci_id, sinif_id) 
               DO UPDATE SET bag_durum = $3, bag_tarihi = CURRENT_TIMESTAMP`,
              [id, sinifIdNum, 'aktif']
            );
            
            console.log(`✅ Öğrenci ${id} sınıf ${sinifIdNum}'a atandı`);
          } else {
            console.warn(`⚠️ Sınıf ${sinifIdNum} bulunamadı veya aktif değil`);
          }
        }
      } catch (error) {
        console.error('Öğrenci sınıf güncelleme hatası:', error);
        // Hata olsa bile kullanıcı güncellemesi başarılı sayılır
      }
    } else if (sinif_id === null || sinif_id === '') {
      // Sınıf seçimi kaldırıldıysa, mevcut aktif sınıftan çıkar
      try {
        const { rows: kullanici } = await pool.query(
          'SELECT rol FROM kullanicilar WHERE id = $1',
          [id]
        );

        if (kullanici.length > 0 && kullanici[0].rol === 'ogrenci' && organizasyonPool) {
          await organizasyonPool.query(
            'UPDATE ogrenci_sinif SET bag_durum = $1 WHERE ogrenci_id = $2 AND bag_durum = $3',
            ['pasif', id, 'aktif']
          );
          console.log(`✅ Öğrenci ${id} tüm sınıflardan çıkarıldı`);
        }
      } catch (error) {
        console.error('Öğrenci sınıf kaldırma hatası:', error);
      }
    }

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla güncellendi'
    });
  } catch (error) {
    if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı adı veya email zaten kullanılıyor'
      });
    }
    console.error('Kullanıcı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı güncellenirken bir hata oluştu'
    });
  }
});

// Kullanıcı sil
router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Kendini silmeye çalışıyor mu kontrol et
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: 'Kendi hesabınızı silemezsiniz'
      });
    }

    // Kullanıcıya ait aktivasyon kodlarını bul ve deaktif et
    // kullanici_id zaten ON DELETE SET NULL ile otomatik NULL olacak
    // kullanildi = TRUE bırakıyoruz (kod kullanılmış görünür ama kullanıcı silindiği için tekrar kullanılamaz)
    // kullanici_adi ve kullanim_tarihi alanlarını temizliyoruz
    await pool.query(
      `UPDATE aktivasyon_kodlari 
       SET kullanici_adi = NULL, 
           kullanim_tarihi = NULL
       WHERE kullanici_id = $1 AND kullanildi = TRUE`,
      [id]
    );

    // Kullanıcıyı sil
    await pool.query('DELETE FROM kullanicilar WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla silindi ve bağlı aktivasyon kodları deaktif edildi'
    });
  } catch (error) {
    console.error('Kullanıcı silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı silinirken bir hata oluştu'
    });
  }
});

// Öğrencinin veli kodunu getir (sadece kendi kodunu görebilir)
router.get('/:id/veli-kodu', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    // Sadece kendi veli kodunu görebilir veya admin
    if (req.user.id !== userId && req.user.rol !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    // Kullanıcının öğrenci olduğunu kontrol et
    const { rows: kullanicilar } = await pool.query(
      'SELECT id, rol FROM kullanicilar WHERE id = $1',
      [userId]
    );

    if (kullanicilar.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    if (kullanicilar[0].rol !== 'ogrenci') {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı öğrenci değil'
      });
    }

    // Veli kodunu bul (ORGANIZASYON_DB'den)
    if (!organizasyonPool) {
      return res.status(500).json({
        success: false,
        message: 'Veli kodu alınamadı'
      });
    }

    const { rows: veliKodlari } = await organizasyonPool.query(
      'SELECT kod, durum FROM veli_kodlari WHERE ogrenci_id = $1 ORDER BY olusturma_tarihi DESC LIMIT 1',
      [userId]
    );

    if (veliKodlari.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Veli kodu bulunamadı'
      });
    }

    res.json({
      success: true,
      data: {
        kod: veliKodlari[0].kod,
        durum: veliKodlari[0].durum
      }
    });
  } catch (error) {
    console.error('Veli kodu getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Veli kodu alınırken bir hata oluştu'
    });
  }
});

// Öğrencinin velilerini getir (öğrenci sadece kendi velilerini görebilir)
router.get('/:id/veliler', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const userIdInt = parseInt(req.user.id);

    // Sadece kendi velilerini görebilir veya admin
    if (userIdInt !== userId && req.user.rol !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    // Kullanıcının öğrenci olduğunu kontrol et
    const { rows: kullanicilar } = await pool.query(
      'SELECT id, rol FROM kullanicilar WHERE id = $1',
      [userId]
    );

    if (kullanicilar.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    if (kullanicilar[0].rol !== 'ogrenci') {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı öğrenci değil'
      });
    }

    // Öğrencinin velilerini bul
    const { rows: veliler } = await pool.query(
      `SELECT 
        vo.veli_id,
        vo.iliski_tipi,
        k.id,
        k.kullanici_adi,
        k.email,
        k.ad_soyad,
        k.telefon,
        k.avatar,
        vo.olusturma_tarihi
      FROM veli_ogrenci vo
      INNER JOIN kullanicilar k ON vo.veli_id = k.id
      WHERE vo.ogrenci_id = $1 AND vo.durum = $2 AND k.rol = $3
      ORDER BY vo.olusturma_tarihi ASC`,
      [userId, 'aktif', 'veli']
    );

    res.json({
      success: true,
      data: veliler.map(veli => ({
        id: veli.id,
        kullanici_adi: veli.kullanici_adi,
        email: veli.email,
        ad_soyad: veli.ad_soyad,
        telefon: veli.telefon,
        avatar: veli.avatar,
        iliski_tipi: veli.iliski_tipi,
        olusturma_tarihi: veli.olusturma_tarihi
      }))
    });
  } catch (error) {
    console.error('Veli bilgileri getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Veli bilgileri alınırken bir hata oluştu'
    });
  }
});

// Kullanıcı detayı
// Öğretmene sınıf ata
router.post('/:id/siniflar', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { sinif_id } = req.body;

    if (!sinif_id) {
      return res.status(400).json({
        success: false,
        message: 'Sınıf ID gereklidir'
      });
    }

    // Öğretmen kontrolü
    const { rows: ogretmenler } = await pool.query(
      'SELECT id FROM kullanicilar WHERE id = $1 AND rol = $2 AND durum = $3',
      [id, 'ogretmen', 'aktif']
    );

    if (ogretmenler.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz öğretmen'
      });
    }

    // Pool kontrolü
    if (!organizasyonPool) {
      return res.status(500).json({
        success: false,
        message: 'ORGANIZASYON_DB_URL environment variable eksik!'
      });
    }

    // Sınıf kontrolü
    const { rows: siniflar } = await organizasyonPool.query(
      'SELECT id FROM siniflar WHERE id = $1 AND durum = $2',
      [sinif_id, 'aktif']
    );

    if (siniflar.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz sınıf'
      });
    }

    // Pool kontrolü
    if (!organizasyonPool) {
      return res.status(500).json({
        success: false,
        message: 'ORGANIZASYON_DB_URL environment variable eksik!'
      });
    }

    // Öğretmen-sınıf ilişkisini ekle (zaten varsa hata verme, sadece durumu güncelle)
    await organizasyonPool.query(
      'INSERT INTO ogretmen_sinif (ogretmen_id, sinif_id, durum) VALUES ($1, $2, $3) ON CONFLICT (ogretmen_id, sinif_id) DO UPDATE SET durum = $4',
      [id, sinif_id, 'aktif', 'aktif']
    );

    res.json({
      success: true,
      message: 'Öğretmene sınıf başarıyla bağlandı'
    });
  } catch (error) {
    console.error('Öğretmene sınıf bağlama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sınıf bağlanırken bir hata oluştu'
    });
  }
});

// Öğretmenden sınıfı kaldır
router.delete('/:id/siniflar/:sinif_id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { id, sinif_id } = req.params;

    // Pool kontrolü
    if (!organizasyonPool) {
      return res.status(500).json({
        success: false,
        message: 'ORGANIZASYON_DB_URL environment variable eksik!'
      });
    }

    // Öğretmen-sınıf ilişkisini pasif yap
    await organizasyonPool.query(
      'UPDATE ogretmen_sinif SET durum = $1 WHERE ogretmen_id = $2 AND sinif_id = $3',
      ['pasif', id, sinif_id]
    );

    res.json({
      success: true,
      message: 'Öğretmen sınıftan çıkarıldı'
    });
  } catch (error) {
    console.error('Öğretmen sınıf çıkarma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sınıf çıkarılırken bir hata oluştu'
    });
  }
});

// Öğretmenin sınıflarını getir
router.get('/:id/siniflar', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Kullanıcı kontrolü
    const { rows: kullanicilar } = await pool.query(
      'SELECT id, rol FROM kullanicilar WHERE id = $1',
      [id]
    );

    if (kullanicilar.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const kullanici = kullanicilar[0];

    // Öğretmen ise
    if (kullanici.rol === 'ogretmen') {
      // Pool kontrolü
      if (!organizasyonPool) {
        return res.status(500).json({
          success: false,
          message: 'ORGANIZASYON_DB_URL environment variable eksik!'
        });
      }

      // Öğretmenin sınıflarını getir (ogretmen_sinif tablosundan)
      const { rows: siniflar } = await organizasyonPool.query(
        `SELECT s.*, os.durum as bag_durum, os.bag_tarihi
         FROM siniflar s
         INNER JOIN ogretmen_sinif os ON s.id = os.sinif_id
         WHERE os.ogretmen_id = $1 AND os.durum = 'aktif'
         ORDER BY s.sinif_seviyesi ASC`,
        [id]
      );
      
      // Okul bilgilerini ayrı sorgu ile al
      const okulIds = [...new Set(siniflar.map(s => s.okul_id).filter(Boolean))];
      const okulMap = new Map();
      if (okulIds.length > 0) {
        try {
          const placeholders = okulIds.map((_, i) => `$${i + 1}`).join(',');
          const { rows: okullar } = await organizasyonPool.query(
            `SELECT id, ad FROM okullar WHERE id IN (${placeholders})`,
            okulIds
          );
          okullar.forEach(o => okulMap.set(o.id, o.ad));
        } catch (err) {
          console.error('Okul bilgileri alınamadı:', err.message);
        }
      }
      
      // Sınıflara okul bilgilerini ekle
      siniflar.forEach(sinif => {
        sinif.okul_adi = sinif.okul_id ? okulMap.get(sinif.okul_id) || null : null;
      });

      return res.json({
        success: true,
        data: siniflar
      });
    }

    // Öğrenci ise
    if (kullanici.rol === 'ogrenci') {
      // Pool kontrolü
      if (!organizasyonPool) {
        return res.status(500).json({
          success: false,
          message: 'ORGANIZASYON_DB_URL environment variable eksik!'
        });
      }

      // Öğrencinin sınıflarını getir (ogrenci_sinif tablosundan)
      const { rows: siniflar } = await organizasyonPool.query(
        `SELECT s.*, os.bag_durum, os.bag_tarihi
         FROM siniflar s
         INNER JOIN ogrenci_sinif os ON s.id = os.sinif_id
         WHERE os.ogrenci_id = $1
         ORDER BY os.bag_durum DESC, s.sinif_seviyesi ASC`,
        [id]
      );
      
      // Okul bilgilerini ayrı sorgu ile al
      const okulIds = [...new Set(siniflar.map(s => s.okul_id).filter(Boolean))];
      const okulMap = new Map();
      if (okulIds.length > 0) {
        try {
          const placeholders = okulIds.map((_, i) => `$${i + 1}`).join(',');
          const { rows: okullar } = await organizasyonPool.query(
            `SELECT id, ad FROM okullar WHERE id IN (${placeholders})`,
            okulIds
          );
          okullar.forEach(o => okulMap.set(o.id, o.ad));
        } catch (err) {
          console.error('Okul bilgileri alınamadı:', err.message);
        }
      }
      
      // Sınıflara okul bilgilerini ekle
      siniflar.forEach(sinif => {
        sinif.okul_adi = sinif.okul_id ? okulMap.get(sinif.okul_id) || null : null;
      });

      return res.json({
        success: true,
        data: siniflar
      });
    }

    // Diğer roller için hata
    return res.status(400).json({
      success: false,
      message: 'Bu kullanıcı tipi için sınıf bilgisi alınamaz'
    });
  } catch (error) {
    console.error('Kullanıcı sınıfları getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sınıflar getirilirken bir hata oluştu'
    });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Yetki kontrolü
    if (req.user.rol !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz yok'
      });
    }

    // Pool kontrolü
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: 'KULLANICI_DB_URL environment variable eksik!'
      });
    }

    const { rows: kullanicilar } = await pool.query(
      `SELECT k.id, k.kullanici_adi, k.email, k.ad_soyad, k.telefon, k.rol, k.okul_id, k.avatar, k.durum, k.olusturma_tarihi
       FROM kullanicilar k
       WHERE k.id = $1`,
      [id]
    );

    if (kullanicilar.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    const kullanici = kullanicilar[0];
    
    // Okul bilgisini ayrı sorgu ile al (ORGANIZASYON_DB'den)
    let okulBilgisi = null;
    if (kullanici.okul_id && organizasyonPool) {
      try {
        const { rows: okullar } = await organizasyonPool.query(
          'SELECT ad, kod, gorsel FROM okullar WHERE id = $1',
          [kullanici.okul_id]
        );
        if (okullar.length > 0) {
          okulBilgisi = {
            id: kullanici.okul_id,
            ad: okullar[0].ad,
            kod: okullar[0].kod,
            gorsel: okullar[0].gorsel
          };
        }
      } catch (err) {
        console.error('Okul bilgisi alınamadı:', err.message);
      }
    }
    
    // Sınıf bilgisini ayrı sorgu ile al (ORGANIZASYON_DB'den)
    let sinifBilgisi = null;
    if (kullanici.rol === 'ogrenci' && organizasyonPool) {
      try {
        const { rows: ogrenciSiniflar } = await organizasyonPool.query(
          'SELECT sinif_id FROM ogrenci_sinif WHERE ogrenci_id = $1 AND bag_durum = $2 LIMIT 1',
          [kullanici.id, 'aktif']
        );
        if (ogrenciSiniflar.length > 0) {
          sinifBilgisi = { sinif_id: ogrenciSiniflar[0].sinif_id };
        }
      } catch (err) {
        console.error('Sınıf bilgisi alınamadı:', err.message);
      }
    }

    // Öğrenci ise istatistikleri de getir
    let istatistikler = null;
    if (kullanici.rol === 'ogrenci') {
      const { rows: stats } = await pool.query(
        'SELECT * FROM ogrenci_istatistikleri WHERE ogrenci_id = $1',
        [id]
      );
      istatistikler = stats[0] || null;
    }

    res.json({
      success: true,
      data: {
        id: kullanici.id,
        kullanici_adi: kullanici.kullanici_adi,
        email: kullanici.email,
        ad_soyad: kullanici.ad_soyad,
        telefon: kullanici.telefon,
        rol: kullanici.rol,
        okul_id: kullanici.okul_id,
        sinif_id: sinifBilgisi ? sinifBilgisi.sinif_id : null,
        avatar: kullanici.avatar,
        durum: kullanici.durum,
        olusturma_tarihi: kullanici.olusturma_tarihi,
        okul: okulBilgisi,
        istatistikler
      }
    });
  } catch (error) {
    console.error('Kullanıcı detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı bilgileri alınırken bir hata oluştu'
    });
  }
});

module.exports = router;

