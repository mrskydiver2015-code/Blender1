import assert from 'node:assert/strict';
import test from 'node:test';
import { width, depth, entry, exit, inBounds, tileAt, findPath } from './board.js';
import { capacity, createGame, createGameLoop, stepSeconds, turretCost, turretTypes } from './game.js';

const enemy = (overrides = {}) => ({ x: entry.x, z: entry.z, progress: 0, angle: 0, hp: 2, type: 'grunt', ...overrides });
const shot = (target, turretType = 'basic') => ({ x: target.x, z: target.z, y: 0.38, target, turretType });
const cells = Array.from({ length: width * depth }, (_, i) => ({ x: i % width, z: Math.floor(i / width) }));
const pads = cells.filter(({ x, z }) => tileAt(x, z) === 'pad');

function finishWave(game) {
  for (let i = 0; i < 6000 && game.state.running; i++) game.step(stepSeconds);
  assert.equal(game.state.running, false, 'wave must finish within 100 simulated seconds');
}

test('grid APIs reject fractional, aliased, out-of-bounds and nonnumeric input', () => {
  const game = createGame();
  for (const [x, z] of [
    [0.5, 1 + 0.5 / width], [0.5, 2 + 0.5 / width],
    [-1, 2], [width, 2], [0, depth], [NaN, 2], [Infinity, 2],
    ['0', 2], [null, 2], [undefined, 2], [0, '2'], [true, 2],
  ]) {
    assert.equal(inBounds(x, z), false);
    assert.equal(tileAt(x, z), 'ground');
    assert.deepEqual(findPath({ x, z }, exit), []);
    assert.deepEqual(findPath(entry, { x, z }), []);
    assert.notEqual(game.placeTurret(x, z), 'Turret deployed.');
  }
  for (const invalid of [null, undefined, {}, 0, 'entry']) {
    assert.deepEqual(findPath(invalid, exit), []);
    assert.deepEqual(findPath(entry, invalid), []);
  }
  assert.equal(game.state.credits, 120);
  assert.equal(game.state.turrets.length, 0);
});

test('A* agrees with independent BFS for every pair of board cells', () => {
  for (const start of cells) {
    const distances = new Map();
    const queue = [];
    const key = ({ x, z }) => `${x},${z}`;
    if (tileAt(start.x, start.z) === 'path') {
      distances.set(key(start), 0);
      queue.push(start);
    }
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: current.x + dx, z: current.z + dz };
        if (!inBounds(next.x, next.z) || tileAt(next.x, next.z) !== 'path' || distances.has(key(next))) continue;
        distances.set(key(next), distances.get(key(current)) + 1);
        queue.push(next);
      }
    }
    for (const goal of cells) {
      const path = findPath(start, goal);
      const distance = distances.get(key(goal));
      if (distance === undefined) {
        assert.deepEqual(path, []);
        continue;
      }
      assert.equal(path.length, distance + 1);
      assert.deepEqual(path[0], start);
      assert.deepEqual(path.at(-1), goal);
      path.forEach((cell, i) => {
        assert.equal(tileAt(cell.x, cell.z), 'path');
        if (i) assert.equal(Math.abs(cell.x - path[i - 1].x) + Math.abs(cell.z - path[i - 1].z), 1);
      });
    }
  }
});

test('placement charges exactly once and rejects occupied, poor and full states', () => {
  const game = createGame();
  const { x, z } = pads[0];
  assert.equal(game.placeTurret(x, z), 'Turret deployed.');
  assert.equal(game.state.credits, 120 - turretCost);
  assert.equal(game.state.turrets.length, 1);
  assert.notEqual(game.placeTurret(x, z), 'Turret deployed.');
  assert.equal(game.state.credits, 80);
  game.state.credits = turretCost - 1;
  assert.notEqual(game.placeTurret(pads[1].x, pads[1].z), 'Turret deployed.');
  assert.equal(game.state.credits, turretCost - 1);
  game.state.credits = 120;
  game.state.turrets = Array.from({ length: capacity.turrets }, () => ({ x: -1, z: -1 }));
  assert.notEqual(game.placeTurret(x, z), 'Turret deployed.');
  assert.equal(game.state.turrets.length, capacity.turrets);
  assert.equal(game.state.credits, 120);
});

