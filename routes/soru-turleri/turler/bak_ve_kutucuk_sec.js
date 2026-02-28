/**
 * Soru türü: bak_ve_kutucuk_sec
 * Zorunlular: soru_gorseli, secenekler (en az 1, her biri metin içermeli), dogru_cevap_index (0..n-1).
 * Aşamalıysa her aşamada icerik.soru_gorseli, icerik.secenekler, icerik.dogru_cevap_index.
 */
function validate(body, opts) {
  const { asamaliDolu, asamalar } = opts || {};
  const asamalarList = Array.isArray(asamalar) ? asamalar : [];

  function validateSecenekler(secenekler, dogruIndex) {
    if (!Array.isArray(secenekler) || secenekler.length < 1) return false;
    const n = secenekler.length;
    const di = Number(dogruIndex);
    if (Number.isNaN(di) || di < 0 || di >= n) return false;
    return secenekler.every((s) => s && String(s.metin || s.metin_yazi || '').trim() !== '');
  }

  if (asamaliDolu && asamalarList.length > 0) {
    const eksik = asamalarList.some((a) => {
      const icerik = a?.icerik && typeof a.icerik === 'object' ? a.icerik : {};
      return (
        !icerik.soru_gorseli ||
        !String(icerik.soru_gorseli).trim() ||
        !validateSecenekler(icerik.secenekler, icerik.dogru_cevap_index)
      );
    });
    if (eksik) {
      return {
        ok: false,
        message: 'Bak ve Kutucuk Seç aşamalarında soru görseli ve en az bir seçenek (metin) ile doğru cevap seçimi zorunludur.'
      };
    }
    return { ok: true };
  }

  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Bak ve Kutucuk Seç için soru görseli (zorunlu) gereklidir.' };
  }
  const secenekler = body.secenekler || [];
  const dogruIndex = body.dogru_cevap_index;
  if (!validateSecenekler(secenekler, dogruIndex)) {
    return {
      ok: false,
      message: 'En az bir seçenek ekleyin (kutucuk metni) ve doğru cevabı işaretleyin.'
    };
  }
  return { ok: true };
}

module.exports = { validate };
