const axios = require('axios');
const path = require('path');

// BunnyCDN Environment variables
const BUNNYCDN_STORAGE_ZONE = process.env.BUNNYCDN_STORAGE_ZONE;
const BUNNYCDN_ACCESS_KEY = process.env.BUNNYCDN_ACCESS_KEY;
const BUNNYCDN_PULL_ZONE = process.env.BUNNYCDN_PULL_ZONE || `https://${BUNNYCDN_STORAGE_ZONE}.b-cdn.net`;
/** Bunny.net hesap API anahtarı – Purge API için (Dashboard > Profile > API). Storage key'den farklıdır. */
const BUNNYCDN_API_KEY = process.env.BUNNYCDN_API_KEY;

if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
    console.warn('UYARI: BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil. BunnyCDN yükleme çalışmayabilir.');
}

/**
 * Dosyayı BunnyCDN Storage'a yükler
 * @param {Buffer} fileBuffer - Yüklenecek dosyanın buffer'ı
 * @param {string} remoteFilePath - CDN'deki dosya yolu (örn: /uploads/okullar/dosya.jpg)
 * @returns {Promise<string>} Public URL (örn: https://storage-zone.b-cdn.net/uploads/...)
 */
async function uploadFile(fileBuffer, remoteFilePath) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Dosya yolunu temizle ve normalize et
        const cleanPath = remoteFilePath.replace(/^\/+/, ''); // Başındaki slash'leri kaldır
        const fileName = path.basename(cleanPath);
        const directoryPath = path.dirname(cleanPath).replace(/\\/g, '/');
        
        // Full path oluştur
        const fullPath = directoryPath ? `${directoryPath}/${fileName}` : fileName;

        // BunnyCDN Storage API URL
        const uploadUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${fullPath}`;

        console.log(`BunnyCDN'ye dosya yükleniyor: ${uploadUrl}`);
        console.log(`Dosya boyutu: ${fileBuffer.length} bytes`);

        // PUT request ile dosyayı yükle
        const response = await axios.put(uploadUrl, fileBuffer, {
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY,
                'Content-Type': getContentType(fileName)
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 60000 // 60 saniye timeout
        });

        // Public URL oluştur
        const publicUrl = `${BUNNYCDN_PULL_ZONE}/${fullPath}`;
        console.log(`Dosya başarıyla BunnyCDN'ye yüklendi: ${publicUrl}`);

        return publicUrl;
    } catch (error) {
        console.error('BunnyCDN yükleme hatası:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            throw new Error(`BunnyCDN yükleme hatası (${error.response.status}): ${error.response.data || error.response.statusText}`);
        }
        throw error;
    }
}

/**
 * Pull Zone cache'ini belirtilen public URL için temizler (genel.txt vb. güncellemeden sonra taze içerik sunulması için).
 * BUNNYCDN_API_KEY tanımlı değilse sessizce atlanır (Bunny Dashboard > Profile > API Key).
 * @param {string} publicUrl - Tam public URL (örn. https://erax-cdn.b-cdn.net/website/kod/genel.txt)
 * @returns {Promise<boolean>} Purge başarılıysa true
 */
async function purgeCache(publicUrl) {
    if (!BUNNYCDN_API_KEY || !publicUrl || typeof publicUrl !== 'string') {
        if (!BUNNYCDN_API_KEY && publicUrl) {
            console.warn('BUNNYCDN_API_KEY tanımlı değil; CDN cache purge atlandı. Yenilemede eski içerik görünebilir.');
        }
        return false;
    }
    try {
        const encoded = encodeURIComponent(publicUrl.trim());
        const purgeUrl = `https://api.bunny.net/purge?url=${encoded}`;
        await axios.post(purgeUrl, null, {
            headers: { AccessKey: BUNNYCDN_API_KEY },
            timeout: 10000
        });
        console.log('Bunny CDN cache purge başarılı:', publicUrl);
        return true;
    } catch (error) {
        console.warn('Bunny CDN cache purge hatası (devam ediliyor):', error.message);
        if (error.response) {
            console.warn('Purge response:', error.response.status, error.response.data);
        }
        return false;
    }
}

