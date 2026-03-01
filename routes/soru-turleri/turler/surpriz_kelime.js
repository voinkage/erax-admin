/**
 * Soru türü: surpriz_kelime
 * İki grup (grup1, grup2), her grupta en az bir kelime. Sürpriz kelime gruplardan birine sürüklenir.
 * Aşamalı: asamalar[].icerik.grup1, grup2 (kelimeler en az 1'er).
 * Aşamasız: ek_bilgi.grup1, grup2 (kelimeler en az 1'er).
 */
function validate(body, opts) {
  const { asamaliDolu, asamalar } = opts || {};
  const asamalarList = Array.isArray(asamalar) ? asamalar : [];

  function kelimelerGecerliMi(grup) {
    if (!grup || typeof grup !== 'object') return false;
    const kelimeler = grup.kelimeler;
    if (!Array.isArray(kelimeler)) return false;
    const dolu = kelimeler.filter((w) => w != null && String(w).trim() !== '');
    return dolu.length >= 1;
  }

  function icerikGecerliMi(icerik) {
    if (!icerik || typeof icerik !== 'object') return false;
    return kelimelerGecerliMi(icerik.grup1) && kelimelerGecerliMi(icerik.grup2);
  }

  if (asamaliDolu && asamalarList.length > 0) {
    for (let i = 0; i < asamalarList.length; i++) {
      const a = asamalarList[i];
      const icerik = a?.icerik && typeof a.icerik === 'object' ? a.icerik : (typeof a?.icerik === 'string' ? (() => { try { return JSON.parse(a.icerik); } catch { return {}; } })() : {});
      if (!icerikGecerliMi(icerik)) {
        return {
          ok: false,
          message: `Aşama ${i + 1} için her iki grupta da en az bir kelime gereklidir.`
        };
      }
    }
    return { ok: true };
  }

  let ek = {};
  try {
    ek = typeof body.ek_bilgi === 'string' ? JSON.parse(body.ek_bilgi || '{}') : (body.ek_bilgi || {});
  } catch (_) {}

  if (!icerikGecerliMi(ek)) {
    return {
      ok: false,
      message: 'Sürpriz Kelime için grup 1 ve grup 2\'de en az birer kelime gereklidir.'
    };
  }
  return { ok: true };
}

module.exports = { validate };
