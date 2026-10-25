// Keeps a JSON copy of this device's customer details in a real file the user picks
// (File System Access API). The file handle is remembered in IndexedDB.
const DB_NAME = "wt-backup";
const STORE = "handles";
const KEY = "file";
const MODE = { mode: "readwrite" };

export const supported = typeof window.showSaveFilePicker === "function";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}

export const getHandle = () =>
  tx("readonly", (s) => s.get(KEY)).catch(() => null);
export const setHandle = (h) => tx("readwrite", (s) => s.put(h, KEY));
export const clearHandle = () => tx("readwrite", (s) => s.delete(KEY));

// Browsers re-ask for write access after a restart; request() needs a click.
export async function hasAccess(h, request = false) {
  if (!h) return false;
  if ((await h.queryPermission(MODE)) === "granted") return true;
  return request && (await h.requestPermission(MODE)) === "granted";
}

export function pickFile() {
  return window.showSaveFilePicker({
    suggestedName: "warranty-tool-backup.json",
    types: [
      {
        description: "Warranty Tool backup",
        accept: { "application/json": [".json"] },
      },
    ],
  });
}

export async function writeFile(h, data) {
  const w = await h.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}