/**
 * website/kod altındaki kritik dosyaların CDN önbelleğini toplu temizler (genel.txt, dock-siralamasi/*.txt, logolar/*.svg).
 * Ön bellek temizle işlemi için kullanılır.
 * @returns {Promise<{ purged: number, failed: number }>}
 */
async function purgeWebsiteCache() {
    const base = (BUNNYCDN_PULL_ZONE || '').toString().replace(/\/+$/, '');
    if (!base) {
        console.warn('BUNNYCDN_PULL_ZONE tanımlı değil; CDN purge atlandı.');
        return { purged: 0, failed: 0 };
    }
    const urls = [
        `${base}/website/kod/genel.json`,
        `${base}/website/kod/dock-siralamasi/kids.json`,
        `${base}/website/kod/dock-siralamasi/junior.json`,
        `${base}/website/kod/dock-siralamasi/teenager.json`,
        `${base}/website/kod/dock-siralamasi/admin.json`,
        `${base}/website/kod/logolar/kids.svg`,
        `${base}/website/kod/logolar/junior.svg`,
        `${base}/website/kod/logolar/teenager.svg`,
        `${base}/website/kod/logolar/admin.svg`
    ];
    let purged = 0, failed = 0;
    for (const url of urls) {
        const ok = await purgeCache(url);
        if (ok) purged++; else failed++;
    }
    console.log(`Bunny CDN website cache purge tamamlandı: ${purged} başarılı, ${failed} atlandı/hata`);
    return { purged, failed };
}

/**
 * Dosya listesini alır (kütüphane için)
 * @param {string} targetPath - Listelenecek klasör yolu (örn: /uploads/okullar)
 * @param {string} type - Filtre tipi: 'all', 'image', 'audio', 'video'
 * @returns {Promise<Object>} Klasör ve dosya listesi
 */
async function listFiles(targetPath, type = 'all') {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'i temizle
        const cleanPath = targetPath.replace(/^\/+/, '');

        // BunnyCDN Storage API URL
        const listUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${cleanPath}/`;

        console.log(`BunnyCDN'den dosya listesi alınıyor: ${listUrl}`);

        // GET request ile dosya listesini al
        const response = await axios.get(listUrl, {
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY
            },
            timeout: 10000
        });

        // Response bir array döndürür
        const items = Array.isArray(response.data) ? response.data : [];

        // Klasör ve dosyaları ayır
        const folders = [];
        const files = [];

        for (const item of items) {
            const itemPath = item.ObjectName || item.Name || item;
            const isDirectory = item.IsDirectory || itemPath.endsWith('/');

            if (isDirectory) {
                const folderName = itemPath.replace(/\/$/, '');
                const folderPath = cleanPath ? `${cleanPath}/${folderName}` : folderName;
                folders.push({
                    name: folderName,
                    path: folderPath
                });
            } else {
                // Tip filtresi uygula
                if (type === 'all' || 
                    (type === 'image' && isImageFile(itemPath)) ||
                    (type === 'audio' && isAudioFile(itemPath)) ||
                    (type === 'video' && isVideoFile(itemPath)) ||
                    (type === 'document' && (itemPath.match(/\.(pdf|doc|docx)$/i)))) {
                    // itemPath sadece dosya adı olabilir, cleanPath ile birleştir
                    const filePath = cleanPath ? `${cleanPath}/${itemPath}` : itemPath;
                    files.push({
                        name: itemPath,
                        path: filePath,
                        size: item.Length || item.Size || 0,
                        url: `${BUNNYCDN_PULL_ZONE}/${filePath}`
                    });
                }
            }
        }

        return {
            folders,
            files
        };
    } catch (error) {
        console.error('BunnyCDN dosya listesi hatası:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
            if (error.response.status === 404) {
                // Klasör yok, boş liste döndür
                return { folders: [], files: [] };
            }
            throw new Error(`BunnyCDN dosya listesi hatası: ${error.response.data || error.response.statusText}`);
        }
        throw error;
    }
}

