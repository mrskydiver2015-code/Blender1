import { Quaternion, Vector3 } from 'three';

const TAU = 2 * Math.PI;
export const MOVEMENT_ROLES = ['HourHand', 'MinuteHand', 'SecondHand', 'SmallSecondsHand',
  'GreatWheel_36T', 'Pinion_12T', 'IntermediateWheel_20T', 'TourbillonCage', 'BalanceWheel', 'Hairspring'];

export function localClockAngles(date) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const beatSeconds = Math.floor(seconds * 8) / 8;
  return {
    hour: -TAU * ((date.getHours() % 12) + date.getMinutes() / 60 + seconds / 3600) / 12,
    minute: -TAU * (date.getMinutes() + seconds / 60) / 60,
    second: -TAU * beatSeconds / 60,
    beatSeconds,
  };
}

export function mechanicalAngles(seconds) {
  const greatWheel = -TAU * seconds / 20;
  const pinion = -greatWheel * 36 / 12;
  return {
    GreatWheel_36T: greatWheel,
    Pinion_12T: pinion,
    IntermediateWheel_20T: -pinion * 12 / 20,
    TourbillonCage: -TAU * seconds / 60,
    // Four complete oscillations produce eight half-oscillation beats per second.
    BalanceWheel: Math.sin(TAU * 4 * seconds) * .55,
    Hairspring: Math.sin(TAU * 4 * seconds) * .10,
  };
}

export function bindMovement(root) {
  const pivots = new Map();
  root.traverse(object => {
    const role = object.userData.motionRole;
    if (MOVEMENT_ROLES.includes(role)) pivots.set(role, {
      object, rest: object.quaternion.clone(),
      axis: new Vector3(...object.userData.motionAxis).normalize(),
      restAngle: object.userData.restAngle || 0,
    });
  });
  const missing = MOVEMENT_ROLES.filter(role => !pivots.has(role));
  if (missing.length) throw new Error(`Movement pivots missing: ${missing.join(', ')}`);
  const rotation = new Quaternion();
  let last = null;
  function rotate(role, angle) {
    const pivot = pivots.get(role);
    rotation.setFromAxisAngle(pivot.axis, angle);
    pivot.object.quaternion.copy(pivot.rest).multiply(rotation);
  }
  return {
    update(date, elapsed) {
      const clock = localClockAngles(date);
      for (const [role, hand] of [['HourHand', 'hour'], ['MinuteHand', 'minute'], ['SecondHand', 'second'], ['SmallSecondsHand', 'second']]) {
        rotate(role, clock[hand] - pivots.get(role).restAngle);
      }
      const mechanism = mechanicalAngles(elapsed);
      for (const [role, angle] of Object.entries(mechanism)) rotate(role, angle);
      last = { clock, mechanism, localTime: date.toISOString(), elapsed };
    },
    get snapshot() {
      return { ...last, pivots: Object.fromEntries([...pivots].map(([name, pivot]) => [name, {
        quaternion: pivot.object.quaternion.toArray(), position: pivot.object.getWorldPosition(new Vector3()).toArray(),
      }])) };
    },
  };
}
