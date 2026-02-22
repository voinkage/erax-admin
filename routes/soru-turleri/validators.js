/**
 * Soru ekleme / güncelleme validasyonu – tür bazlı modülleri kullanır.
 * Etkinlikler ve kitaplar route'ları buradan validateSoruEkle / validateSoruGuncelle çağırır.
 */
const { GECERLI_TURLER, gecerliMi } = require('./gecerli-turler');
const { getValidator, secenekZorunluMu } = require('./turler');

/**
 * @param {object} body - req.body (soru_turu, secenekler, asamali, asamalar, ...)
 * @param {object} opts - { kitaplarMi: boolean } kitaplar route'undan mı çağrıldı
 * @returns {{ ok: true }} | {{ ok: false, message: string }}
 */
function validateSoruEkle(body, opts = {}) {
  const { kitaplarMi = false } = opts;
  const soru_turu = body.soru_turu;
  const secenekler = body.secenekler;
  const asamali = body.asamali === true || body.asamali === 'true' || body.asamali === 1 || body.asamali === '1';
  const asamalar = body.asamalar;
  const asamaliDolu = asamali && asamalar && Array.isArray(asamalar) && asamalar.length > 0;

  if (!soru_turu || !gecerliMi(soru_turu)) {
    return { ok: false, message: 'Geçerli soru türü gereklidir' };
  }

  if (asamali && (!asamalar || !Array.isArray(asamalar) || asamalar.length === 0)) {
    return { ok: false, message: 'Aşamalı soru için en az bir aşama ekleyin' };
  }

  if (secenekZorunluMu(soru_turu, kitaplarMi) && !asamaliDolu) {
    if (!secenekler || !Array.isArray(secenekler) || secenekler.length === 0) {
      return { ok: false, message: 'Seçenekler gereklidir' };
    }
  }

  const validator = getValidator(soru_turu);
  const optsPass = { isAsamali: asamali, asamaliDolu, asamalar };
  const result = validator.validate(body, optsPass);
  return result;
}

/**
 * @param {object} body - req.body
 * @param {string} mevcutTur - güncellemede kullanılan tür (body'deki veya DB'deki)
 * @param {object} opts - { kitaplarMi: boolean }
 */
function validateSoruGuncelle(body, mevcutTur, opts = {}) {
  const { kitaplarMi = false } = opts;
  const secenekler = body.secenekler;
  const asamali = body.asamali === true || body.asamali === 'true' || body.asamali === 1 || body.asamali === '1';
  const asamalar = body.asamalar;
  const asamaliDolu = asamali && asamalar && Array.isArray(asamalar) && asamalar.length > 0;

  if (secenekZorunluMu(mevcutTur, kitaplarMi) && !asamaliDolu) {
    if (!secenekler || !Array.isArray(secenekler) || secenekler.length === 0) {
      return { ok: false, message: 'Seçenekler gereklidir' };
    }
  }

  const validator = getValidator(mevcutTur);
  const optsPass = { isAsamali: asamali, asamaliDolu, asamalar };
  const result = validator.validate(body, optsPass);
  return result;
}

module.exports = {
  validateSoruEkle,
  validateSoruGuncelle
};