/**
 * Dosya uzantısına göre Content-Type döndürür
 */
function getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.pdf': 'application/pdf'
    };
    return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Dosyanın görsel olup olmadığını kontrol eder
 */
function isImageFile(fileName) {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExts.some(ext => fileName.toLowerCase().endsWith(ext));
}

/**
 * Dosyanın ses dosyası olup olmadığını kontrol eder
 */
function isAudioFile(fileName) {
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a'];
    return audioExts.some(ext => fileName.toLowerCase().endsWith(ext));
}

/**
 * Dosyanın video dosyası olup olmadığını kontrol eder
 */
function isVideoFile(fileName) {
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.flv', '.wmv'];
    return videoExts.some(ext => fileName.toLowerCase().endsWith(ext));
}

/**
 * Dosyayı BunnyCDN'den siler
 * @param {string} filePath - Silinecek dosyanın yolu (örn: /uploads/okullar/xxx.jpg veya tam URL)
 * @returns {Promise<boolean>} Silme işleminin başarılı olup olmadığı
 */
async function deleteFile(filePath) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Eğer tam URL ise, path'i çıkar
        let targetPath = filePath;
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            // CDN URL'inden path'i çıkar
            if (filePath.includes('.b-cdn.net/')) {
                const urlParts = filePath.split('.b-cdn.net/');
                targetPath = '/' + urlParts[1];
            } else {
                const url = new URL(filePath);
                targetPath = url.pathname;
            }
        }

        // Path'i temizle
        const cleanPath = targetPath.replace(/^\/+/, '');
        
        // BunnyCDN Storage API URL
        const deleteUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${cleanPath}`;

        console.log(`[deleteFile] BunnyCDN'den dosya siliniyor: ${deleteUrl}`);

        // DELETE request ile dosyayı sil
        await axios.delete(deleteUrl, {
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY
            },
            timeout: 10000
        });

        console.log(`[deleteFile] Dosya başarıyla BunnyCDN'den silindi: ${cleanPath}`);
        return true;
    } catch (error) {
        console.error('[deleteFile] BunnyCDN silme hatası:', error.message);
        if (error.response) {
            console.error('[deleteFile] Response status:', error.response.status);
            console.error('[deleteFile] Response data:', error.response.data);
            if (error.response.status === 404) {
                // Dosya zaten yok, başarılı sayılabilir
                console.log('[deleteFile] Dosya zaten mevcut değil (404)');
                return true;
            }
        }
        return false;
    }
}

/**
 * Dosyayı BunnyCDN'de taşır (kopyala + sil)
 * @param {string} sourcePath - Kaynak dosya yolu
 * @param {string} targetPath - Hedef dosya yolu
 * @returns {Promise<boolean>} Taşıma işleminin başarılı olup olmadığı
 */
async function moveFile(sourcePath, targetPath) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'leri temizle
        const cleanSourcePath = sourcePath.replace(/^\/+/, '');
        const cleanTargetPath = targetPath.replace(/^\/+/, '');

        // Önce dosyayı oku
        const sourceUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${cleanSourcePath}`;
        const response = await axios.get(sourceUrl, {
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        // Dosyayı hedefe yükle
        const targetUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${cleanTargetPath}`;
        const fileName = path.basename(cleanTargetPath);
        
        await axios.put(targetUrl, response.data, {
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY,
                'Content-Type': getContentType(fileName)
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 60000
        });

        // Kaynak dosyayı sil
        await deleteFile(cleanSourcePath);

        console.log(`Dosya başarıyla taşındı: ${cleanSourcePath} -> ${cleanTargetPath}`);
        return true;
    } catch (error) {
        console.error('BunnyCDN taşıma hatası:', error.message);
        return false;
    }
}

