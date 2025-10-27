// Utility helpers for decompressing rosbag chunk data in the browser.
// We lazily import the wasm-based decompressors to avoid paying the cost
// until we actually hit a compressed chunk.

let bz2ModulePromise = null;
let lz4ModulePromise = null;

async function loadBz2Module() {
  if (!bz2ModulePromise) {
    bz2ModulePromise = import('https://cdn.jsdelivr.net/npm/@foxglove/wasm-bz2@2.0.0/+esm');
  }
  return bz2ModulePromise;
}

async function loadLz4Module() {
  if (!lz4ModulePromise) {
    lz4ModulePromise = import('https://cdn.jsdelivr.net/npm/@foxglove/wasm-lz4@1.1.0/+esm');
  }
  return lz4ModulePromise;
}

/**
 * Decompress a rosbag chunk payload.
 *
 * @param {string} compression - compression type declared in the chunk header
 * @param {Uint8Array} data - compressed payload bytes
 * @param {number|null} uncompressedSize - expected size of the decompressed buffer
 * @returns {Promise<Uint8Array>} decompressed bytes (or the original data if compression is 'none')
 */
export async function decompressChunkData(compression, data, uncompressedSize = null) {
  switch (compression) {
    case 'none':
      return data;
    case 'bz2': {
      const module = await loadBz2Module();
      const { decompress } = module;
      return decompress(data);
    }
    case 'lz4': {
      const module = await loadLz4Module();
      const { decompress } = module;
      if (typeof uncompressedSize !== 'number' || !Number.isFinite(uncompressedSize)) {
        throw new Error('LZ4 chunk missing uncompressed size information');
      }
      return decompress(data, uncompressedSize);
    }
    default:
      throw new Error(`Unsupported rosbag compression: ${compression}`);
  }
}
