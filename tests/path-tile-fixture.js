import { BoxGeometry } from 'three';

export function pathTileFixture({ color = 0.4, missingColors = false, transparent = false, height = 0.14, triangles } = {}) {
  const geometry = new BoxGeometry(0.98, 0.14, 0.98).translate(0, 0.07, 0);
  const positions = geometry.attributes.position.array;
  if (height !== 0.14) for (let i = 1; i < positions.length; i += 3) positions[i] *= height / 0.14;
  const colors = new Float32Array(positions.length).fill(color);
  const indices = triangles ? Uint16Array.from({ length: triangles * 3 }, (_, i) => geometry.index.array[i % geometry.index.count]) : geometry.index.array;
  let offset = 0;
  const arrays = [positions, colors, indices];
  const bufferViews = arrays.map(array => {
    const view = { buffer: 0, byteOffset: offset, byteLength: array.byteLength };
    offset += array.byteLength;
    return view;
  });
  const binary = Buffer.alloc(Math.ceil(offset / 4) * 4);
  arrays.forEach((array, i) => {
    Buffer.from(array.buffer, array.byteOffset, array.byteLength).copy(binary, bufferViews[i].byteOffset);
  });
  const data = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, ...(missingColors ? {} : { COLOR_0: 1 }) }, indices: 2, material: 0 }] }],
    materials: [transparent ? { alphaMode: 'BLEND' } : {}],
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors: [
      {
        bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3',
        min: [-0.49, 0, -0.49], max: [0.49, height, 0.49],
      },
      { bufferView: 1, componentType: 5126, count: colors.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  };
  const json = Buffer.from(JSON.stringify(data));
  const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(paddedJson);
  const header = Buffer.alloc(20);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + binary.length, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.write('JSON', 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binHeader, binary]);
}
