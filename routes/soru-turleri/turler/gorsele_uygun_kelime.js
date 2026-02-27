/**
 * Soru türü: gorsele_uygun_kelime
 * Zorunlu: soru_gorseli, ek_bilgi içinde dogru_kelime.
 */
function validate(body) {
  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Görsele Uygun Kelime için soru görseli gereklidir' };
  }
  let ek = {};
  try {
    ek = typeof body.ek_bilgi === 'string' ? JSON.parse(body.ek_bilgi || '{}') : (body.ek_bilgi || {});
  } catch (_) {}
  const dogruKelime = ek.dogru_kelime;
  if (!dogruKelime || !String(dogruKelime).trim()) {
    return { ok: false, message: 'Doğru kelime gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
