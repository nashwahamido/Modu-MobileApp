// Derive dark-theme thumbnails from the rendered light ones.
//
// Run from the modi project root:
//   npm run gen:thumbs:dark
//   npm run gen:thumbs            # wires the dark variants into thumbs.gen.ts
//
// The light thumbnails are transparent renders of (mostly near-black) parts — they read well on the light tray cards but vanish on a dark surface. We produce the dark variant by INVERTING RGB while preserving alpha, so the same silhouette/shading shows up light on dark. It mirrors the folder layout: furnitures/<ID>/light/**/<name>.png  ->  furnitures/<ID>/dark/**/<name>.png Re-render real dark art later and drop it in the same paths to replace these. Pass --force to overwrite existing dark PNGs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { Buffer } from "node:buffer";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(SCRIPT_DIR, "..", "..");
const FURNITURES_THUMBS = path.join(SRC, "assets", "thumbnails", "furnitures");
const TOOLS_THUMBS = path.join(SRC, "assets", "thumbnails", "tools");
const FORCE = process.argv.includes("--force");

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ── PNG decode (8-bit RGBA, non-interlaced) ──
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len; // length + type + data + crc
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType}, interlace ${interlace})`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const inRow = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const outRow = out.subarray(y * stride, (y + 1) * stride);
    const prevRow = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? outRow[x - bpp] : 0;
      const b = prevRow ? prevRow[x] : 0;
      const c = prevRow && x >= bpp ? prevRow[x - bpp] : 0;
      let v = inRow[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      outRow[x] = v & 0xff;
    }
  }
  return { width, height, rgba: out };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ── PNG encode (8-bit RGBA, filter 0) ──
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── transform: invert RGB, keep alpha ──
function toDark(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255 - out[i];
    out[i + 1] = 255 - out[i + 1];
    out[i + 2] = 255 - out[i + 2];
    // out[i + 3] alpha unchanged
  }
  return out;
}

function lightPngs(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) lightPngs(p, acc);
    else if (entry.name.endsWith(".png")) acc.push(p);
  }
  return acc;
}

let wrote = 0;
let skipped = 0;

// Derive every PNG under `lightDir` into the mirror path under `darkDir`.
function mirror(lightDir, darkDir) {
  if (!fs.existsSync(lightDir)) return;
  for (const lightPath of lightPngs(lightDir)) {
    const darkPath = path.join(darkDir, path.relative(lightDir, lightPath));
    if (!FORCE && fs.existsSync(darkPath)) continue;
    try {
      const { width, height, rgba } = decodePng(fs.readFileSync(lightPath));
      fs.mkdirSync(path.dirname(darkPath), { recursive: true });
      fs.writeFileSync(darkPath, encodePng(width, height, toDark(rgba)));
      wrote += 1;
      console.log(`dark: ${path.relative(SRC, darkPath)}`);
    } catch (err) {
      skipped += 1;
      console.warn(`skip ${path.relative(SRC, lightPath)} — ${err.message}`);
    }
  }
}

// furniture thumbnails: furnitures/<id>/light → furnitures/<id>/dark
if (fs.existsSync(FURNITURES_THUMBS)) {
  for (const id of fs.readdirSync(FURNITURES_THUMBS).sort()) {
    const dir = path.join(FURNITURES_THUMBS, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    mirror(path.join(dir, "light"), path.join(dir, "dark"));
  }
}

// shared tool thumbnails: tools/light → tools/dark
mirror(path.join(TOOLS_THUMBS, "light"), path.join(TOOLS_THUMBS, "dark"));

console.log(`done: wrote ${wrote} dark thumbnail${wrote === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}`);
