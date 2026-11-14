import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { manifest } from './models.js';

function colored(geometry, hex, x = 0, y = 0, z = 0) {
  geometry.translate(x, y, z);
  const { r, g, b } = new Color(hex);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = r;
    colors[i + 1] = g;
    colors[i + 2] = b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function combine(...parts) {
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

export function createPrimitives() {
  const turret = manifest.models.turret_basic.colors;
  const enemy = manifest.models.enemy_grunt.colors;
  const rail = manifest.models.turret_rail?.colors ?? { body: '#B79CFF', base: '#23394E', emitter: '#F3EDFF' };
  const runner = manifest.models.enemy_runner?.colors ?? { armor: '#FFC66D', joints: '#482E38', visor: '#FFF4CF' };
  const path = manifest.models.tile_path.colors;
  return {
    ground: colored(new BoxGeometry(0.98, 0.14, 0.98), '#273A4D', 0, 0.07),
    pad: combine(
      colored(new BoxGeometry(0.98, 0.14, 0.98), '#2B5264', 0, 0.07),
      colored(new BoxGeometry(0.79, 0.025, 0.79), '#3D7484', 0, 0.1375),
    ),
    tile_path: combine(
      colored(new BoxGeometry(0.98, 0.10, 0.98), path.edge, 0, 0.05),
      colored(new BoxGeometry(0.91, 0.04, 0.91), path.surface, 0, 0.12),
    ),
    turret_basic: combine(
      colored(new CylinderGeometry(0.30, 0.39, 0.19, 8), turret.base, 0, 0.095),
      colored(new CylinderGeometry(0.24, 0.27, 0.48, 8), turret.body, 0, 0.43),
      colored(new BoxGeometry(0.21, 0.28, 0.62), turret.body, 0, 0.81, 0.08),
      colored(new BoxGeometry(0.11, 0.10, 0.02), turret.emitter, 0, 0.81, 0.39),
    ),
    turret_rail: combine(
      colored(new CylinderGeometry(0.30, 0.39, 0.19, 8), rail.base, 0, 0.095),
      colored(new BoxGeometry(0.40, 0.58, 0.40), rail.body, 0, 0.48),
      colored(new BoxGeometry(0.23, 0.33, 0.98), rail.body, 0, 0.935),
      colored(new BoxGeometry(0.17, 0.18, 0.02), rail.emitter, 0, 0.935, 0.48),
    ),
    enemy_runner: combine(
      colored(new BoxGeometry(0.42, 0.16, 0.60), runner.joints, 0, 0.08),
      colored(new BoxGeometry(0.32, 0.32, 0.44), runner.armor, 0, 0.32),
      colored(new BoxGeometry(0.24, 0.07, 0.02), runner.visor, 0, 0.36, 0.23),
    ),
    enemy_grunt: combine(
      colored(new BoxGeometry(0.50, 0.22, 0.50), enemy.joints, 0, 0.11),
      colored(new BoxGeometry(0.40, 0.34, 0.38), enemy.armor, 0, 0.39),
      colored(new BoxGeometry(0.28, 0.085, 0.02), enemy.visor, 0, 0.43, 0.20),
    ),
    shot: colored(new BoxGeometry(0.10, 0.10, 0.10), '#C8FCFF'),
    entry: colored(new BoxGeometry(0.68, 0.07, 0.68), '#F18360', 0, 0.035),
    exit: colored(new BoxGeometry(0.68, 0.07, 0.68), '#8DEACA', 0, 0.035),
  };
}
