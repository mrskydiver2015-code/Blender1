import { entry, exit, findPath, inBounds, tileAt } from './board.js';

export const turretTypes = {
  basic: { cost: 40, range: 2.5, cooldown: 0.52, damage: 1, projectileSpeed: 9 },
  rail: { cost: 80, range: 4.5, cooldown: 1.8, damage: 4, projectileSpeed: 18 },
};
export const turretCost = turretTypes.basic.cost;
export const capacity = { turrets: 128, enemies: 48, projectiles: 256 };
export const stepSeconds = 1 / 60;

/**
 * @typedef {{type: 'shot', wave: number, turretType: string, x: number, z: number}
 * | {type: 'hit', wave: number, turretType: string, x: number, z: number, damage: number, killed: boolean}
 * | {type: 'leak', wave: number, x: number, z: number, integrity: number}
 * | {type: 'wave-clear', wave: number, bonus: number, credits: number}
 * | {type: 'defeat', wave: number}} CombatEvent
 */

export function createGame() {
  const route = findPath(entry, exit);
  const state = {
    credits: 120, integrity: 12, wave: 0, running: false,
    turrets: [], enemies: [], projectiles: [],
  };
  let pending = 0;
  let spawnDelay = 0;
  let spawnIndex = 0;

  function placeTurret(x, z, type = 'basic') {
    if (typeof type !== 'string' || !Object.hasOwn(turretTypes, type)) return 'Unknown turret type.';
    const spec = turretTypes[type];
    if (!state.integrity || !inBounds(x, z) || tileAt(x, z) !== 'pad') return 'Choose an open blue build pad.';
    if (state.turrets.some(turret => turret.x === x && turret.z === z)) return 'That pad already has a turret.';
    if (state.turrets.length >= capacity.turrets) return 'Turret capacity reached.';
    if (state.credits < spec.cost) return `You need ${spec.cost} credits to build a turret.`;
    state.credits -= spec.cost;
    state.turrets.push({ x, z, type, angle: 0, cooldown: 0 });
    return 'Turret deployed.';
  }

  function startWave() {
    if (state.running || !state.integrity) return false;
    state.wave++;
    state.running = true;
    pending = Math.min(6 + state.wave * 2, capacity.enemies);
    spawnDelay = 0;
    spawnIndex = 0;
    return true;
  }

  /** @returns {CombatEvent[]} Events from this step, in simulation order. */
  function step(dt) {
    const events = [];
    if (!Number.isFinite(dt) || dt <= 0 || !state.running || !state.integrity) return events;
    spawnDelay -= dt;
    if (pending && spawnDelay <= 0 && state.enemies.length < capacity.enemies) {
      state.enemies.push({
        ...entry, progress: 0, angle: Math.PI / 2,
        type: state.wave >= 2 && spawnIndex % 2 === 1 ? 'runner' : 'grunt',
        hp: 2 + Math.floor((state.wave - 1) / 2),
      });
      // Carry the remainder so fixed-step rounding does not slow every spawn.
      spawnDelay += Math.max(0.27, 0.8 - state.wave * 0.035);
      pending--;
      spawnIndex++;
    }

    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const speed = Math.min(2.25, 1.2 + state.wave * 0.08);
      enemy.progress += dt * speed * (enemy.type === 'runner' ? 1.6 : 1);
      const segment = Math.floor(enemy.progress);
      if (segment >= route.length - 1) {
        enemy.hp = 0;
        state.integrity = Math.max(0, state.integrity - 1);
        events.push({ type: 'leak', wave: state.wave, x: exit.x, z: exit.z, integrity: state.integrity });
        if (!state.integrity) {
          events.push({ type: 'defeat', wave: state.wave });
          break;
        }
        continue;
      }
      const from = route[segment];
      const to = route[segment + 1];
      const t = enemy.progress - segment;
      enemy.x = from.x + (to.x - from.x) * t;
      enemy.z = from.z + (to.z - from.z) * t;
      enemy.angle = Math.atan2(to.x - from.x, to.z - from.z);
    }

    // Defeat ends the tick before combat can award any further credits.
    if (!state.integrity) {
      pending = 0;
      state.running = false;
      state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
      state.projectiles = [];
      return events;
    }

    for (const turret of state.turrets) {
      const turretType = turret.type ?? 'basic';
      const spec = turretTypes[turretType];
      turret.cooldown = Math.max(0, turret.cooldown - dt);
      const target = state.enemies.find(enemy =>
        enemy.hp > 0 && Math.hypot(enemy.x - turret.x, enemy.z - turret.z) <= spec.range);
      if (!target) continue;
      turret.angle = Math.atan2(target.x - turret.x, target.z - turret.z);
      if (turret.cooldown || state.projectiles.length >= capacity.projectiles) continue;
      state.projectiles.push({ x: turret.x, z: turret.z, y: 0.74, target, turretType });
      turret.cooldown = spec.cooldown;
      events.push({ type: 'shot', wave: state.wave, turretType, x: turret.x, z: turret.z });
    }

    for (const shot of state.projectiles) {
      if (shot.target.hp <= 0) continue;
      const turretType = shot.turretType ?? 'basic';
      const spec = turretTypes[turretType];
      const dx = shot.target.x - shot.x;
      const dy = 0.38 - shot.y;
      const dz = shot.target.z - shot.z;
      const distance = Math.hypot(dx, dy, dz);
      const travel = spec.projectileSpeed * dt;
      if (distance <= travel) {
        shot.hit = true;
        const damage = Math.min(spec.damage, shot.target.hp);
        shot.target.hp -= damage;
        const killed = shot.target.hp === 0;
        if (killed) state.credits += 8;
        events.push({
          type: 'hit', wave: state.wave, turretType,
          x: shot.target.x, z: shot.target.z, damage, killed,
        });
      } else {
        shot.x += dx * travel / distance;
        shot.y += dy * travel / distance;
        shot.z += dz * travel / distance;
      }
    }

    state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
    state.projectiles = state.projectiles.filter(shot => !shot.hit && shot.target.hp > 0);
    if (!pending && !state.enemies.length) {
      state.running = false;
      state.projectiles = [];
      state.credits += 20;
      events.push({ type: 'wave-clear', wave: state.wave, bonus: 20, credits: state.credits });
    }
    return events;
  }

  return { state, placeTurret, startWave, step };
}

export function createGameLoop(step) {
  let lastTime;
  let accumulated = 0;
  return time => {
    if (!Number.isFinite(time) || (lastTime !== undefined && time < lastTime)) return;
    if (lastTime !== undefined) accumulated += Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    // Timestamps and accumulated seconds can differ by floating-point roundoff.
    while (accumulated + 1e-12 >= stepSeconds) {
      step(stepSeconds);
      accumulated = Math.max(0, accumulated - stepSeconds);
    }
  };
}
