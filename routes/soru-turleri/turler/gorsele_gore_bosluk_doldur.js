/**
 * Soru türü: gorsele_gore_bosluk_doldur (Görsele Göre Boşluk Doldur)
 * Tam cümle yazılır; bir veya birden çok kelime boşluk olarak işaretlenir, öğrenci bunları doğru doldurur.
 * Aşamasız: soru_gorseli ve ek_bilgi.dogru_cumle + ek_bilgi.bosluk_indeksleri zorunlu.
 * Aşamalı: asamalar[].icerik.soru_gorseli, dogru_cumle, bosluk_indeksleri zorunlu.
 * ek_bilgi.yanlis_cevaplar (opsiyonel): string[] — bu kelimeler yazılırsa "Yanlış cevap!" uyarısı verilir.
 */
function validate(body) {
  const asamali = body.asamali === true || body.asamali === 'true' || body.asamali === 1;
  const asamalar = body.asamalar;

  function validateBoslukIndeksleri(dogruCumle, boslukIndeksleri) {
    const words = (dogruCumle || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return { ok: false, message: 'Doğru cümle en az bir kelime içermelidir' };
    if (!Array.isArray(boslukIndeksleri) || boslukIndeksleri.length === 0) {
      return { ok: false, message: 'En az bir boşluk (kelime) seçilmelidir' };
    }
    const set = new Set(boslukIndeksleri);
    for (const i of set) {
      const idx = Number(i);
      if (!Number.isInteger(idx) || idx < 0 || idx >= words.length) {
        return { ok: false, message: 'Geçersiz boşluk indeksi: ' + i };
      }
    }
    return { ok: true };
  }

  if (asamali && asamalar && Array.isArray(asamalar) && asamalar.length > 0) {
    for (let i = 0; i < asamalar.length; i++) {
      const icerik = asamalar[i]?.icerik || asamalar[i] || {};
      if (!icerik.soru_gorseli || !String(icerik.soru_gorseli).trim()) {
        return { ok: false, message: `Aşama ${i + 1} için soru görseli gereklidir` };
      }
      const cumle = (icerik.dogru_cumle || '').trim();
      if (!cumle) {
        return { ok: false, message: `Aşama ${i + 1} için doğru cümle gereklidir` };
      }
      const res = validateBoslukIndeksleri(cumle, icerik.bosluk_indeksleri);
      if (!res.ok) return { ok: false, message: `Aşama ${i + 1}: ${res.message}` };
    }
    return { ok: true };
  }

  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Görsele Göre Boşluk Doldur için soru görseli gereklidir' };
  }
  let ek = {};
  try {
    ek = typeof body.ek_bilgi === 'string' ? JSON.parse(body.ek_bilgi || '{}') : (body.ek_bilgi || {});
  } catch (_) {}
  const dogruCumle = (ek.dogru_cumle || '').trim();
  if (!dogruCumle) {
    return { ok: false, message: 'Doğru cümle gereklidir' };
  }
  const res = validateBoslukIndeksleri(dogruCumle, ek.bosluk_indeksleri);
  if (!res.ok) return res;
  return { ok: true };
}

module.exports = { validate };
