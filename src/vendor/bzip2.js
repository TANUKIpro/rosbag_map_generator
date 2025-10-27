/*
 * Minimal bzip2 decompressor for browser environments.
 *
 * This implementation is adapted from the public domain bzip2 specification
 * and mirrors the logic used in libbz2 for decoding a single stream. It
 * supports the features needed for ROS bag chunk decompression (no
 * randomised blocks, block sizes up to 900k).
 */

const BLOCK_MAGIC = 0x314159265359n;
const EOS_MAGIC = 0x177245385090n;

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bytePos = 0;
    this.bitBuffer = 0n;
    this.bitCount = 0;
  }

  ensureBits(n) {
    while (this.bitCount < n) {
      if (this.bytePos >= this.bytes.length) {
        throw new Error('Unexpected end of bzip2 stream');
      }
      this.bitBuffer = (this.bitBuffer << 8n) | BigInt(this.bytes[this.bytePos++]);
      this.bitCount += 8;
    }
  }

  readBits(n) {
    this.ensureBits(n);
    this.bitCount -= n;
    const mask = (1n << BigInt(n)) - 1n;
    const result = Number((this.bitBuffer >> BigInt(this.bitCount)) & mask);
    this.bitBuffer &= (1n << BigInt(this.bitCount)) - 1n;
    return result;
  }

  readBoolean() {
    return this.readBits(1) === 1;
  }
}

function readUsedBytes(reader) {
  const inUse = new Array(256).fill(false);
  let total = 0;

  const inUse16 = new Array(16);
  for (let i = 0; i < 16; i++) {
    inUse16[i] = reader.readBoolean();
  }

  for (let i = 0; i < 16; i++) {
    if (inUse16[i]) {
      for (let j = 0; j < 16; j++) {
        const value = reader.readBoolean();
        inUse[i * 16 + j] = value;
        if (value) {
          total++;
        }
      }
    }
  }

  const seqToUnseq = [];
  for (let i = 0; i < 256; i++) {
    if (inUse[i]) {
      seqToUnseq.push(i);
    }
  }

  return { seqToUnseq, total }; // total == seqToUnseq.length
}

function readSelectors(reader, nGroups, nSelectors) {
  const selectors = new Array(nSelectors);
  const mtf = Array.from({ length: nGroups }, (_, i) => i);

  for (let i = 0; i < nSelectors; i++) {
    let count = 0;
    while (reader.readBoolean()) {
      count++;
    }
    if (count >= nGroups) {
      throw new Error('Selector index exceeds Huffman group count');
    }
    const value = mtf[count];
    selectors[i] = value;
    for (let j = count; j > 0; j--) {
      mtf[j] = mtf[j - 1];
    }
    mtf[0] = value;
  }

  return selectors;
}

function readCodeLengths(reader, nGroups, alphaSize) {
  const lengths = Array.from({ length: nGroups }, () => new Array(alphaSize));

  for (let g = 0; g < nGroups; g++) {
    let curr = reader.readBits(5);
    for (let i = 0; i < alphaSize; i++) {
      while (reader.readBoolean()) {
        curr += reader.readBoolean() ? -1 : 1;
      }
      lengths[g][i] = curr;
    }
  }

  return lengths;
}

function createDecodeTables(lengths, alphaSize) {
  const minLen = [];
  const maxLen = [];
  const base = [];
  const limit = [];
  const perm = [];

  for (let g = 0; g < lengths.length; g++) {
    const lens = lengths[g];
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < alphaSize; i++) {
      const l = lens[i];
      if (l > max) max = l;
      if (l > 0 && l < min) min = l;
    }
    if (!isFinite(min)) {
      min = 1;
    }
    const groupBase = new Array(25).fill(0);
    const groupLimit = new Array(25).fill(0);
    const groupPerm = new Array(alphaSize).fill(0);

    // Build decode tables following hbCreateDecodeTables from libbz2
    const vec = new Array(25).fill(0);
    for (let i = 0; i < alphaSize; i++) {
      vec[lens[i] + 1]++;
    }
    for (let i = 1; i < 25; i++) {
      vec[i] += vec[i - 1];
    }
    for (let i = 0; i < alphaSize; i++) {
      const l = lens[i];
      if (l > 0) {
        groupPerm[vec[l]++] = i;
      }
    }
    for (let i = 0; i < 25; i++) {
      groupBase[i] = 0;
    }
    for (let i = 0; i < alphaSize; i++) {
      const l = lens[i];
      groupBase[l + 1]++;
    }
    for (let i = 1; i < 25; i++) {
      groupBase[i] += groupBase[i - 1];
    }
    let pp = 0;
    for (let i = min; i <= max; i++) {
      const bs = groupBase[i + 1] - groupBase[i];
      groupLimit[i] = pp + bs - 1;
      pp = (pp + bs) << 1;
    }
    for (let i = min + 1; i <= max; i++) {
      groupBase[i] = ((groupLimit[i - 1] + 1) << 1) - groupBase[i];
    }

    minLen[g] = min;
    maxLen[g] = max;
    base[g] = groupBase;
    limit[g] = groupLimit;
    perm[g] = groupPerm;
  }

  return { minLen, maxLen, base, limit, perm };
}

