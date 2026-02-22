/**
 * Seçenek zorunlu türler (renk_ses_eslestir, gruplama, swap_puzzle, puzzle_hatirla_yerlestir,
 * klick_hor_gut_zu, bosluk_doldurma, eksik_harf_tamamlama).
 * Sadece secenekler dizisinin dolu olması kontrolü ana validators.js'de yapılır;
 * bu modül ortak mesajı dışa verir.
 */
const SECENEK_GEREKLI_MESAJ = 'Seçenekler gereklidir';

function validate(body) {
  const secenekler = body.secenekler;
  if (!secenekler || !Array.isArray(secenekler) || secenekler.length === 0) {
    return { ok: false, message: SECENEK_GEREKLI_MESAJ };
  }
  return { ok: true };
}

module.exports = { validate, SECENEK_GEREKLI_MESAJ };
