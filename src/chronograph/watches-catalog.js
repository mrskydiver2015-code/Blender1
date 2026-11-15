import model from '../../artifacts/chronograph_test/chronograph_web.glb?url';
import hero from '../../artifacts/chronograph_test/chronograph_hero.png?url';

export const tiers = ['Flagship', 'Mid-Tier', 'Entry'];
export const houses = [
  { id: 'patriks', name: 'PATRIKS', note: 'Marine instruments' },
  { id: 'house-02', name: 'House II', note: 'Brand to be curated' },
  { id: 'house-03', name: 'House III', note: 'Brand to be curated' },
];
const marine = {
  id: 'marine-01', number: '01', house: 'patriks', tier: 'Flagship', status: 'available',
  name: 'Marine Chronograph', edition: 'MARINE OBSERVATORY — No. 001',
  headline: ['Time,', 'engineered.'], description: 'A marine chronograph. A closer look at mechanical precision.',
  materialNote: 'Brushed steel. Champagne brass. Sapphire over an exposed movement.',
  specs: [['Frequency', '28,800 bph'], ['Architecture', 'Exposed tourbillon'], ['Crystal', 'AR sapphire']],
  assets: { model, hero },
  rig: { dialAnchor: 'DialCenter', normal: [0, .22495105, .97437006], fallbackCenter: [0, .20187329, .03410295], movement: true },
  camera: { fov: 32, minDistance: .28, maxDistance: 1.65, width: .46, height: .334,
    presets: {
      overview: { name: 'Overview', label: '01 — THREE-QUARTER', direction: [.32, .22, .92], scale: 1.08, shift: .09 },
      dial: { name: 'Dial', label: '02 — THE DIAL', direction: [0, .22495105, .97437006], scale: .78, shift: 0 },
      movement: { name: 'Movement', label: '03 — THE MOVEMENT', direction: [.04, .23, 1], scale: .43, shift: .23 },
      underside: { name: 'Under', label: '04 — UNDERSIDE / DISPLAY STAND CUT AWAY', direction: [.28, -.60, .75], scale: .78, shift: 0 },
    } },
  materials: { sapphire: 'Sapphire', lume: 'Ceramic lume', handLume: 'Thermally blued', plinth: 'Honed basalt',
    crystal: { envMapIntensity: .36, specularIntensity: .16, edgeOpacity: .055 }, standCutHeight: .075 },
  lighting: {
    studio: { environment: .72, rotation: 40 * Math.PI / 180, exposure: 1.04, key: .85, fill: 0 },
    gallery: { environment: .58, rotation: 1.15, exposure: .96, key: .85, fill: 1.25 },
    night: { environment: .065, rotation: .7, exposure: .85, key: .09, fill: .035 },
    keyPosition: [.70, .80, .83], fillPosition: [-.70, .65, .83], lumeColor: '#42efa6', lumeIntensity: 1.2,
  },
  features: ['loupe', 'lume'], audio: { beatsPerSecond: 8, volume: .055 },
};

export const watches = houses.flatMap((house, h) => tiers.map((tier, t) => h === 0 && t === 0 ? marine : {
  id: `${house.id}-${t + 1}`, number: String(h * 3 + t + 1).padStart(2, '0'), house: house.id, tier,
  status: 'reserved', name: 'A future expression', assets: null,
}));
export function selectWatch(id) { return watches.find(w => w.id === id && w.status === 'available') || marine; }
