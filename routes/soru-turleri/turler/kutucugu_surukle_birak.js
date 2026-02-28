/**
 * Soru türü: kutucugu_surukle_birak
 * Zorunlular: soru_gorseli, hedef_konum (x,y yüzde), kutucuklar (en az 1, bir tanesi dogru_cevap).
 * Aşamalıysa her aşamada icerik.soru_gorseli, icerik.hedef_konum, icerik.kutucuklar.
 */
function validate(body, opts) {
  const { asamaliDolu, asamalar } = opts || {};
  const asamalarList = Array.isArray(asamalar) ? asamalar : [];

  function validateKutucuklar(kutucuklar) {
    if (!Array.isArray(kutucuklar) || kutucuklar.length < 1) return false
    const dogruSayisi = kutucuklar.filter((k) => k.dogru_cevap === true || k.dogru_cevap === 1 || k.dogru_cevap === '1').length
    const hasMetinOrGorsel = (k) =>
      (k.metin != null && String(k.metin).trim() !== '') ||
      (k.gorsel != null && String(k.gorsel).trim() !== '')
    return dogruSayisi === 1 && kutucuklar.every(hasMetinOrGorsel)
  }

  function validateHedef(hedef) {
    if (!hedef || typeof hedef !== 'object') return false
    const x = Number(hedef.x)
    const y = Number(hedef.y)
    return !Number.isNaN(x) && !Number.isNaN(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100
  }

  if (asamaliDolu && asamalarList.length > 0) {
    const eksik = asamalarList.some((a) => {
      const icerik = a?.icerik && typeof a.icerik === 'object' ? a.icerik : {}
      return (
        !icerik.soru_gorseli ||
        !String(icerik.soru_gorseli).trim() ||
        !validateHedef(icerik.hedef_konum) ||
        !validateKutucuklar(icerik.kutucuklar)
      )
    })
    if (eksik) {
      return {
        ok: false,
        message: 'Kutucuğu Sürükle Bırak aşamalarında soru görseli, hedef konum (sürükle bırak ile) ve en az bir kutucuk (biri doğru cevap) zorunludur.'
      }
    }
    return { ok: true }
  }

  if (!body.soru_gorseli || !String(body.soru_gorseli).trim()) {
    return { ok: false, message: 'Kutucuğu Sürükle Bırak için soru görseli (zorunlu) gereklidir.' }
  }
  const hedef = body.hedef_konum || body.ek_bilgi?.hedef_konum
  if (!validateHedef(hedef)) {
    return { ok: false, message: 'Hedef konum (görsel üzerinde kutucuk yerleşim noktası) yüzde olarak belirtilmelidir.' }
  }
  const kutucuklar = body.kutucuklar || body.ek_bilgi?.kutucuklar
  if (!validateKutucuklar(kutucuklar)) {
    return { ok: false, message: 'En az bir kutucuk ekleyin ve tam birini doğru cevap olarak işaretleyin. Her kutucukta yazı veya görsel (en az biri) olmalıdır.' }
  }
  return { ok: true }
}

module.exports = { validate }
