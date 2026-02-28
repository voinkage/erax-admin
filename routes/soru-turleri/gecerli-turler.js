/**
 * Geçerli soru türleri – Etkinlik Sihirbazı ve Ünite Sihirbazı (kitaplar) ortak listesi.
 * Yeni tür eklenince buraya eklenir; validators ve turler klasörü gerekirse güncellenir.
 */
const GECERLI_TURLER = [
  'dinle_sec',
  'gorsele_uygun_kelime',
  'gorsele_gore_bosluk_doldur',
  'kutucugu_surukle_birak',
  'gorsel_sirala',
  'bak_ve_kutucuk_sec',
  'dogru_resme_tikla',
  'bak_ve_dogru_sirala',
  'renk_ses_eslestir',
  'dogru_ses_dogru_gorsel',
  'gruplama',
  'swap_puzzle',
  'puzzle_hatirla_yerlestir',
  'klick_hor_gut_zu',
  'bosluk_doldurma',
  'eksik_harf_tamamlama',
  'video_dinleme',
  'diyalog',
  'gorsel_ver_yazi_iste'
];

function gecerliMi(tur) {
  return tur && GECERLI_TURLER.includes(tur);
}

module.exports = {
  GECERLI_TURLER,
  gecerliMi
};