function decodeRunLength(reader, selectors, tables, alphaSize, seqToUnseq, origPtr) {
  const { minLen, base, limit, perm } = tables;
  const nInUse = alphaSize - 2;
  const mtf = Array.from({ length: nInUse }, (_, i) => i);
  const EOB = alphaSize - 1;

  const symbols = [];
  let groupIdx = -1;
  let groupPos = 0;
  let zt = 0;
  let nextSym = 0;
  let useExisting = false;

  while (true) {
    if (!useExisting) {
      if (groupPos === 0) {
        groupIdx++;
        if (groupIdx >= selectors.length) {
          throw new Error('Selector overrun while decoding');
        }
        zt = selectors[groupIdx];
        groupPos = 50;
      }
      groupPos--;
      let zn = minLen[zt];
      let zvec = reader.readBits(zn);
      while (zvec > limit[zt][zn]) {
        zn++;
        zvec = (zvec << 1) | reader.readBits(1);
      }
      nextSym = perm[zt][zvec - base[zt][zn]];
    } else {
      useExisting = false;
    }

    if (nextSym === EOB) {
      break;
    }

    if (nextSym === 0 || nextSym === 1) {
      let s = -1;
      let n = 1;
      do {
        if (nextSym === 0) {
          s += n;
        } else {
          s += n << 1;
        }
        if (groupPos === 0) {
          groupIdx++;
          if (groupIdx >= selectors.length) {
            throw new Error('Selector overrun while decoding run');
          }
          zt = selectors[groupIdx];
          groupPos = 50;
        }
        groupPos--;
        let zn = minLen[zt];
        let zvec = reader.readBits(zn);
        while (zvec > limit[zt][zn]) {
          zn++;
          zvec = (zvec << 1) | reader.readBits(1);
        }
        nextSym = perm[zt][zvec - base[zt][zn]];
        n <<= 1;
      } while (nextSym === 0 || nextSym === 1);

      const value = seqToUnseq[mtf[0]];
      for (let i = 0; i <= s; i++) {
        symbols.push(value);
      }
      useExisting = true;
      continue;
    }

    const idx = nextSym - 1;
    const sym = mtf[idx];
    for (let i = idx; i > 0; i--) {
      mtf[i] = mtf[i - 1];
    }
    mtf[0] = sym;
    symbols.push(seqToUnseq[sym]);
  }

  // Inverse BWT
  const counts = new Array(256).fill(0);
  for (let i = 0; i < symbols.length; i++) {
    counts[symbols[i]]++;
  }
  const sum = new Array(256).fill(0);
  let running = 0;
  for (let i = 0; i < 256; i++) {
    sum[i] = running;
    running += counts[i];
  }
  const next = new Array(symbols.length);
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    next[sum[sym]] = i;
    sum[sym]++;
  }
  const output = new Uint8Array(symbols.length);
  let j = next[origPtr];
  for (let i = 0; i < symbols.length; i++) {
    output[i] = symbols[j];
    j = next[j];
  }

  return output;
}

export function decompressBzip2(data) {
  if (!(data instanceof Uint8Array)) {
    throw new Error('bzip2 input must be a Uint8Array');
  }

  if (data.length < 4 || data[0] !== 0x42 || data[1] !== 0x5a || data[2] !== 0x68) {
    throw new Error('Invalid bzip2 header');
  }

  const blockSizeChar = data[3];
  if (blockSizeChar < 0x31 || blockSizeChar > 0x39) {
    throw new Error('Unsupported bzip2 block size');
  }

  const reader = new BitReader(data.subarray(4));
  const chunks = [];

  while (true) {
    reader.ensureBits(48);
    const marker = reader.bitBuffer >> BigInt(reader.bitCount - 48);
    if (marker === EOS_MAGIC) {
      reader.readBits(48); // consume marker
      reader.readBits(32); // stream CRC
      break;
    }
    if (marker !== BLOCK_MAGIC) {
      throw new Error('Invalid bzip2 block header');
    }
    reader.readBits(48); // consume block magic
    reader.readBits(32); // block CRC (ignored)
    const randomised = reader.readBoolean();
    if (randomised) {
      throw new Error('Randomised bzip2 blocks are not supported');
    }
    const origPtr = reader.readBits(24);
    const { seqToUnseq, total } = readUsedBytes(reader);
    const alphaSize = total + 2;
    const nGroups = reader.readBits(3);
    if (nGroups < 2 || nGroups > 6) {
      throw new Error('Unsupported number of Huffman groups');
    }
    const nSelectors = reader.readBits(15);
    if (nSelectors === 0) {
      throw new Error('Invalid selector count');
    }
    const selectors = readSelectors(reader, nGroups, nSelectors);
    const lengths = readCodeLengths(reader, nGroups, alphaSize);
    const tables = createDecodeTables(lengths, alphaSize);
    const block = decodeRunLength(reader, selectors, tables, alphaSize, seqToUnseq, origPtr);
    chunks.push(block);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export default decompressBzip2;

