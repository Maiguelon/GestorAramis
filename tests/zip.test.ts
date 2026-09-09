import { describe, expect, it } from 'vitest';
import { crc32 } from 'node:zlib';
import { createZip, safeFileName, ZIP_SIZE_LIMIT } from '../src/lib/download-zip';

// Independent ZIP reader: follow central offsets and verify payloads using Node's CRC.
async function extract(zip: Blob) {
  const bytes = Buffer.from(await zip.arrayBuffer());
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let directory = bytes.readUInt32LE(end + 16);
  const directoryStart = directory;
  const files: { name: string; data: Buffer }[] = [];
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(directory)).toBe(0x02014b50);
    expect(bytes.readUInt16LE(directory + 10)).toBe(0);
    expect(bytes.readUInt16LE(directory + 8)).toBe(0x0800);
    const size = bytes.readUInt32LE(directory + 24);
    const nameLength = bytes.readUInt16LE(directory + 28);
    const name = bytes.subarray(directory + 46, directory + 46 + nameLength).toString('utf8');
    const local = bytes.readUInt32LE(directory + 42);
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
    expect(bytes.readUInt32LE(local + 22)).toBe(size);
    const payload = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(payload, payload + size);
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(bytes.readUInt32LE(directory + 16));
    expect(bytes.readUInt32LE(local + 14)).toBe(crc32(data));
    files.push({ name, data });
    directory += 46 + nameLength + bytes.readUInt16LE(directory + 30) + bytes.readUInt16LE(directory + 32);
  }
  expect(directory).toBe(end);
  expect(directory - directoryStart).toBe(bytes.readUInt32LE(end + 12));
  return files;
}

describe('download-all ZIP', () => {
  it('extracts exact binary payloads across CRC chunks, Unicode names and empty files', async () => {
    const binary = Buffer.alloc(1024 * 1024 + 53);
    for (let index = 0; index < binary.length; index++) binary[index] = index % 251;
    const zip = await createZip([
      { name: 'toma ñ 01.mp4', blob: new Blob([binary]) },
      { name: 'texto.txt', blob: new Blob(['123456789']) },
      { name: 'vacío.txt', blob: new Blob([]) },
    ]);
    expect(zip.type).toBe('application/zip');
    const files = await extract(zip);
    expect(files.map(file => file.name)).toEqual(['toma ñ 01.mp4', 'texto.txt', 'vacío.txt']);
    expect(files[0]!.data.equals(binary)).toBe(true);
    expect(files[1]!.data.toString()).toBe('123456789');
    expect(files[2]!.data.length).toBe(0);
  });

  it('flattens unsafe paths and avoids collisions including preexisting suffixes and case', async () => {
    const names = ['../toma.mp4', '../toma.mp4', 'TOMA.mp4', 'toma.mp4', 'toma (2).mp4', 'toma.mp4', 'CON.txt', '...', 'a\u0000:b.txt'];
    const files = await extract(await createZip(names.map(name => ({ name, blob: new Blob(['ok']) }))));
    expect(files.map(file => file.name)).toEqual(['_toma.mp4', '_toma (2).mp4', 'TOMA.mp4', 'toma (2).mp4', 'toma (2) (2).mp4', 'toma (3).mp4', '_CON.txt', 'archivo', 'a__b.txt']);
    expect(safeFileName('una/pieza: nueva')).toBe('una_pieza_ nueva');
  });

  it('rejects empty, oversized and excessive archives before reading file bodies', async () => {
    await expect(createZip([])).rejects.toThrow('No hay archivos');
    await expect(createZip([{ name: 'big', blob: { size: ZIP_SIZE_LIMIT } as Blob }])).rejects.toThrow('supera 2 GB');
    await expect(createZip(Array.from({ length: 65535 }, () => ({ name: 'x', blob: new Blob() })))).rejects.toThrow('demasiados');
  });

  it('fails the entire archive if a file cannot be read', async () => {
    const broken = { size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('disk failed')) }) } as unknown as Blob;
    await expect(createZip([{ name: 'ok', blob: new Blob(['ok']) }, { name: 'bad', blob: broken }])).rejects.toThrow('disk failed');
  });
});
