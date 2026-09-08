/** Stored ZIP: videos are already compressed. Keep blobs intact, scan CRC in 1 MB chunks. */
export const ZIP_SIZE_LIMIT = 2 * 1024 * 1024 * 1024;
export type ZipEntry = { name: string; blob: Blob };
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function safeFileName(value: string, fallback = 'archivo'): string {
  const name = value.normalize('NFC').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '_').replace(/^\.+|[ .]+$/g, '').trim();
  const shortened = Array.from(name).slice(0, 120).join('') || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(shortened) ? '_' + shortened : shortened;
}

function uniqueNames(entries: ZipEntry[]): string[] {
  const used = new Set<string>();
  return entries.map(entry => {
    const base = safeFileName(entry.name);
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const extension = dot > 0 ? base.slice(dot) : '';
    let name = base;
    for (let suffix = 2; used.has(name.toLocaleLowerCase('en-US')); suffix++) name = `${stem} (${suffix})${extension}`;
    used.add(name.toLocaleLowerCase('en-US'));
    return name;
  });
}

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function createZip(entries: ZipEntry[], onProgress?: (name: string, index: number) => void): Promise<Blob> {
  if (!entries.length) throw new Error('No hay archivos para descargar.');
  if (entries.length >= 65535) throw new Error('Hay demasiados archivos para un ZIP. Descargalos individualmente.');
  const names = uniqueNames(entries).map(name => encoder.encode(name));
  const estimatedSize = entries.reduce((total, entry, index) => total + entry.blob.size + 76 + names[index]!.length * 2, 22);
  if (estimatedSize > ZIP_SIZE_LIMIT) throw new Error('El conjunto supera 2 GB. Descargá los archivos individualmente.');
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const [index, entry] of entries.entries()) {
    onProgress?.(entry.name, index);
    const crc = await crc32(entry.blob);
    const name = names[index]!;
    const header = new ArrayBuffer(30);
    const local = new DataView(header);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names, stored method 0.
    local.setUint16(12, 33, true); // 1980-01-01 DOS date.
    local.setUint32(14, crc, true);
    local.setUint32(18, entry.blob.size, true);
    local.setUint32(22, entry.blob.size, true);
    local.setUint16(26, name.length, true);
    parts.push(header, name, entry.blob);

    const directory = new ArrayBuffer(46);
    const record = new DataView(directory);
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(14, 33, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, entry.blob.size, true);
    record.setUint32(24, entry.blob.size, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    central.push(directory, name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + entry.blob.size;
  }
  const ending = new ArrayBuffer(22);
  const end = new DataView(ending);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, ending], { type: 'application/zip' });
}