test('fixed loop is independent of frame rate and caps stalls at six steps', () => {
  for (const fps of [30, 60, 120, 144]) {
    const deltas = [];
    const advance = createGameLoop(dt => deltas.push(dt));
    for (let i = 0; i <= fps; i++) advance(i * 1000 / fps);
    assert.equal(deltas.length, 60, `${fps} FPS`);
    assert.ok(deltas.every(dt => dt === stepSeconds));
  }
  let count = 0;
  const advance = createGameLoop(() => count++);
  for (const time of [NaN, undefined, Infinity, '0', 0, 1000]) advance(time);
  assert.equal(count, 6);
  for (const time of [NaN, Infinity, 999, 1000]) advance(time);
  assert.equal(count, 6);
  advance(1000 + 1000 / 60);
  assert.equal(count, 7);
});

test('invalid simulation deltas leave all state unchanged', () => {
  const game = createGame();
  game.startWave();
  const before = structuredClone(game.state);
  for (const dt of [NaN, Infinity, -Infinity, -1, 0, '0.016', null, undefined]) game.step(dt);
  assert.deepEqual(game.state, before);
  game.step(stepSeconds);
  assert.equal(game.state.enemies.length, 1);
});

test('spawning carries fractional intervals and never exceeds enemy capacity', () => {
  const game = createGame();
  assert.equal(game.startWave(), true);
  assert.equal(game.startWave(), false);
  assert.equal(game.state.wave, 1);
  const ticks = [];
  let previous = 0;
  for (let tick = 1; tick <= 400; tick++) {
    game.step(stepSeconds);
    if (game.state.enemies.length > previous) ticks.push(tick);
    previous = game.state.enemies.length;
  }
  assert.deepEqual(ticks, [1, 46, 92, 138, 184, 230, 276, 322]);

  const full = createGame();
  full.startWave();
  full.state.enemies = Array.from({ length: capacity.enemies }, () => enemy());
  full.step(stepSeconds);
  assert.equal(full.state.enemies.length, capacity.enemies);
  full.state.enemies.pop();
  full.step(stepSeconds);
  assert.equal(full.state.enemies.length, capacity.enemies);
});

test('targeting ignores dead and distant enemies and respects projectile capacity', () => {
  const game = createGame();
  game.startWave();
  game.state.turrets.push({ x: 0, z: 1, cooldown: 0, angle: 0 });
  const dead = enemy({ hp: 0 });
  const distant = enemy({ progress: 10 });
  const target = enemy();
  game.state.enemies.push(dead, distant, target);
  game.step(stepSeconds);
  assert.equal(game.state.projectiles.length, 1);
  assert.equal(game.state.projectiles[0].target, target);

  game.state.turrets[0].cooldown = 0;
  game.state.projectiles = Array.from({ length: capacity.projectiles }, () => ({ ...shot(target), x: 100 }));
  game.step(stepSeconds);
  assert.equal(game.state.projectiles.length, capacity.projectiles);
  assert.equal(game.state.turrets[0].cooldown, 0);
});

test('late waves retain the capped spawn quota and complete after the final leak', () => {
  const game = createGame();
  game.state.wave = 99;
  game.state.integrity = 1000;
  game.startWave();
  const spawned = new Set();
  for (let i = 0; i < 6000 && game.state.running; i++) {
    game.step(stepSeconds);
    assert.ok(game.state.enemies.length <= capacity.enemies);
    for (const current of game.state.enemies) spawned.add(current);
  }
  assert.equal(game.state.running, false);
  assert.equal(spawned.size, capacity.enemies);
  assert.equal(game.state.integrity, 1000 - capacity.enemies);
  assert.equal(game.state.credits, 140);
});

test('multiple lethal shots pay one kill reward; leaked targets pay none', () => {
  const game = createGame();
  game.startWave();
  const target = enemy({ hp: 1 });
  const leaked = enemy({ progress: findPath(entry, exit).length - 1 });
  game.state.enemies.push(target, leaked);
  game.state.projectiles.push(shot(target), shot(target), shot(leaked));
  game.step(stepSeconds);
  assert.equal(game.state.credits, 128);
  assert.equal(game.state.integrity, 11);
  assert.equal(target.hp, 0);
  assert.equal(game.state.projectiles.length, 0);
});

