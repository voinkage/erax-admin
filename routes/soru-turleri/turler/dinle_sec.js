/**
 * Soru türü: dinle_sec
 * Zorunlular: soru sesi (ses_dosyasi), ses çalma görseli (soru_gorseli).
 * Aşamalıysa her aşamada icerik.soru_gorseli zorunlu.
 */
function validate(body, opts) {
  const { asamaliDolu, asamalar } = opts || {};
  if (asamaliDolu && asamalar && Array.isArray(asamalar)) {
    const eksik = asamalar.some(a => {
      const icerik = (a && a.icerik && typeof a.icerik === 'object') ? a.icerik : {};
      return !icerik.soru_gorseli || !String(icerik.soru_gorseli).trim();
    });
    if (eksik) {
      return { ok: false, message: 'Dinle ve Seç aşamalarında ses çalma görseli (zorunlu) gereklidir' };
    }
    return { ok: true };
  }
  if (!body.ses_dosyasi || !String(body.ses_dosyasi).trim()) {
    return { ok: false, message: 'Dinle ve Seç için soru sesi (zorunlu) gereklidir' };
  }
  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Dinle ve Seç için ses çalma görseli (zorunlu) gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
