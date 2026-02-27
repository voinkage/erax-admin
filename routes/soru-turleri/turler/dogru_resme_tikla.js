/**
 * Soru türü: dogru_resme_tikla
 * Zorunlular: soru sesi (ses_dosyasi), soru sesi görseli (soru_gorseli), 2 görsel (secenekler), dogru_cevap_index (0 veya 1).
 * Aşamalıysa her aşamada icerik.ses_dosyasi, icerik.soru_gorseli, icerik.secenekler (2 adet), icerik.dogru_cevap_index.
 */
function validate(body, opts) {
  const { asamaliDolu, asamalar } = opts || {}

  if (asamaliDolu && asamalar && Array.isArray(asamalar)) {
    const eksik = asamalar.some((a) => {
      const icerik = a?.icerik && typeof a.icerik === 'object' ? a.icerik : {}
      const secenekler = icerik.secenekler || []
      const dogru = icerik.dogru_cevap_index
      return (
        !icerik.ses_dosyasi ||
        !String(icerik.ses_dosyasi).trim() ||
        !icerik.soru_gorseli ||
        !String(icerik.soru_gorseli).trim() ||
        secenekler.length < 2 ||
        !secenekler[0]?.gorsel ||
        !secenekler[1]?.gorsel ||
        (dogru !== 0 && dogru !== 1)
      )
    })
    if (eksik) {
      return {
        ok: false,
        message:
          'Doğru Resme Tıkla aşamalarında soru sesi, ses görseli, görsel 1, görsel 2 ve doğru cevap seçimi zorunludur.',
      }
    }
    return { ok: true }
  }

  if (!body.ses_dosyasi || !String(body.ses_dosyasi).trim()) {
    return { ok: false, message: 'Doğru Resme Tıkla için soru sesi (zorunlu) gereklidir.' }
  }
  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Doğru Resme Tıkla için soru sesi görseli (zorunlu) gereklidir.' }
  }
  const secenekler = body.secenekler || []
  if (secenekler.length < 2 || !secenekler[0]?.gorsel || !secenekler[1]?.gorsel) {
    return { ok: false, message: 'Doğru Resme Tıkla için görsel 1 ve görsel 2 (zorunlu) gereklidir.' }
  }
  const dogru = body.dogru_cevap_index
  if (dogru !== 0 && dogru !== 1) {
    return { ok: false, message: 'Doğru cevap olarak görsel 1 veya görsel 2 seçilmelidir.' }
  }
  return { ok: true }
}

module.exports = { validate }