test('wave completion pays once; the next lethal wave freezes without rewards', () => {
  const game = createGame();
  game.startWave();
  finishWave(game);
  assert.equal(game.state.integrity, 4);
  assert.equal(game.state.credits, 140);
  const idle = structuredClone(game.state);
  game.step(stepSeconds);
  assert.deepEqual(game.state, idle);
  assert.equal(game.startWave(), true);
  finishWave(game);
  assert.equal(game.state.integrity, 0);
  assert.equal(game.state.credits, 140);
  assert.equal(game.state.projectiles.length, 0);
  const terminal = structuredClone(game.state);
  assert.equal(game.startWave(), false);
  assert.notEqual(game.placeTurret(pads[0].x, pads[0].z), 'Turret deployed.');
  for (let i = 0; i < 100; i++) game.step(stepSeconds);
  assert.deepEqual(game.state, terminal);
});

test('a lethal leak stops movement and combat during that same tick', () => {
  const game = createGame();
  game.startWave();
  game.state.integrity = 1;
  const target = enemy({ hp: 1 });
  game.state.enemies.push(enemy({ progress: findPath(entry, exit).length - 1 }), target);
  game.state.projectiles.push(shot(target));
  game.step(stepSeconds);
  assert.equal(game.state.running, false);
  assert.equal(game.state.integrity, 0);
  assert.equal(game.state.credits, 120);
  assert.equal(target.hp, 1);
  assert.equal(target.progress, 0);
  assert.equal(game.state.projectiles.length, 0);
});

test('fully defended first wave accounts for every purchase, kill and clear reward', () => {
  const game = createGame();
  game.state.credits = 10000;
  for (const { x, z } of pads) assert.equal(game.placeTurret(x, z), 'Turret deployed.');
  game.startWave();
  finishWave(game);
  assert.equal(game.state.integrity, 12);
  assert.equal(game.state.credits, 10000 - pads.length * turretCost + 8 * 8 + 20);
  assert.equal(game.state.enemies.length, 0);
  assert.equal(game.state.projectiles.length, 0);
});

test('turret definitions, default placement and mixed purchase messages preserve the contract', () => {
  assert.deepEqual(turretTypes, {
    basic: { cost: 40, range: 2.5, cooldown: 0.52, damage: 1, projectileSpeed: 9 },
    rail: { cost: 80, range: 4.5, cooldown: 1.8, damage: 4, projectileSpeed: 18 },
  });
  assert.equal(turretCost, turretTypes.basic.cost);
  const game = createGame();
  assert.equal(game.placeTurret(0, 1), 'Turret deployed.');
  assert.equal(game.placeTurret(1, 1, 'rail'), 'Turret deployed.');
  assert.deepEqual(game.state.turrets.map(turret => turret.type), ['basic', 'rail']);
  assert.equal(game.state.credits, 0);
  assert.equal(game.placeTurret(1, 1, 'rail'), 'That pad already has a turret.');
  assert.equal(game.placeTurret(2, 1, 'rail'), 'You need 80 credits to build a turret.');
  assert.equal(game.placeTurret(2, 1), 'You need 40 credits to build a turret.');
  assert.equal(game.placeTurret(0, 0, 'rail'), 'Choose an open blue build pad.');
});

test('unknown turret types, including inherited properties, reject without mutation', () => {
  const game = createGame();
  const before = structuredClone(game.state);
  for (const type of ['laser', '', 'Basic', '__proto__', 'constructor', 'toString', null, {}, ['basic'], 0, Symbol('rail')]) {
    assert.equal(game.placeTurret(0, 1, type), 'Unknown turret type.');
    assert.deepEqual(game.state, before);
  }
});

// Prime the first spawn, leaving its interval intact so short combat fixtures
// can isolate their own targets without changing the private pending quota.
function combatGame(wave = 1) {
  const game = createGame();
  game.state.wave = wave - 1;
  game.startWave();
  game.step(stepSeconds);
  game.state.enemies = [];
  return game;
}

test('mixed turret shots use their own cooldowns and share aggregate capacities', () => {
  const game = combatGame();
  game.placeTurret(0, 1);
  game.placeTurret(1, 1, 'rail');
  game.state.enemies.push(enemy({ hp: 100 }));
  assert.deepEqual(game.step(stepSeconds), [
    { type: 'shot', wave: 1, turretType: 'basic', x: 0, z: 1 },
    { type: 'shot', wave: 1, turretType: 'rail', x: 1, z: 1 },
  ]);
  assert.deepEqual(game.state.turrets.map(turret => turret.cooldown), [0.52, 1.8]);
  assert.equal(game.step(stepSeconds).filter(event => event.type === 'shot').length, 0);

  for (const turret of game.state.turrets) turret.cooldown = 0;
  const target = game.state.enemies[0];
  game.state.projectiles = Array.from({ length: capacity.projectiles - 1 }, () => ({ ...shot(target, 'rail'), x: 100 }));
  const events = game.step(stepSeconds);
  assert.equal(game.state.projectiles.length, capacity.projectiles);
  assert.deepEqual(events.map(event => event.turretType), ['basic']);
  assert.equal(game.state.turrets[1].cooldown, 0);
  game.state.turrets = Array.from({ length: capacity.turrets }, (_, i) => ({ type: i % 2 ? 'rail' : 'basic', x: -1, z: -1 }));
  game.state.credits = 1000;
  assert.equal(game.placeTurret(2, 1, 'rail'), 'Turret capacity reached.');
  assert.equal(game.state.credits, 1000);
});