/**
 * Klasör oluşturur (BunnyCDN'de klasörler otomatik oluşur, ancak dummy dosya ile garanti edilir)
 * @param {string} dirPath - Klasör yolu
 * @param {string} folderName - Klasör adı
 * @returns {Promise<boolean>} Oluşturma işleminin başarılı olup olmadığı
 */
async function createFolder(dirPath, folderName) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'i temizle
        const cleanDirPath = dirPath.replace(/^\/+/, '').replace(/\/+$/, '');
        const newFolderPath = cleanDirPath ? `${cleanDirPath}/${folderName}` : folderName;
        
        // BunnyCDN'de klasörler otomatik oluşur, ancak bir dummy dosya oluşturarak klasörün varlığını garanti ederiz
        // Klasör path'ini "/" ile bitirerek bir "dummy" dosya oluşturuyoruz
        const folderAsFileUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${newFolderPath}/.keep`;
        
        // Boş bir dosya oluştur (klasörün varlığını garanti eder)
        await axios.put(folderAsFileUrl, Buffer.from(''), {
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY,
                'Content-Type': 'text/plain'
            },
            timeout: 10000
        });

        console.log(`Klasör başarıyla oluşturuldu: ${newFolderPath}`);
        return true;
    } catch (error) {
        console.error('BunnyCDN klasör oluşturma hatası:', error.message);
        // 404 hatası normal olabilir (klasör zaten var), diğer hatalar için false döndür
        if (error.response && error.response.status === 404) {
            // Klasör oluşturma başarısız, ama devam edebiliriz
            console.log('Klasör oluşturma 404 hatası (normal olabilir)');
            return true; // Klasör zaten var olabilir
        }
        return false;
    }
}

/**
 * Dosyayı BunnyCDN'de yeniden adlandırır (taşıma işlemi)
 * @param {string} filePath - Mevcut dosya yolu
 * @param {string} newName - Yeni dosya adı
 * @returns {Promise<string|null>} Yeni dosya yolu veya null
 */
async function renameFile(filePath, newName) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'i temizle
        const cleanPath = filePath.replace(/^\/+/, '');
        const directoryPath = path.dirname(cleanPath).replace(/\\/g, '/');
        const oldFileName = path.basename(cleanPath);
        const ext = path.extname(oldFileName);
        
        // Yeni dosya adına uzantı ekle (yoksa)
        const newFileName = newName.includes('.') ? newName : newName + ext;
        const newPath = directoryPath ? `${directoryPath}/${newFileName}` : newFileName;

        // Taşıma işlemi yap
        const moved = await moveFile(cleanPath, newPath);
        
        if (moved) {
            return newPath;
        }
        return null;
    } catch (error) {
        console.error('BunnyCDN yeniden adlandırma hatası:', error.message);
        return null;
    }
}

/**
 * Klasörü BunnyCDN'den siler (recursive - içindeki tüm dosyaları siler)
 * @param {string} folderPath - Silinecek klasörün yolu (örn: /uploads/okullar/klasor_adi)
 * @returns {Promise<boolean>} Silme işleminin başarılı olup olmadığı
 */
async function deleteFolder(folderPath) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'i temizle
        const cleanPath = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
        
        console.log(`[deleteFolder] Klasör siliniyor: ${cleanPath}`);
        
        // Önce klasördeki tüm dosyaları listele
        const files = await listFiles(cleanPath, 'all');
        
        console.log(`[deleteFolder] Bulunan dosyalar: ${files.files?.length || 0}, klasörler: ${files.folders?.length || 0}`);
        
        // Tüm dosyaları sil
        for (const file of files.files || []) {
            // file.path zaten tam path olmalı (örn: uploads/okullar/klasor/dosya.jpg)
            const filePath = file.path || file.name;
            // Path'i temizle (başındaki / varsa kaldır)
            const cleanFilePath = filePath.replace(/^\/+/, '');
            console.log(`[deleteFolder] Dosya siliniyor: ${cleanFilePath} (orijinal path: ${filePath})`);
            const deleted = await deleteFile(cleanFilePath);
            if (!deleted) {
                console.warn(`[deleteFolder] ⚠️ Dosya silinemedi: ${cleanFilePath}`);
                // Hata olsa bile devam et
            } else {
                console.log(`[deleteFolder] ✅ Dosya başarıyla silindi: ${cleanFilePath}`);
            }
        }
        
        // Alt klasörleri de sil (recursive)
        for (const folder of files.folders || []) {
            // folder.path zaten tam path olmalı (örn: uploads/okullar/klasor/altklasor)
            const subFolderPath = folder.path || folder.name;
            // Path'i temizle (başındaki ve sonundaki / varsa kaldır)
            const cleanSubFolderPath = subFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
            console.log(`[deleteFolder] Alt klasör siliniyor: ${cleanSubFolderPath} (orijinal path: ${subFolderPath})`);
            const deleted = await deleteFolder(cleanSubFolderPath);
            if (!deleted) {
                console.warn(`[deleteFolder] ⚠️ Alt klasör silinemedi: ${cleanSubFolderPath}`);
                // Hata olsa bile devam et
            } else {
                console.log(`[deleteFolder] ✅ Alt klasör başarıyla silindi: ${cleanSubFolderPath}`);
            }
        }
        
        // Klasörün kendisini de sil
        // 1. Önce .keep dosyasını sil (eğer varsa)
        try {
            const folderKeepFile = `${cleanPath}/.keep`;
            console.log(`[deleteFolder] .keep dosyası siliniyor: ${folderKeepFile}`);
            await deleteFile(folderKeepFile);
        } catch (keepError) {
            console.log(`[deleteFolder] .keep dosyası bulunamadı (normal): ${cleanPath}/.keep`);
        }
        
        // 2. Klasörü direkt silmeyi dene (BunnyCDN boş klasörleri de silebilir)
        try {
            const folderDeleteUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${cleanPath}/`;
            console.log(`[deleteFolder] Klasör direkt siliniyor: ${folderDeleteUrl}`);
            await axios.delete(folderDeleteUrl, {
                headers: {
                    'AccessKey': BUNNYCDN_ACCESS_KEY
                },
                timeout: 10000
            });
            console.log(`[deleteFolder] ✅ Klasör direkt silindi: ${cleanPath}`);
        } catch (folderDeleteError) {
            // Klasör silme başarısız olabilir (normal), ama dosyalar silindiği için sorun değil
            if (folderDeleteError.response && folderDeleteError.response.status === 404) {
                console.log(`[deleteFolder] Klasör zaten yok (404): ${cleanPath}`);
            } else {
                console.warn(`[deleteFolder] ⚠️ Klasör direkt silinemedi (ama dosyalar silindi): ${folderDeleteError.message}`);
            }
        }
        
        // BunnyCDN'de klasörler fiziksel olarak var olmaz, sadece dosya path'lerinde organizasyon olarak görünür
        // Tüm dosyalar silindiğinde klasör otomatik olarak "kaybolur"
        // Biraz bekle (BunnyCDN'nin işlemi tamamlaması için)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Klasörün gerçekten boş olup olmadığını kontrol et
        // Eğer 404 alırsak veya boş array alırsak, klasör başarıyla silinmiş demektir
        try {
            const verifyFiles = await listFiles(cleanPath, 'all');
            const remainingFiles = verifyFiles.files?.length || 0;
            const remainingFolders = verifyFiles.folders?.length || 0;
            
            if (remainingFiles > 0 || remainingFolders > 0) {
                console.warn(`[deleteFolder] ⚠️ Klasör hala içerik içeriyor (${remainingFiles} dosya, ${remainingFolders} klasör), tekrar deniyor: ${cleanPath}`);
                // Tekrar dene (max 2 kez daha)
                const maxRetries = 2;
                for (let i = 0; i < maxRetries; i++) {
                    await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1))); // Her denemede daha fazla bekle
                    const retryFiles = await listFiles(cleanPath, 'all');
                    if ((retryFiles.files?.length || 0) === 0 && (retryFiles.folders?.length || 0) === 0) {
                        console.log(`[deleteFolder] ✅ Klasör başarıyla silindi (${i + 1}. denemede): ${cleanPath}`);
                        return true;
                    }
                }
                console.error(`[deleteFolder] ❌ Klasör silinemedi, hala içerik var: ${cleanPath}`);
                return false;
            } else {
                // Klasör boş, başarılı
                console.log(`[deleteFolder] ✅ Klasör başarıyla silindi (boş): ${cleanPath}`);
                return true;
            }
        } catch (verifyError) {
            // Klasör zaten yoksa (404), bu başarılı demektir (BunnyCDN'de boş klasörler görünmez)
            if (verifyError.response && verifyError.response.status === 404) {
                console.log(`[deleteFolder] ✅ Klasör başarıyla silindi (404 - klasör artık yok): ${cleanPath}`);
                return true;
            }
            // Diğer hatalar için log'la ama başarılı say (muhtemelen klasör silindi)
            console.warn(`[deleteFolder] ⚠️ Doğrulama hatası (ama klasör muhtemelen silindi): ${verifyError.message}`);
            return true; // Klasör muhtemelen silindi
        }
    } catch (error) {
        console.error('[deleteFolder] BunnyCDN klasör silme hatası:', error.message);
        if (error.response) {
            console.error('[deleteFolder] Response status:', error.response.status);
            console.error('[deleteFolder] Response data:', error.response.data);
            // 404 hatası klasör zaten yok demektir, başarılı sayılabilir
            if (error.response.status === 404) {
                console.log(`[deleteFolder] Klasör zaten mevcut değil (404), başarılı sayılıyor: ${folderPath}`);
                return true;
            }
        }
        return false;
    }
}

