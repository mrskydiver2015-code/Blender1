export const width = 13;
export const depth = 9;
export const entry = { x: 0, z: 2 };
export const exit = { x: 12, z: 6 };
export const keyOf = (x, z) => z * width + x;
export const inBounds = (x, z) => Number.isInteger(x) && Number.isInteger(z)
  && x >= 0 && x < width && z >= 0 && z < depth;

const lane = new Set([
  ...[0, 1, 2, 3].map(x => keyOf(x, 2)),
  ...[3, 4, 5, 6].map(z => keyOf(3, z)),
  ...[4, 5, 6, 7].map(x => keyOf(x, 6)),
  ...[2, 3, 4, 5].map(z => keyOf(7, z)),
  ...[8, 9, 10].map(x => keyOf(x, 2)),
  ...[3, 4, 5, 6].map(z => keyOf(10, z)),
  ...[11, 12].map(x => keyOf(x, 6)),
]);

export function tileAt(x, z) {
  if (!inBounds(x, z)) return 'ground';
  if (lane.has(keyOf(x, z))) return 'path';
  const bordersLane = neighbors(x, z).some(tile => lane.has(keyOf(tile.x, tile.z)));
  return bordersLane ? 'pad' : 'ground';
}

function neighbors(x, z) {
  return [{ x: x - 1, z }, { x: x + 1, z }, { x, z: z - 1 }, { x, z: z + 1 }]
    .filter(tile => inBounds(tile.x, tile.z));
}

export function findPath(start, goal) {
  if (!inBounds(start?.x, start?.z) || !inBounds(goal?.x, goal?.z)) return [];
  const startKey = keyOf(start.x, start.z);
  const goalKey = keyOf(goal.x, goal.z);
  if (!lane.has(startKey) || !lane.has(goalKey)) return [];

  const heuristic = tile => Math.abs(tile.x - goal.x) + Math.abs(tile.z - goal.z);
  const frontier = new Map([[startKey, { ...start, priority: heuristic(start) }]]);
  const parent = new Map();
  const distance = new Map([[startKey, 0]]);

  while (frontier.size) {
    const [currentKey, current] = [...frontier].reduce((best, item) =>
      item[1].priority < best[1].priority ? item : best);
    frontier.delete(currentKey);
    if (currentKey === goalKey) {
      const route = [];
      for (let key = goalKey; key !== undefined; key = parent.get(key)) {
        route.push({ x: key % width, z: Math.floor(key / width) });
      }
      return route.reverse();
    }
    for (const tile of neighbors(current.x, current.z)) {
      const key = keyOf(tile.x, tile.z);
      const steps = distance.get(currentKey) + 1;
      if (!lane.has(key) || steps >= (distance.get(key) ?? Infinity)) continue;
      distance.set(key, steps);
      parent.set(key, currentKey);
      frontier.set(key, { ...tile, priority: steps + heuristic(tile) });
    }
  }
  return [];
}