test('each turret uses inclusive Euclidean X/Z range at, inside and outside the boundary', () => {
  for (const type of ['basic', 'rail']) {
    for (const offset of [-1e-8, 0, 1e-8]) {
      const game = combatGame();
      const range = turretTypes[type].range;
      assert.equal(game.placeTurret(3, 7, type), 'Turret deployed.');
      // On the vertical lane, both boundary coordinates are exact binary halves.
      const desiredZ = 7 - range + offset;
      const target = enemy({ hp: 100, progress: desiredZ + 1 - 1.28 * stepSeconds });
      game.state.enemies.push(target);
      const events = game.step(stepSeconds);
      assert.equal(events.filter(event => event.type === 'shot').length, offset < 0 ? 0 : 1, `${type}, offset ${offset}`);
      assert.ok(Math.abs(target.z - desiredZ) < 1e-14);
    }
  }
});

test('diagonal range uses Euclidean rather than Manhattan or square distance', () => {
  for (const [type, x, z, progress, expected] of [
    ['basic', 2, 3, 0, true], // sqrt(5) < 2.5, Manhattan distance 3
    ['basic', 2, 4, 0, false], // sqrt(8) > 2.5, both axis distances only 2
    ['rail', 7, 1, 3, true], // sqrt(17) < 4.5, Manhattan distance 5
    ['rail', 6, 2, 7, false], // near sqrt(25) > 4.5, both axis distances below 4.5
  ]) {
    const game = combatGame();
    assert.equal(game.placeTurret(x, z, type), 'Turret deployed.');
    const target = enemy({ progress, hp: 100 });
    game.state.enemies.push(target);
    const events = game.step(stepSeconds);
    assert.equal(events.some(event => event.type === 'shot'), expected, `${type} at ${x},${z}`);
  }
});

test('both projectile types travel at their configured speed and home toward moving targets', () => {
  for (const type of ['basic', 'rail']) {
    const game = combatGame();
    game.placeTurret(0, 1, type);
    const target = enemy({ hp: 10 });
    game.state.enemies.push(target);
    assert.equal(game.step(stepSeconds)[0].type, 'shot');
    assert.equal(target.hp, 10, 'no immediate hitscan damage');
    const projectile = game.state.projectiles[0];
    const travel = turretTypes[type].projectileSpeed * stepSeconds;
    assert.equal(projectile.turretType, type);
    assert.ok(Math.abs(Math.hypot(projectile.x, projectile.y - 0.74, projectile.z - 1) - travel) < 1e-12);
    const before = { ...projectile };
    target.progress = 2.8;
    assert.deepEqual(game.step(stepSeconds), []);
    const distance = Math.hypot(target.x - before.x, 0.38 - before.y, target.z - before.z);
    assert.ok(Math.abs(projectile.x - before.x - (target.x - before.x) * travel / distance) < 1e-12);
    assert.ok(Math.abs(projectile.y - before.y - (0.38 - before.y) * travel / distance) < 1e-12);
    assert.ok(Math.abs(projectile.z - before.z - (target.z - before.z) * travel / distance) < 1e-12);
    assert.equal(target.hp, 10);
  }
});

