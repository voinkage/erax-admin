/**
 * Soru türleri ortak yardımcılar – etkinlikler ve kitaplar route'larında kullanılır.
 */

/** Boş string'leri null yapan trim; undefined/null aynen döner */
function trimStr(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/** Görsel/ikon alanları için (boş string → null) */
function iconVal(val) {
  return trimStr(val);
}

/** Aşama icerik alanını obje olarak döndürür (string ise parse eder) */
function parseAsamaIcerik(a) {
  if (!a || typeof a !== 'object') return {};
  if (a.asama_numarasi !== undefined && typeof a.icerik === 'string') {
    try {
      return JSON.parse(a.icerik) || {};
    } catch {
      return {};
    }
  }
  const icerik = a.icerik && typeof a.icerik === 'object' ? a.icerik : a;
  return typeof icerik === 'object' && icerik !== null ? icerik : {};
}

/** Body'den soru alanlarını normalize edilmiş obje olarak çıkarır (INSERT/UPDATE için) */
function normalizeSoruBody(body) {
  return {
    soru_adi: trimStr(body.soru_adi),
    soru_metni: trimStr(body.soru_metni),
    yonerge: trimStr(body.yonerge),
    yonerge_ses_dosyasi: trimStr(body.yonerge_ses_dosyasi),
    secenek_arka_plan_gorseli: trimStr(body.secenek_arka_plan_gorseli),
    video_url: trimStr(body.video_url),
    soru_gorseli: trimStr(body.soru_gorseli),
    ses_dosyasi: trimStr(body.ses_dosyasi),
    soru_puan: body.soru_puan != null ? body.soru_puan : null,
    soru_yildiz: body.soru_yildiz != null ? body.soru_yildiz : null,
    ek_bilgi: body.ek_bilgi != null ? body.ek_bilgi : null
  };
}

/** Tek bir seçenek objesini DB'ye uygun ham değerlere çevirir */
function normalizeSecenek(secenek) {
  return {
    secenek_metni: trimStr(secenek.secenek_metni),
    secenek_gorseli: trimStr(secenek.secenek_gorseli),
    secenek_ses_dosyasi: trimStr(secenek.secenek_ses_dosyasi),
    secenek_rengi: trimStr(secenek.secenek_rengi),
    kategori: secenek.kategori != null ? trimStr(secenek.kategori) : null,
    dogru_cevap: secenek.dogru_cevap === 1 || secenek.dogru_cevap === true ? 1 : 0,
    siralama: secenek.siralama ?? 0
  };
}

module.exports = {
  trimStr,
  iconVal,
  parseAsamaIcerik,
  normalizeSoruBody,
  normalizeSecenek
};
