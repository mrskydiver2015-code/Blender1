import { MathUtils, Vector3, Plane, Color } from 'three';

export function sapphireSheen(alignment) {
  return MathUtils.smoothstep(1 - Math.abs(alignment), .08, .82);
}

export function bindOptics(root, profile, dialCenter) {
  const normal = new Vector3(...profile.rig.normal).normalize();
  const view = new Vector3();
  const plinths = [], staticMaterials = new Set(), luminous = [];
  const cut = new Plane(new Vector3(0, 1, 0), -profile.materials.standCutHeight);
  let glass, alignment = 1, sheen = 0, underside = false;
  root.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.name.includes(profile.materials.sapphire)) {
        glass = material;
        Object.assign(glass, { transmission: 0, transparent: true, opacity: 0, roughness: .005,
          envMapIntensity: .36, specularIntensity: .16, clearcoat: 0, depthWrite: false, thickness: 0, needsUpdate: true });
      }
      if (material.name.includes(profile.materials.plinth)) plinths.push(object);
      if (object.name.startsWith('Static')) staticMaterials.add(material);
      const hand = /^(HourHand|MinuteHand)/.test(object.name) && material.name.includes(profile.materials.handLume);
      if (material.name.includes(profile.materials.lume) || hand) {
        // Hand coating is local to these mesh parts, never to the hairspring.
        const local = material.clone(); object.material = local;
        luminous.push({ material: local, color: local.emissive.clone(), intensity: local.emissiveIntensity });
      }
    }
  });
  if (!glass) throw new Error('Catalog sapphire material not found');
  return {
    update(camera) {
      view.copy(camera.position).sub(dialCenter).normalize();
      alignment = view.dot(normal); sheen = sapphireSheen(alignment);
      glass.opacity = profile.materials.crystal.edgeOpacity * sheen;
      glass.envMapIntensity = profile.materials.crystal.envMapIntensity * sheen;
      glass.specularIntensity = profile.materials.crystal.specularIntensity * sheen;
      const next = camera.position.y < dialCenter.y - .035;
      if (next !== underside) {
        underside = next;
        for (const object of plinths) object.visible = !underside;
        for (const material of staticMaterials) { material.clippingPlanes = underside ? [cut] : null; material.needsUpdate = true; }
      }
    },
    night(enabled) {
      for (const item of luminous) {
        item.material.emissive.copy(enabled ? new Color(profile.lighting.lumeColor) : item.color);
        item.material.emissiveIntensity = enabled ? profile.lighting.lumeIntensity : item.intensity;
      }
    },
    get glass() { return glass; },
    get snapshot() { return { alignment, sheen, underside, luminousParts: luminous.length }; },
  };
}
