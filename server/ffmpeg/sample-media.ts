/**
 * Generates valid, playable RIFF PCM WAV audio files (with pleasant synthesized speech-cadence
 * or ambient chord progression in Mock mode) and complete ISO-BMFF H.264/AVC1 MP4 containers
 * (with full moov/trak/mdia/minf/stbl sample tables) so browsers and media players can play
 * and inspect them without external credits or internet downloads.
 */

export function generateWavBuffer(opts: {
  durationSec: number;
  sampleRate?: number;
  frequencyHz?: number;
  amplitude?: number;
  mode?: 'voice' | 'music';
}): Buffer {
  const sampleRate = opts.sampleRate ?? 22050;
  const durationSec = Math.max(1, Math.min(180, opts.durationSec));
  const numSamples = Math.floor(sampleRate * durationSec);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF WAVE header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM = 1
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const baseFreq = opts.frequencyHz ?? 440;
  const amp = opts.amplitude ?? 0.08;
  const mode = opts.mode ?? 'voice';

  if (baseFreq > 0) {
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const fade = Math.min(1, t * 12) * Math.min(1, (durationSec - t) * 12);

      let signal = 0;
      if (mode === 'music') {
        // Gentle warm ambient triad chord (root, major third, fifth)
        const f1 = baseFreq;
        const f2 = baseFreq * 1.25;
        const f3 = baseFreq * 1.5;
        const slowLfo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t);
        signal =
          ((Math.sin(2 * Math.PI * f1 * t) +
            0.6 * Math.sin(2 * Math.PI * f2 * t) +
            0.4 * Math.sin(2 * Math.PI * f3 * t)) /
            2.0) *
          slowLfo;
      } else {
        // Syllable-like cadence modulation so mock TTS audio is audibly distinct
        const syllableGate = Math.sin(2 * Math.PI * 3.2 * t) > -0.3 ? 1 : 0.15;
        const pitchMod = baseFreq * (1 + 0.08 * Math.sin(2 * Math.PI * 1.7 * t));
        signal =
          (Math.sin(2 * Math.PI * pitchMod * t) +
            0.3 * Math.sin(2 * Math.PI * pitchMod * 2 * t)) *
          0.75 *
          syllableGate;
      }

      const sample = signal * amp * fade;
      const intVal = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      buffer.writeInt16LE(intVal, 44 + i * 2);
    }
  }

  return buffer;
}

function box(type: string, ...payloads: Buffer[]): Buffer {
  const totalPayload = Buffer.concat(payloads);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(totalPayload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, totalPayload]);
}

function fullBox(type: string, version: number, flags: number, ...payloads: Buffer[]): Buffer {
  const vf = Buffer.alloc(4);
  vf.writeUInt8(version, 0);
  vf.writeUIntBE(flags, 1, 3);
  return box(type, vf, ...payloads);
}

// Pre-encoded minimal valid H.264 Baseline SPS, PPS, and 16x16 black IDR slice
const H264_SPS = Buffer.from('6742c00a96540fb0110000030001000003003c8f142938', 'hex');
const H264_PPS = Buffer.from('68ce3c80', 'hex');
const H264_IDR_SLICE = Buffer.from('6588840033fffe06dd0000030000030000030001c0', 'hex');

function makeLengthPrefixedNal(nal: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(nal.length, 0);
  return Buffer.concat([len, nal]);
}

/**
 * Generates a complete ISO-BMFF MP4 file with valid ftyp, mdat, and moov (mvhd, trak -> tkhd,
 * mdia -> mdhd, hdlr, minf -> vmhd, dinf, stbl -> stsd/avc1/avcC, stts, stss, stsc, stsz, stco).
 */
