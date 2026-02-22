/**
 * Soru türü: gorsel_ver_yazi_iste
 * Zorunlu: arka_plan_gorsel_yatay (her zaman).
 */
function validate(body) {
  if (!body.arka_plan_gorsel_yatay || !String(body.arka_plan_gorsel_yatay).trim()) {
    return { ok: false, message: 'Görsel ver Yazı iste için görsel gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
