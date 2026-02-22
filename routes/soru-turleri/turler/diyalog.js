/**
 * Soru türü: diyalog
 * Zorunlu: arka_plan_gorsel_yatay (aşamalı değilse).
 */
function validate(body, opts) {
  const { isAsamali } = opts || {};
  if (isAsamali) return { ok: true };
  if (!body.arka_plan_gorsel_yatay || !String(body.arka_plan_gorsel_yatay).trim()) {
    return { ok: false, message: 'Diyalog için görsel gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
