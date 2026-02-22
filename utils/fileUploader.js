const USE_BUNNYCDN = process.env.USE_BUNNYCDN === 'true' || process.env.USE_BUNNYCDN === '1';
if (USE_BUNNYCDN) {
  module.exports = require('./bunnycdn');
} else {
  const FormData = require('form-data');
  const axios = require('axios');
  const path = require('path');
  const UPLOAD_URL = process.env.UPLOAD_URL || 'https://www.eradil.online/api/upload.php';
  const UPLOAD_SECRET = process.env.UPLOAD_SECRET || process.env.JWT_SECRET;
  if (!UPLOAD_SECRET) {
    console.warn('UYARI: UPLOAD_SECRET veya JWT_SECRET tanımlı değil. Dosya yükleme çalışmayabilir.');
  }
  async function uploadFile(fileBuffer, remoteFilePath) {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    const filename = path.basename(remoteFilePath);
    const directoryPath = path.dirname(remoteFilePath).replace(/\\/g, '/');
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename, contentType: 'application/octet-stream' });
    formData.append('path', directoryPath);
    formData.append('secret', UPLOAD_SECRET);
    const response = await axios.post(UPLOAD_URL, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000
    });
    if (response.data && response.data.success) {
      return response.data.url || `https://www.eradil.online${remoteFilePath}`;
    }
    throw new Error(response.data?.message || 'Dosya yükleme başarısız');
  }
  async function listFiles(targetPath, type = 'all') {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    const response = await axios.post(UPLOAD_URL, { action: 'list', path: targetPath, secret: UPLOAD_SECRET, type }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    if (response.data.success) return response.data.data;
    throw new Error(response.data.message || 'Dosya listesi alınamadı');
  }
  async function deleteFile(filePath) {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    let targetPath = filePath;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      const url = new URL(filePath);
      targetPath = url.pathname;
    }
    const response = await axios.post(UPLOAD_URL, { action: 'delete', path: targetPath, secret: UPLOAD_SECRET }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data.success === true;
  }
  async function moveFile(sourcePath, targetPath) {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    const response = await axios.post(UPLOAD_URL, { action: 'move', sourcePath, targetPath, secret: UPLOAD_SECRET }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    return response.data.success === true;
  }
  async function renameFile(filePath, newName) {
    const directoryPath = path.dirname(filePath).replace(/\\/g, '/');
    const ext = path.extname(path.basename(filePath));
    const newFileName = newName.includes('.') ? newName : newName + ext;
    const newPath = directoryPath === '.' ? newFileName : `${directoryPath}/${newFileName}`;
    const moved = await moveFile(filePath, newPath);
    return moved ? newPath : null;
  }
  async function createFolder(dirPath, folderName) {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    const newFolderPath = dirPath.endsWith('/') ? `${dirPath}${folderName}` : `${dirPath}/${folderName}`;
    const response = await axios.post(UPLOAD_URL, { action: 'createFolder', path: newFolderPath, secret: UPLOAD_SECRET }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
    return response.data.success === true;
  }
  async function deleteFolder(folderPath) {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    const response = await axios.post(UPLOAD_URL, { action: 'delete_directory', path: folderPath, secret: UPLOAD_SECRET }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    return response.data.success === true;
  }
  async function moveFolder(sourceFolderPath, targetFolderPath) {
    if (!UPLOAD_SECRET) throw new Error('UPLOAD_SECRET veya JWT_SECRET tanımlı değil');
    const response = await axios.post(UPLOAD_URL, { action: 'move_directory', sourcePath: sourceFolderPath, targetPath: targetFolderPath, secret: UPLOAD_SECRET }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
    return response.data.success === true;
  }
  async function renameFolder(folderPath, newName) {
    const directoryPath = path.dirname(folderPath).replace(/\\/g, '/');
    const newPath = directoryPath === '.' ? newName : `${directoryPath}/${newName}`;
    const moved = await moveFolder(folderPath, directoryPath === '.' ? '' : directoryPath);
    return moved ? newPath : null;
  }
  module.exports = {
    uploadFile,
    listFiles,
    deleteFile,
    moveFile,
    renameFile,
    createFolder,
    deleteFolder,
    moveFolder,
    renameFolder
  };
}
