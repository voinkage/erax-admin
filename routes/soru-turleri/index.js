/**
 * Soru türleri modülü – etkinlikler.js ve kitaplar.js buradan ortak bileşenleri kullanır.
 *
 * Kullanım:
 *   const { GECERLI_TURLER, validateSoruEkle, validateSoruGuncelle, helpers } = require('./soru-turleri');
 */
const { GECERLI_TURLER, gecerliMi } = require('./gecerli-turler');
const { validateSoruEkle, validateSoruGuncelle } = require('./validators');
const helpers = require('./helpers');

module.exports = {
  GECERLI_TURLER,
  gecerliMi,
  validateSoruEkle,
  validateSoruGuncelle,
  helpers
};
