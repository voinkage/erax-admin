/**
 * Soru türü: diyalog
 * Zorunlu: soru_gorseli (aşamalı değilse).
 */
function validate(body, opts) {
  const { isAsamali } = opts || {};
  if (isAsamali) return { ok: true };
  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Diyalog için görsel gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