/**
 * Klasörü BunnyCDN'de taşır (içindeki tüm dosyaları taşır)
 * @param {string} sourceFolderPath - Kaynak klasör yolu
 * @param {string} targetFolderPath - Hedef klasör yolu
 * @returns {Promise<boolean>} Taşıma işleminin başarılı olup olmadığı
 */
async function moveFolder(sourceFolderPath, targetFolderPath) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'leri temizle
        const cleanSourcePath = sourceFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
        const cleanTargetPath = targetFolderPath ? targetFolderPath.replace(/^\/+/, '').replace(/\/+$/, '') : '';
        
        // Klasör adını al
        const folderName = path.basename(cleanSourcePath);
        const newTargetPath = cleanTargetPath ? `${cleanTargetPath}/${folderName}` : folderName;
        
        console.log(`Klasör taşınıyor: ${cleanSourcePath} -> ${newTargetPath}`);
        
        // Önce klasördeki tüm dosyaları listele
        const files = await listFiles(cleanSourcePath, 'all');
        
        // Tüm dosyaları taşı
        for (const file of files.files || []) {
            const sourceFilePath = file.path || file.name;
            // Path'i temizle
            const cleanSourceFilePath = sourceFilePath.replace(/^\/+/, '');
            const fileName = path.basename(cleanSourceFilePath);
            const targetFilePath = `${newTargetPath}/${fileName}`;
            console.log(`  Dosya taşınıyor: ${cleanSourceFilePath} -> ${targetFilePath}`);
            await moveFile(cleanSourceFilePath, targetFilePath);
        }
        
        // Alt klasörleri de taşı (recursive)
        for (const folder of files.folders || []) {
            const subFolderPath = folder.path || folder.name;
            // Path'i temizle
            const cleanSubFolderPath = subFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
            console.log(`  Alt klasör taşınıyor: ${cleanSubFolderPath} -> ${newTargetPath}`);
            await moveFolder(cleanSubFolderPath, newTargetPath);
        }
        
        // .keep dosyasını da taşı (eğer varsa)
        try {
            const sourceKeepFile = `${cleanSourcePath}/.keep`;
            const targetKeepFile = `${newTargetPath}/.keep`;
            await moveFile(sourceKeepFile, targetKeepFile);
        } catch (keepError) {
            // .keep dosyası yoksa sorun değil
            console.log(`  .keep dosyası bulunamadı: ${cleanSourcePath}/.keep`);
        }
        
        // Kaynak klasörü sil (artık boş)
        await deleteFolder(cleanSourcePath);
        
        console.log(`Klasör başarıyla taşındı: ${cleanSourcePath} -> ${newTargetPath}`);
        return true;
    } catch (error) {
        console.error('BunnyCDN klasör taşıma hatası:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return false;
    }
}

