/**
 * Utilities for decompressing rosbag chunk payloads in the browser.
 * Supports the compression schemes commonly produced by rosbag: none and LZ4.
 * BZ2 compression is not yet supported but the structure makes it easier to plug
 * in an implementation in the future.
 */

/**
 * Decompress a chunk payload using the provided compression identifier.
 *
 * @param {string} compression - Compression identifier from the chunk header.
 * @param {Uint8Array} data - Compressed payload.
 * @param {number|null} [uncompressedSize] - Expected size of the decompressed payload when available.
 * @returns {Uint8Array} - The decompressed chunk data.
 */
export function decompressChunkData(compression, data, uncompressedSize = null) {
  switch (compression) {
    case 'none':
      // Return a view without copying when possible.
      return data;
    case 'lz4':
      if (uncompressedSize == null) {
        throw new Error('LZ4 chunk is missing expected uncompressed size');
      }
      return decompressLZ4(data, uncompressedSize);
    case 'bz2':
      throw new Error('BZ2 compressed chunks are not yet supported');
    default:
      throw new Error(`Unsupported rosbag compression scheme: ${compression}`);
  }
}

/**
 * Basic LZ4 block decompressor tailored for rosbag chunk payloads.
 *
 * @param {Uint8Array} input - Compressed chunk payload.
 * @param {number} outputSize - Expected length of the decompressed output.
 * @returns {Uint8Array}
 */
function decompressLZ4(input, outputSize) {
  const output = new Uint8Array(outputSize);
  const inputLength = input.length;

  let ip = 0; // input pointer
  let op = 0; // output pointer

  while (ip < inputLength) {
    const token = input[ip++];

    // --- Literals ---
    let literalLength = token >> 4;
    if (literalLength === 15) {
      let len = 255;
      while (len === 255) {
        if (ip >= inputLength) {
          throw new Error('LZ4 literal length exceeds input buffer');
        }
        len = input[ip++];
        literalLength += len;
      }
    }

    if (op + literalLength > outputSize || ip + literalLength > inputLength) {
      throw new Error('LZ4 literal segment would overflow buffers');
    }

    output.set(input.subarray(ip, ip + literalLength), op);
    ip += literalLength;
    op += literalLength;

    if (ip >= inputLength) {
      if (op !== outputSize) {
        throw new Error('LZ4 stream finished before producing expected size');
      }
      break;
    }

    // --- Match copy ---
    if (ip + 1 >= inputLength) {
      throw new Error('LZ4 match offset missing');
    }
    const offset = input[ip] | (input[ip + 1] << 8);
    ip += 2;

    if (offset === 0 || offset > op) {
      throw new Error('LZ4 invalid match offset');
    }

    let matchLength = token & 0x0f;
    if (matchLength === 15) {
      let len = 255;
      while (len === 255) {
        if (ip >= inputLength) {
          throw new Error('LZ4 match length exceeds input buffer');
        }
        len = input[ip++];
        matchLength += len;
      }
    }
    matchLength += 4;

    if (op + matchLength > outputSize) {
      throw new Error('LZ4 match copy exceeds output buffer');
    }

    // Copy match with potential overlap.
    for (let i = 0; i < matchLength; i++) {
      output[op] = output[op - offset];
      op++;
    }
  }

  return output;
}
