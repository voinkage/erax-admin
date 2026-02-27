/**
 * Soru türü: gorsele_uygun_kelime
 * Aşamasız: soru_gorseli ve ek_bilgi.dogru_kelime zorunlu.
 * Aşamalı: asamalar[].icerik.soru_gorseli ve dogru_kelime zorunlu.
 */
function validate(body) {
  const asamali = body.asamali === true || body.asamali === 'true' || body.asamali === 1;
  const asamalar = body.asamalar;

  if (asamali && asamalar && Array.isArray(asamalar) && asamalar.length > 0) {
    for (let i = 0; i < asamalar.length; i++) {
      const icerik = asamalar[i]?.icerik || asamalar[i] || {};
      if (!icerik.soru_gorseli || !String(icerik.soru_gorseli).trim()) {
        return { ok: false, message: `Aşama ${i + 1} için soru görseli gereklidir` };
      }
      if (!icerik.dogru_kelime || !String(icerik.dogru_kelime).trim()) {
        return { ok: false, message: `Aşama ${i + 1} için doğru kelime gereklidir` };
      }
    }
    return { ok: true };
  }

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