/**
 * Klasörü BunnyCDN'de yeniden adlandırır (taşıma işlemi)
 * @param {string} folderPath - Mevcut klasör yolu
 * @param {string} newName - Yeni klasör adı
 * @returns {Promise<string|null>} Yeni klasör yolu veya null
 */
async function renameFolder(folderPath, newName) {
    try {
        if (!BUNNYCDN_STORAGE_ZONE || !BUNNYCDN_ACCESS_KEY) {
            throw new Error('BUNNYCDN_STORAGE_ZONE veya BUNNYCDN_ACCESS_KEY tanımlı değil');
        }

        // Path'i temizle
        const cleanPath = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
        const directoryPath = path.dirname(cleanPath).replace(/\\/g, '/');
        const oldFolderName = path.basename(cleanPath);
        
        // Yeni klasör yolu
        const cleanDirPath = directoryPath && directoryPath !== '.' ? directoryPath.replace(/^\/+/, '').replace(/\/+$/, '') : '';
        const newPath = cleanDirPath ? `${cleanDirPath}/${newName}` : newName;

        console.log(`[renameFolder] Klasör yeniden adlandırılıyor: ${cleanPath} -> ${newPath}`);

        // Önce klasördeki tüm dosyaları listele
        const files = await listFiles(cleanPath, 'all');
        
        console.log(`[renameFolder] Bulunan dosyalar: ${files.files?.length || 0}, klasörler: ${files.folders?.length || 0}`);
        
        let successCount = 0;
        let failCount = 0;
        
        // Tüm dosyaları yeni klasöre taşı
        for (const file of files.files || []) {
            // file.path zaten tam path (örn: uploads/okullar/klasor/dosya.jpg)
            const sourceFilePath = file.path || file.name;
            const cleanSourceFilePath = sourceFilePath.replace(/^\/+/, '');
            const fileName = path.basename(cleanSourceFilePath);
            const targetFilePath = `${newPath}/${fileName}`;
            console.log(`[renameFolder] Dosya taşınıyor: ${cleanSourceFilePath} -> ${targetFilePath}`);
            const moved = await moveFile(cleanSourceFilePath, targetFilePath);
            if (moved) {
                successCount++;
                console.log(`[renameFolder] ✅ Dosya taşındı: ${fileName}`);
            } else {
                failCount++;
                console.warn(`[renameFolder] ⚠️ Dosya taşınamadı: ${cleanSourceFilePath}`);
            }
        }
        
        // Alt klasörleri de taşı (recursive)
        for (const folder of files.folders || []) {
            // folder.path zaten tam path (örn: uploads/okullar/klasor/altklasor)
            const subFolderPath = folder.path || folder.name;
            const cleanSubFolderPath = subFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
            const subFolderName = path.basename(cleanSubFolderPath);
            const newSubFolderPath = `${newPath}/${subFolderName}`;
            console.log(`[renameFolder] Alt klasör taşınıyor: ${cleanSubFolderPath} -> ${newSubFolderPath}`);
            const moved = await moveFolder(cleanSubFolderPath, newPath);
            if (moved) {
                successCount++;
                console.log(`[renameFolder] ✅ Alt klasör taşındı: ${subFolderName}`);
            } else {
                failCount++;
                console.warn(`[renameFolder] ⚠️ Alt klasör taşınamadı: ${cleanSubFolderPath}`);
            }
        }
        
        // .keep dosyasını da taşı (eğer varsa) - boş klasörler için önemli
        try {
            const sourceKeepFile = `${cleanPath}/.keep`;
            const targetKeepFile = `${newPath}/.keep`;
            console.log(`[renameFolder] .keep dosyası taşınıyor: ${sourceKeepFile} -> ${targetKeepFile}`);
            const keepMoved = await moveFile(sourceKeepFile, targetKeepFile);
            if (keepMoved) {
                console.log(`[renameFolder] ✅ .keep dosyası taşındı`);
            }
        } catch (keepError) {
            console.log(`[renameFolder] .keep dosyası bulunamadı veya taşınamadı (normal olabilir): ${keepError.message}`);
        }
        
        // Eğer hiçbir dosya yoksa ve sadece boş klasör ise, yeni klasörü oluştur (.keep dosyası ile)
        if (files.files?.length === 0 && files.folders?.length === 0) {
            console.log(`[renameFolder] Boş klasör yeniden adlandırılıyor, yeni .keep dosyası oluşturuluyor`);
            try {
                // Yeni klasör için .keep dosyası oluştur
                const newKeepFile = `${newPath}/.keep`;
                const keepFileUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${newKeepFile}`;
                await axios.put(keepFileUrl, Buffer.from(''), {
                    headers: {
                        'AccessKey': BUNNYCDN_ACCESS_KEY,
                        'Content-Type': 'text/plain'
                    },
                    timeout: 10000
                });
                console.log(`[renameFolder] ✅ Yeni boş klasör oluşturuldu: ${newPath}`);
            } catch (createError) {
                console.warn(`[renameFolder] ⚠️ Yeni klasör oluşturulamadı: ${createError.message}`);
            }
        }
        
        // Biraz bekle (BunnyCDN'nin işlemi tamamlaması için)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Kaynak klasörün boş olduğunu kontrol et ve sil
        try {
            const verifyFiles = await listFiles(cleanPath, 'all');
            if ((verifyFiles.files?.length || 0) > 0 || (verifyFiles.folders?.length || 0) > 0) {
                console.warn(`[renameFolder] ⚠️ Kaynak klasör hala içerik içeriyor, silme deniyor: ${cleanPath}`);
                await deleteFolder(cleanPath);
            } else {
                // Boş klasörü direkt sil
                console.log(`[renameFolder] Kaynak klasör boş, direkt siliniyor: ${cleanPath}`);
                try {
                    const folderDeleteUrl = `https://storage.bunnycdn.com/${BUNNYCDN_STORAGE_ZONE}/${cleanPath}/`;
                    await axios.delete(folderDeleteUrl, {
                        headers: {
                            'AccessKey': BUNNYCDN_ACCESS_KEY
                        },
                        timeout: 10000
                    });
                    console.log(`[renameFolder] ✅ Boş klasör silindi: ${cleanPath}`);
                } catch (deleteError) {
                    console.warn(`[renameFolder] ⚠️ Boş klasör silinemedi (normal olabilir): ${deleteError.message}`);
                }
            }
        } catch (verifyError) {
            // 404 hatası normal (klasör zaten yok/boş)
            if (verifyError.response && verifyError.response.status === 404) {
                console.log(`[renameFolder] ✅ Kaynak klasör zaten boş/yok: ${cleanPath}`);
            } else {
                console.warn(`[renameFolder] ⚠️ Doğrulama hatası: ${verifyError.message}`);
            }
        }
        
        // Başarı kontrolü
        if (failCount > 0 && successCount === 0) {
            console.error(`[renameFolder] ❌ Tüm işlemler başarısız!`);
            return null;
        }
        
        console.log(`[renameFolder] ✅ Klasör başarıyla yeniden adlandırıldı: ${cleanPath} -> ${newPath} (${successCount} başarılı, ${failCount} başarısız)`);
        return newPath;
    } catch (error) {
        console.error('BunnyCDN klasör yeniden adlandırma hatası:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

module.exports = {
    uploadFile,
    purgeCache,
    purgeWebsiteCache,
    listFiles,
    deleteFile,
    moveFile,
    renameFile,
    createFolder,
    deleteFolder,
    moveFolder,
    renameFolder
};


