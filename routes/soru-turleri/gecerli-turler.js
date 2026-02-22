/**
 * Geçerli soru türleri – Etkinlik Sihirbazı ve Ünite Sihirbazı (kitaplar) ortak listesi.
 * Yeni tür eklenince buraya eklenir; validators ve turler klasörü gerekirse güncellenir.
 */
const GECERLI_TURLER = [
  'dinle_sec',
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
