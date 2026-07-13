import fs from 'node:fs';
import { Buffer } from 'node:buffer';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/create-runtime-glb.mjs input.glb output.glb');

const source = fs.readFileSync(input);
const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
const binHeaderOffset = 20 + jsonLength;
const binLength = source.readUInt32LE(binHeaderOffset);
const binType = source.readUInt32LE(binHeaderOffset + 4);
const sourceBin = source.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength);

for (const material of json.materials ?? []) {
  delete material.normalTexture;
  delete material.occlusionTexture;
  delete material.emissiveTexture;
  delete material.extensions;
  if (material.pbrMetallicRoughness) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  }
}
delete json.textures;
delete json.images;
delete json.samplers;
delete json.extensionsUsed;
delete json.extensionsRequired;

const usedViews = new Set();
function findBufferViews(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && typeof child === 'number') usedViews.add(child);
    else findBufferViews(child);
  }
}
findBufferViews(json);

const oldViews = json.bufferViews ?? [];
const viewMap = new Map();
const newViews = [];
const binParts = [];
let runtimeBinLength = 0;
for (const oldIndex of [...usedViews].sort((a, b) => a - b)) {
  const oldView = oldViews[oldIndex];
  const padding = (4 - (runtimeBinLength % 4)) % 4;
  if (padding) {
    binParts.push(Buffer.alloc(padding));
    runtimeBinLength += padding;
  }
  viewMap.set(oldIndex, newViews.length);
  newViews.push({ ...oldView, byteOffset: runtimeBinLength });
  binParts.push(sourceBin.subarray(oldView.byteOffset ?? 0, (oldView.byteOffset ?? 0) + oldView.byteLength));
  runtimeBinLength += oldView.byteLength;
}

function remapBufferViews(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && typeof child === 'number') value[key] = viewMap.get(child);
    else remapBufferViews(child);
  }
}
remapBufferViews(json);
json.bufferViews = newViews;
const bin = Buffer.concat(binParts);
json.buffers[0].byteLength = bin.length;

const jsonRaw = Buffer.from(JSON.stringify(json));
const jsonPadding = (4 - (jsonRaw.length % 4)) % 4;
const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPadding, 0x20)]);
const totalLength = 12 + 8 + jsonChunk.length + 8 + bin.length;
const result = Buffer.alloc(totalLength);

result.writeUInt32LE(0x46546c67, 0);
result.writeUInt32LE(2, 4);
result.writeUInt32LE(totalLength, 8);
result.writeUInt32LE(jsonChunk.length, 12);
result.writeUInt32LE(0x4e4f534a, 16);
jsonChunk.copy(result, 20);
const outputBinHeader = 20 + jsonChunk.length;
result.writeUInt32LE(bin.length, outputBinHeader);
result.writeUInt32LE(binType, outputBinHeader + 4);
bin.copy(result, outputBinHeader + 8);

fs.writeFileSync(output, result);
console.log(`${output}: ${(result.length / 1024 / 1024).toFixed(2)} MB`);