export function generateSampleMp4Buffer(opts: {
  durationSec: number;
  width?: number;
  height?: number;
  label?: string;
}): Buffer {
  const timescale = 1000;
  const durationSec = Math.max(1, opts.durationSec || 5);
  const durationUnits = Math.round(durationSec * timescale);
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1920;

  // 1. ftyp box (28 bytes)
  const ftypPayload = Buffer.alloc(20);
  ftypPayload.write('isom', 0, 4, 'ascii');
  ftypPayload.writeUInt32BE(512, 4);
  ftypPayload.write('isomiso2avc1mp41', 8, 16, 'ascii');
  const ftyp = box('ftyp', ftypPayload);

  // 2. Sample payload in mdat (1 IDR frame stretched across durationUnits via stts)
  const sampleData = Buffer.concat([
    makeLengthPrefixedNal(H264_SPS),
    makeLengthPrefixedNal(H264_PPS),
    makeLengthPrefixedNal(H264_IDR_SLICE),
  ]);
  const metaJson = Buffer.from(
    JSON.stringify({
      generator: 'AI Video Studio MP4 Engine',
      durationSec,
      width,
      height,
      label: opts.label || 'sample-clip',
    }),
    'utf-8'
  );
  const uuidMeta = box('free', metaJson);
  const mdat = box('mdat', sampleData);

  // Offset from start of file to the first byte of sampleData inside mdat:
  // ftyp.length + uuidMeta.length + 8 (mdat header)
  const chunkOffset = ftyp.length + uuidMeta.length + 8;

  // 3. Build moov hierarchy
  const mvhdBody = Buffer.alloc(96);
  mvhdBody.writeUInt32BE(timescale, 8);
  mvhdBody.writeUInt32BE(durationUnits, 12);
  mvhdBody.writeUInt32BE(0x00010000, 16); // rate 1.0
  mvhdBody.writeUInt16BE(0x0100, 20);     // volume 1.0
  mvhdBody.writeUInt32BE(0x00010000, 32);
  mvhdBody.writeUInt32BE(0x00010000, 48);
  mvhdBody.writeUInt32BE(0x40000000, 64);
  mvhdBody.writeUInt32BE(2, 92); // next_track_ID
  const mvhd = fullBox('mvhd', 0, 0, mvhdBody);

  const tkhdBody = Buffer.alloc(80);
  tkhdBody.writeUInt32BE(1, 8); // track_ID = 1
  tkhdBody.writeUInt32BE(durationUnits, 16);
  tkhdBody.writeUInt32BE(0x00010000, 36);
  tkhdBody.writeUInt32BE(0x00010000, 52);
  tkhdBody.writeUInt32BE(0x40000000, 68);
  tkhdBody.writeUInt32BE(width << 16, 72);
  tkhdBody.writeUInt32BE(height << 16, 76);
  const tkhd = fullBox('tkhd', 0, 3, tkhdBody);

  const mdhdBody = Buffer.alloc(20);
  mdhdBody.writeUInt32BE(timescale, 8);
  mdhdBody.writeUInt32BE(durationUnits, 12);
  mdhdBody.writeUInt16BE(0x55c4, 16); // 'und' language
  const mdhd = fullBox('mdhd', 0, 0, mdhdBody);

  const hdlrBody = Buffer.alloc(21);
  hdlrBody.write('vide', 4, 4, 'ascii');
  hdlrBody.write('VideoHandler', 16, 12, 'ascii');
  const hdlr = fullBox('hdlr', 0, 0, hdlrBody);

  const vmhd = fullBox('vmhd', 0, 1, Buffer.alloc(8));
  const urlBox = fullBox('url ', 0, 1);
  const drefPayload = Buffer.alloc(4);
  drefPayload.writeUInt32BE(1, 0);
  const dref = fullBox('dref', 0, 0, drefPayload, urlBox);
  const dinf = box('dinf', dref);

  // avcC box
  const avcCHeader = Buffer.from([
    0x01,
    H264_SPS[1],
    H264_SPS[2],
    H264_SPS[3],
    0xff,
    0xe1,
    (H264_SPS.length >> 8) & 0xff,
    H264_SPS.length & 0xff,
  ]);
  const avcCPps = Buffer.from([
    0x01,
    (H264_PPS.length >> 8) & 0xff,
    H264_PPS.length & 0xff,
  ]);
  const avcC = box('avcC', avcCHeader, H264_SPS, avcCPps, H264_PPS);

  // avc1 visual sample entry
  const avc1Body = Buffer.alloc(78);
  avc1Body.writeUInt16BE(1, 6); // data_reference_index = 1
  avc1Body.writeUInt16BE(width, 24);
  avc1Body.writeUInt16BE(height, 26);
  avc1Body.writeUInt32BE(0x00480000, 28); // 72 dpi
  avc1Body.writeUInt32BE(0x00480000, 32); // 72 dpi
  avc1Body.writeUInt16BE(1, 40); // frame_count = 1
  avc1Body.writeUInt16BE(0x0018, 74); // depth = 24
  avc1Body.writeInt16BE(-1, 76); // pre_defined = -1
  const avc1 = box('avc1', avc1Body, avcC);

  const stsdHeader = Buffer.alloc(4);
  stsdHeader.writeUInt32BE(1, 0);
  const stsd = fullBox('stsd', 0, 0, stsdHeader, avc1);

  // stts (1 sample with delta = durationUnits)
  const sttsBody = Buffer.alloc(12);
  sttsBody.writeUInt32BE(1, 0);
  sttsBody.writeUInt32BE(1, 4);
  sttsBody.writeUInt32BE(durationUnits, 8);
  const stts = fullBox('stts', 0, 0, sttsBody);

  // stss (sync sample 1)
  const stssBody = Buffer.alloc(8);
  stssBody.writeUInt32BE(1, 0);
  stssBody.writeUInt32BE(1, 4);
  const stss = fullBox('stss', 0, 0, stssBody);

  // stsc (1 chunk, 1 sample per chunk, desc 1)
  const stscBody = Buffer.alloc(16);
  stscBody.writeUInt32BE(1, 0);
  stscBody.writeUInt32BE(1, 4);
  stscBody.writeUInt32BE(1, 8);
  stscBody.writeUInt32BE(1, 12);
  const stsc = fullBox('stsc', 0, 0, stscBody);

  // stsz (1 sample of sampleData.length bytes)
  const stszBody = Buffer.alloc(12);
  stszBody.writeUInt32BE(sampleData.length, 0);
  stszBody.writeUInt32BE(1, 4);
  stszBody.writeUInt32BE(sampleData.length, 8);
  const stsz = fullBox('stsz', 0, 0, stszBody);

  // stco (1 chunk at chunkOffset)
  const stcoBody = Buffer.alloc(8);
  stcoBody.writeUInt32BE(1, 0);
  stcoBody.writeUInt32BE(chunkOffset, 4);
  const stco = fullBox('stco', 0, 0, stcoBody);

  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
  const minf = box('minf', vmhd, dinf, stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', tkhd, mdia);
  const moov = box('moov', mvhd, trak);

  return Buffer.concat([ftyp, uuidMeta, mdat, moov]);
}
