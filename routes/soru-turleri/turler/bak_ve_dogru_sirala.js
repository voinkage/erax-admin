/**
 * Soru türü: bak_ve_dogru_sirala (Bak ve Doğru Sırala)
 * Aşamasız: soru_gorseli ve ek_bilgi.dogru_cumle zorunlu.
 * Aşamalı: asamalar[].icerik.soru_gorseli ve dogru_cumle zorunlu.
 * ek_bilgi: dogru_tik_gorsel, cumle_kutucuk, kelime_kutucuk (kutucuk stilleri).
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
      if (!icerik.dogru_cumle || !String(icerik.dogru_cumle).trim()) {
        return { ok: false, message: `Aşama ${i + 1} için doğru cümle gereklidir` };
      }
    }
    return { ok: true };
  }

  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Bak ve Doğru Sırala için soru görseli gereklidir' };
  }
  let ek = {};
  try {
    ek = typeof body.ek_bilgi === 'string' ? JSON.parse(body.ek_bilgi || '{}') : (body.ek_bilgi || {});
  } catch (_) {}
  const dogruCumle = ek.dogru_cumle;
  if (!dogruCumle || !String(dogruCumle).trim()) {
    return { ok: false, message: 'Doğru cümle gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