test('hit events report actual damage and rail overkill rewards exactly once', () => {
  for (const [type, hp, damage, killed] of [
    ['basic', 3, 1, false], ['basic', 1, 1, true],
    ['rail', 6, 4, false], ['rail', 4, 4, true], ['rail', 2, 2, true],
  ]) {
    const game = combatGame();
    const target = enemy({ hp });
    game.state.enemies.push(target);
    game.state.projectiles.push(shot(target, type));
    const events = game.step(stepSeconds);
    assert.deepEqual(events, [{ type: 'hit', wave: 1, turretType: type, x: target.x, z: target.z, damage, killed }]);
    assert.equal(target.hp, hp - damage);
    assert.equal(game.state.credits, killed ? 128 : 120);
    assert.equal(game.state.projectiles.length, 0);
  }
  const game = combatGame();
  const target = enemy({ hp: 5 });
  const bystander = enemy({ hp: 5 });
  game.state.enemies.push(target, bystander);
  game.state.projectiles.push(shot(target), shot(target, 'rail'), shot(target, 'rail'));
  const hits = game.step(stepSeconds);
  assert.deepEqual(hits.map(({ turretType, damage, killed }) => ({ turretType, damage, killed })), [
    { turretType: 'basic', damage: 1, killed: false },
    { turretType: 'rail', damage: 4, killed: true },
  ]);
  assert.equal(game.state.credits, 128);
  assert.equal(bystander.hp, 5, 'no piercing or area damage');
  assert.deepEqual(game.state.projectiles, []);
});

test('wave composition alternates by successful spawn index and resets each wave', () => {
  const game = createGame();
  game.state.integrity = 1000;
  for (let wave = 1; wave <= 4; wave++) {
    game.startWave();
    const spawned = new Map();
    let tick = 0;
    while (game.state.running && tick++ < 6000) {
      game.step(stepSeconds);
      for (const current of game.state.enemies) {
        if (!spawned.has(current)) spawned.set(current, { type: current.type, hp: current.hp, tick });
      }
    }
    assert.equal(game.state.running, false);
    assert.equal(spawned.size, 6 + wave * 2);
    [...spawned.values()].forEach((current, index) => {
      assert.equal(current.type, wave >= 2 && index % 2 ? 'runner' : 'grunt');
      assert.equal(current.hp, 2 + Math.floor((wave - 1) / 2));
      assert.ok(Math.abs(current.tick * stepSeconds - index * Math.max(0.27, 0.8 - wave * 0.035)) <= stepSeconds + 1e-12);
    });
    assert.equal(game.state.credits, 120 + wave * 20, 'leaks give no kill rewards');
  }
  const full = createGame();
  full.state.wave = 1;
  full.startWave();
  full.state.enemies = Array.from({ length: capacity.enemies }, () => enemy());
  full.step(stepSeconds);
  full.state.enemies = [];
  full.step(stepSeconds);
  assert.equal(full.state.enemies[0].type, 'grunt', 'blocked spawns do not consume an index');
});

test('runner speed is 1.6 times wave-scaled grunt speed, including the grunt speed cap', () => {
  for (const wave of [2, 5, 100]) {
    const game = combatGame(wave);
    const grunt = enemy();
    const runner = enemy({ type: 'runner' });
    game.state.enemies.push(grunt, runner);
    game.step(stepSeconds);
    const speed = Math.min(2.25, 1.2 + wave * 0.08);
    assert.ok(Math.abs(grunt.progress - speed * stepSeconds) < 1e-12);
    assert.ok(Math.abs(runner.progress - grunt.progress * 1.6) < 1e-12);
  }
});

test('every call returns a fresh array and retained event data does not change on later steps', () => {
  const game = createGame();
  const arrays = [game.step(stepSeconds), game.step(stepSeconds)];
  game.startWave();
  for (const dt of [NaN, Infinity, -1, 0, '1', undefined]) arrays.push(game.step(dt));
  arrays.push(game.step(stepSeconds), game.step(stepSeconds));
  assert.ok(arrays.every(events => Array.isArray(events) && events.length === 0));
  assert.equal(new Set(arrays).size, arrays.length);
  game.placeTurret(0, 1);
  const events = game.step(stepSeconds);
  const snapshot = structuredClone(events);
  events.push({ type: 'consumer-only' });
  const next = game.step(stepSeconds);
  assert.ok(!next.some(event => event.type === 'consumer-only'));
  events.pop();
  assert.deepEqual(events, snapshot);
});

test('events follow movement/leaks, shots, impacts and completion order', () => {
  const game = combatGame();
  game.placeTurret(0, 1);
  game.placeTurret(1, 1, 'rail');
  const target = enemy({ hp: 2 });
  game.state.enemies.push(enemy({ progress: findPath(entry, exit).length - 1 }), target);
  game.state.projectiles.push(shot(target, 'rail'));
  const events = game.step(stepSeconds);
  assert.deepEqual(events, [
    { type: 'leak', wave: 1, x: exit.x, z: exit.z, integrity: 11 },
    { type: 'shot', wave: 1, turretType: 'basic', x: 0, z: 1 },
    { type: 'shot', wave: 1, turretType: 'rail', x: 1, z: 1 },
    { type: 'hit', wave: 1, turretType: 'rail', x: target.x, z: target.z, damage: 2, killed: true },
  ]);
  assert.equal(game.state.credits, 8);
});

