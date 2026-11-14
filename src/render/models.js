import { Box3, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const modelRoot = new URL(import.meta.env.BASE_URL + 'models/', window.location.href);
const loader = new GLTFLoader();
export const manifest = await fetch(new URL('manifest.json', modelRoot)).then(response => {
  if (!response.ok) throw new Error('The model manifest could not be loaded.');
  return response.json();
});

async function loadGeometry(spec) {
  const response = await fetch(new URL(spec.file, modelRoot), { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Model request failed.');
  const data = await response.arrayBuffer();
  if (data.byteLength < 12 || new DataView(data).getUint32(0, true) !== 0x46546c67) {
    if (response.headers.get('content-type')?.includes('text/html')) return null;
    throw new Error('Expected a binary glTF file.');
  }

  const { scene, animations } = await loader.parseAsync(data, modelRoot.href);
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  try {
    const [mesh] = meshes;
    if (meshes.length !== 1 || animations.length || mesh.isSkinnedMesh || mesh.isInstancedMesh ||
        mesh.morphTargetInfluences || Array.isArray(mesh.material) || mesh.material.transparent ||
        mesh.material.alphaTest || Object.values(mesh.material).some(value => value?.isTexture)) {
      throw new Error('Expected one static, opaque mesh with an untextured material.');
    }
    const { geometry } = mesh;
    const triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    if (!geometry.hasAttribute('color') || !Number.isInteger(triangles) ||
        triangles < 1 || triangles > Math.min(spec.maxTriangles, manifest.maximumTrianglesPerModel)) {
      throw new Error('Expected vertex colors and a mesh within the triangle budget.');
    }
    geometry.applyMatrix4(mesh.matrixWorld);
    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const expected = new Box3(
      new Vector3(-spec.dimensions[0] / 2, 0, -spec.dimensions[2] / 2),
      new Vector3(spec.dimensions[0] / 2, spec.dimensions[1], spec.dimensions[2] / 2),
    );
    const { min, max } = geometry.boundingBox;
    if (!Number.isFinite(min.distanceTo(expected.min) + max.distanceTo(expected.max)) ||
        min.distanceTo(expected.min) > 0.01 || max.distanceTo(expected.max) > 0.01) {
      throw new Error('Model bounds must match the manifest and be centered at the base.');
    }
    return geometry.clone();
  } finally {
    const geometries = new Set();
    const materials = new Set();
    for (const mesh of meshes) {
      geometries.add(mesh.geometry);
      for (const material of [mesh.material].flat()) materials.add(material);
    }
    const textures = new Set();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}

export function watchModels(apply) {
  const statuses = {};
  const revisions = new Map();
  const models = Object.entries(manifest.models);

  async function refresh(id, spec) {
    const revision = (revisions.get(id) ?? 0) + 1;
    revisions.set(id, revision);
    let geometry;
    let status = 'placeholder';
    try {
      geometry = await loadGeometry(spec);
      if (geometry) status = 'loaded';
    } catch (error) {
      status = 'invalid';
      console.warn(`Aegis Grid model ${spec.file}: ${error.message}`);
    }
    if (revisions.get(id) !== revision) {
      geometry?.dispose();
      return;
    }
    apply(id, geometry);
    statuses[id] = status;
  }

  if (import.meta.hot) {
    const onUpdate = ({ file }) => {
      const entry = models.find(([, spec]) => spec.file === file);
      if (entry) void refresh(...entry);
    };
    import.meta.hot.on('aegis:model-update', onUpdate);
    import.meta.hot.dispose(() => import.meta.hot.off('aegis:model-update', onUpdate));
  }
  for (const [id, spec] of models) {
    statuses[id] = 'placeholder';
    void refresh(id, spec);
  }
  return statuses;
}
