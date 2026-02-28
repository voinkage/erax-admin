/**
 * Soru türü modülleri – her tür kendi dosyasında; buradan tek yerden erişilir.
 */
const dinle_sec = require('./dinle_sec');
const video_dinleme = require('./video_dinleme');
const diyalog = require('./diyalog');
const gorsel_ver_yazi_iste = require('./gorsel_ver_yazi_iste');
const dogru_ses_dogru_gorsel = require('./dogru_ses_dogru_gorsel');
const gorsele_uygun_kelime = require('./gorsele_uygun_kelime');
const gorsele_gore_bosluk_doldur = require('./gorsele_gore_bosluk_doldur');
const dogru_resme_tikla = require('./dogru_resme_tikla');
const bak_ve_dogru_sirala = require('./bak_ve_dogru_sirala');
const kutucugu_surukle_birak = require('./kutucugu_surukle_birak');
const gorsel_sirala = require('./gorsel_sirala');
const bak_ve_kutucuk_sec = require('./bak_ve_kutucuk_sec');
const varsayilan = require('./varsayilan');

/** Seçenek zorunlu olmayan türler (kendi validasyonları var veya seçenek opsiyonel) */
const SECENEK_ZORUNLU_DEGIL = new Set([
  'video_dinleme',
  'diyalog',
  'gorsel_ver_yazi_iste',
  'dogru_ses_dogru_gorsel',
  'gorsele_uygun_kelime',
  'gorsele_gore_bosluk_doldur',
  'dogru_resme_tikla',
  'bak_ve_dogru_sirala',
  'kutucugu_surukle_birak',
  'gorsel_sirala',
  'bak_ve_kutucuk_sec'
]);

const turModulleri = {
  dinle_sec,
  video_dinleme,
  diyalog,
  gorsel_ver_yazi_iste,
  dogru_ses_dogru_gorsel,
  gorsele_uygun_kelime,
  gorsele_gore_bosluk_doldur,
  dogru_resme_tikla,
  bak_ve_dogru_sirala,
  kutucugu_surukle_birak,
  gorsel_sirala,
  bak_ve_kutucuk_sec,
  renk_ses_eslestir: varsayilan,
  gruplama: varsayilan,
  swap_puzzle: varsayilan,
  puzzle_hatirla_yerlestir: varsayilan,
  klick_hor_gut_zu: varsayilan,
  bosluk_doldurma: varsayilan,
  eksik_harf_tamamlama: varsayilan
};

function getValidator(tur) {
  return turModulleri[tur] || varsayilan;
}

function secenekZorunluMu(tur, kitaplarMi) {
  if (SECENEK_ZORUNLU_DEGIL.has(tur)) return false;
  return true;
}

module.exports = {
  turModulleri,
  getValidator,
  secenekZorunluMu,
  SECENEK_GEREKLI_MESAJ: varsayilan.SECENEK_GEREKLI_MESAJ
};
