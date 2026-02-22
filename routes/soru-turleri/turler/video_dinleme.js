/**
 * Soru türü: video_dinleme
 * Zorunlu: video_url (aşamalı değilse).
 */
function validate(body, opts) {
  const { isAsamali } = opts || {};
  if (isAsamali) return { ok: true };
  if (body.video_url == null || !String(body.video_url).trim()) {
    return { ok: false, message: 'Video İzleme için video URL veya yolu gereklidir' };
  }
  return { ok: true };
}

module.exports = { validate };