test('wave-clear follows the final impact and includes the awarded balance exactly once', () => {
  const game = createGame();
  game.startWave();
  for (let i = 0; i < 400; i++) game.step(stepSeconds);
  assert.equal(game.state.enemies.length, 8);
  game.state.projectiles = game.state.enemies.map(current => shot(current, 'rail'));
  const events = game.step(stepSeconds);
  assert.deepEqual(events.map(event => event.type), [...Array(8).fill('hit'), 'wave-clear']);
  assert.ok(events.slice(0, -1).every(event => event.killed && event.damage === 2));
  assert.deepEqual(events.at(-1), { type: 'wave-clear', wave: 1, bonus: 20, credits: 204 });
  const terminal = structuredClone(game.state);
  for (let i = 0; i < 10; i++) assert.deepEqual(game.step(stepSeconds), []);
  assert.deepEqual(game.state, terminal);
});

test('leak then wave-clear pays a surviving bonus but never a kill reward', () => {
  const game = createGame();
  game.startWave();
  for (let i = 0; i < 400; i++) game.step(stepSeconds);
  for (const current of game.state.enemies) current.progress = findPath(entry, exit).length - 1;
  game.state.projectiles = game.state.enemies.map(current => shot(current, 'rail'));
  const events = game.step(stepSeconds);
  assert.deepEqual(events.map(event => event.type), [...Array(8).fill('leak'), 'wave-clear']);
  assert.deepEqual(events.slice(0, -1).map(event => event.integrity), [11, 10, 9, 8, 7, 6, 5, 4]);
  assert.deepEqual(events.at(-1), { type: 'wave-clear', wave: 1, bonus: 20, credits: 140 });
});

test('lethal leak emits defeat immediately and only once, with no further combat', () => {
  const game = combatGame(2);
  game.placeTurret(0, 1, 'rail');
  game.state.integrity = 2;
  const target = enemy({ hp: 1 });
  game.state.enemies.push(
    enemy({ progress: findPath(entry, exit).length - 1 }),
    enemy({ progress: findPath(entry, exit).length - 1, type: 'runner' }),
    target,
  );
  game.state.projectiles.push(shot(target, 'rail'));
  assert.deepEqual(game.step(stepSeconds), [
    { type: 'leak', wave: 2, x: exit.x, z: exit.z, integrity: 1 },
    { type: 'leak', wave: 2, x: exit.x, z: exit.z, integrity: 0 },
    { type: 'defeat', wave: 2 },
  ]);
  assert.equal(target.hp, 1);
  assert.equal(target.progress, 0);
  assert.equal(game.state.credits, 40);
  assert.equal(game.state.running, false);
  const terminal = structuredClone(game.state);
  const first = game.step(stepSeconds);
  for (let i = 0; i < 10; i++) {
    const events = game.step(stepSeconds);
    assert.deepEqual(events, []);
    assert.notEqual(events, first);
  }
  assert.equal(game.startWave(), false);
  assert.deepEqual(game.state, terminal);
});

test('a frame consumer can batch every fixed-step event in order without loss or replay', () => {
  const game = combatGame();
  const target = enemy({ hp: 3 });
  game.state.enemies.push(target);
  game.placeTurret(0, 1);
  game.state.projectiles.push({ ...shot(target), x: -0.25 });
  const batches = [];
  const frameEvents = [];
  const advance = createGameLoop(dt => {
    const events = game.step(dt);
    batches.push(events);
    frameEvents.push(...events);
  });
  advance(0);
  advance(100);
  assert.equal(batches.length, 6);
  assert.equal(new Set(batches).size, 6);
  assert.equal(batches[0][0].type, 'shot');
  assert.ok(batches.slice(1).some(events => events.some(event => event.type === 'hit')));
  assert.deepEqual(frameEvents, batches.flat());
  assert.deepEqual(frameEvents.map(event => event.type), ['shot', 'hit']);
  frameEvents.length = 0;
  advance(100);
  assert.deepEqual(frameEvents, []);
});
