/** Local demo files only. No Drive credentials or blob URLs are persisted. */
export const LOCAL_FILE_LIMIT = 100 * 1024 * 1024;
const DATABASE = 'aramis-team-materials';
const STORE = 'files';

export function validateLocalFile(file: Pick<File, 'name' | 'size'>) {
  if (!file.size) throw new Error('El archivo está vacío.');
  if (file.size > LOCAL_FILE_LIMIT) throw new Error('Cada archivo puede pesar hasta 100 MB en esta prueba local.');
  if (!file.name.trim()) throw new Error('El archivo necesita un nombre.');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador no permite guardar archivos locales.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('No pudimos abrir el almacenamiento de archivos del navegador.'));
    request.onblocked = () => reject(new Error('Cerrá las otras pestañas de la aplicación y volvé a intentar.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveLocalFile(id: string, file: File): Promise<void> {
  validateLocalFile(file);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error(transaction.error?.name === 'QuotaExceededError'
        ? 'No queda espacio en este navegador. Probá con un archivo más pequeño.'
        : 'No pudimos guardar el archivo. Probá de nuevo.'));
    });
  } finally { database.close(); }
}

export async function readLocalFile(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(id);
      transaction.oncomplete = () => resolve(request.result instanceof Blob ? request.result : undefined);
      transaction.onerror = transaction.onabort = () => reject(new Error('No pudimos leer el archivo local.'));
    });
  } finally { database.close(); }
}
