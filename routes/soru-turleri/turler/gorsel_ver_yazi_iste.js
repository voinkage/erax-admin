/**
 * Soru türü: gorsel_ver_yazi_iste
 * Zorunlu: soru_gorseli (her zaman).
 */
function validate(body) {
  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Görsel ver Yazı iste için görsel gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
