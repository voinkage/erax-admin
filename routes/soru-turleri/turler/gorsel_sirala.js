/**
 * Soru türü: gorsel_sirala
 * Zorunlular: secenekler (en az 2 görsel), dogru_sira (sıra permütasyonu; her indeks 0..n-1 tam bir kez).
 * Aşamalıysa her aşamada icerik.secenekler, icerik.dogru_sira.
 */
function validate(body, opts) {
  const { asamaliDolu, asamalar } = opts || {};
  const asamalarList = Array.isArray(asamalar) ? asamalar : [];

  function validateSeceneklerVeSira(secenekler, dogru_sira) {
    if (!Array.isArray(secenekler) || secenekler.length < 2) return false;
    const hasGorsel = secenekler.every((s) => s && ((s.gorsel && String(s.gorsel).trim()) || (s.secenek_gorseli && String(s.secenek_gorseli).trim())));
    if (!hasGorsel) return false;
    const n = secenekler.length;
    if (!Array.isArray(dogru_sira) || dogru_sira.length !== n) return false;
    const set = new Set(dogru_sira.map((i) => Number(i)));
    if (set.size !== n) return false;
    for (let i = 0; i < n; i++) {
      const idx = Number(dogru_sira[i]);
      if (Number.isNaN(idx) || idx < 0 || idx >= n) return false;
    }
    return true;
  }

  if (asamaliDolu && asamalarList.length > 0) {
    const eksik = asamalarList.some((a) => {
      const icerik = a?.icerik && typeof a.icerik === 'object' ? a.icerik : {};
      return !validateSeceneklerVeSira(icerik.secenekler, icerik.dogru_sira);
    });
    if (eksik) {
      return {
        ok: false,
        message: 'Görsel Sırala aşamalarında en az 2 görsel ve doğru sıra (her pozisyon için 0..n-1 indeks) zorunludur.'
      };
    }
    return { ok: true };
  }

  const secenekler = body.secenekler;
  const dogru_sira = body.dogru_sira || (body.ek_bilgi && body.ek_bilgi.dogru_sira);
  if (!validateSeceneklerVeSira(secenekler, dogru_sira)) {
    return {
      ok: false,
      message: 'Görsel Sırala için en az 2 görsel ekleyin ve doğru sırayı belirleyin (her pozisyon için hangi görselin geleceği).'
    };
  }
  return { ok: true };
}

module.exports = { validate };
