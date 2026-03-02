/**
 * Özel (kilitli) medya dosya path'lerini saklar.
 * Silme ve yeniden adlandırma işlemleri için OZEL_ISLEM_KEY gerekir.
 * Path'ler normalize edilir: baştaki slash kaldırılır, backslash → slash.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'ozel-medya-paths.json');

function normalize(p) {
  if (!p || typeof p !== 'string') return '';
  return p.trim().replace(/^\/+/, '').replace(/\\/g, '/');
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readPaths() {
  ensureDir();
  if (!fs.existsSync(FILE_PATH)) return [];
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writePaths(arr) {
  ensureDir();
  const normalized = [...new Set(arr)].filter(Boolean).sort();
  fs.writeFileSync(FILE_PATH, JSON.stringify(normalized, null, 2), 'utf8');
}

function hasPath(filePath) {
  const n = normalize(filePath);
  const paths = readPaths();
  return paths.includes(n);
}

function addPath(filePath) {
  const n = normalize(filePath);
  if (!n) return;
  const paths = readPaths();
  if (!paths.includes(n)) {
    paths.push(n);
    writePaths(paths);
  }
}

function removePath(filePath) {
  const n = normalize(filePath);
  const paths = readPaths().filter((p) => p !== n);
  if (paths.length !== readPaths().length) writePaths(paths);
}

function replacePath(oldPath, newPath) {
  const oldN = normalize(oldPath);
  const newN = normalize(newPath);
  if (!oldN || !newN) return;
  const paths = readPaths();
  const idx = paths.indexOf(oldN);
  if (idx === -1) return;
  paths[idx] = newN;
  writePaths(paths);
}

/** List cevabındaki her dosya için path özel listesindeyse ozel: true ekle */
function markOzelInResult(result) {
  if (!result || typeof result !== 'object') return result;
  const paths = readPaths();
  const set = new Set(paths);
  if (Array.isArray(result.files)) {
    result.files = result.files.map((f) => {
      const n = normalize(f.path || f.name || '');
      return { ...f, ozel: n ? set.has(n) : false };
    });
  }
  return result;
}

module.exports = {
  hasPath,
  addPath,
  removePath,
  replacePath,
  markOzelInResult,
  normalize
};
