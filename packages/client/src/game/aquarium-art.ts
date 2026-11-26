export const TANK_WIDTH = 320;
export const TANK_HEIGHT = 164;

type Palette = Record<string, string>;
type Sprite = readonly string[];

function stamp(ctx: CanvasRenderingContext2D, rows: Sprite, colors: Palette, x: number, y: number, scale = 1, flip = false): void {
  const width = Math.max(...rows.map((row) => row.length));
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) {
    ctx.translate(width * scale, 0);
    ctx.scale(-1, 1);
  }
  rows.forEach((row, dy) => {
    Array.from(row).forEach((ink, dx) => {
      const color = colors[ink];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(dx * scale, dy * scale, scale, scale);
    });
  });
  ctx.restore();
}

const fish = [
  ['......ss.......', '.....sHHs......', '...ss1WW1ss..s.', '..sH11WW11Hs.s1', '.sHWe1WW11HHs11', '.s1111WW11HHs11', '..ss11WW1Hss.s1', '....ssssss...s.', '......ss.......'],
  ['......sH........', '.....sHHs.......', '...ssHHH1s......', '..sHHHH111ss..sH', '.sHeHH11111HssHH', '..sHH1111HHHssHH', '...sss111Hss..HH', '......ssss......', '.......s........'],
  ['.......sH.......', '......s1s.......', '.....sW1Hs......', '...ssH11Hss...s.', '..sHeW11WH1sss1s', '...sH1111H1s..s.', '....ssH11Hs.....', '......sH1s......', '.......ss.......'],
];
const fishColors: readonly Palette[] = [
  { s: '#763741', H: '#ffac57', '1': '#f47542', W: '#fff0c8', e: '#232640' },
  { s: '#183f76', H: '#61d8ff', '1': '#2b80d0', e: '#fff2a4' },
  { s: '#503779', H: '#fae37e', '1': '#b378c6', W: '#fff3ba', e: '#192b4b' },
];
const ray = [
  '.......d...........d.......',
  '......dbd.........dbd......',
  '..dd.dbbbdddddddddabbd.dd..',
  '.dbbddbbbbbbbbbbbbbbddbbd..',
  '.dbbbdbaabaabaabaabadbbbd..',
  '..dbbbbaaabbbbaaaabbbbbd...',
  '...ddbbabbaaeeaababbdd.....',
  '.....ddddabaaaabaddd.......',
  '........ddwwwwdd...........',
  '..........dddd.............',
];
const rayColors = { d: '#294279', b: '#588ac0', a: '#8ac6e1', e: '#203056', w: '#bde9df' };
const jelly = ['....wwww....', '..wwppppww..', '.wppppppppw.', 'wppwhpphwppw', 'wppppppppppw', '.wwwwwwwwww.', '..p..p..p...', '..h..h..h...', '...p.p.p....'];
const jellyColors = { w: '#c899eb', p: '#936dc2', h: '#f1c5e8' };
const octopus = ['....pppp....', '...phhhhp...', '..phhhphhp..', '..phdhhdhp..', '..phhhhhhp..', '.pppphppppp.', 'p.p.pppp.p.p', 'p.pp.hh.pp.p', '.p.p....p.p.', '...pp..pp...'];
const octopusColors = { p: '#984c7d', h: '#e77c9e', d: '#313050' };
const horse = ['...HH..', '..H1Hs.', '..He11H', '...Hss.', '..H1s..', '..H1s..', '...H1s.', '....H1s', '..H..1s', '..ss1s.'];
const horseColors = { s: '#794b78', H: '#fdbc83', '1': '#c77d77', e: '#253751' };
const clam = ['..dddddd..', '.dpwpwpwd.', 'dpwpppwppd', 'dppwowpppd', '.wwwwwwww.', '..dddddd..'];
const clamColors = { d: '#675377', p: '#c788a2', w: '#f1b1b5', o: '#fff2cb' };
const star = ['....h.....', '....hh....', 'h..hhh..h.', '.hhoohhh..', '..hooh....', '..hhhh....', '.hh..hh...', '.h....h...'];
const starColors = { h: '#de7d72', o: '#f2b98d' };

const sand = ['#b79270', '#d9b88a', '#e1c69c', '#9b7e71'];
const water = ['#1b6b85', '#1b6482', '#1a5d7e', '#1a5578', '#194e72', '#18476c', '#173f63', '#16375c'];
const reef = [
  { x: 27, y: 141, height: 38, color: '#f18186', shade: '#9f5277' },
  { x: 51, y: 144, height: 25, color: '#f3ae76', shade: '#af6a73' },
  { x: 81, y: 148, height: 29, color: '#ae8ad7', shade: '#6e599f' },
  { x: 198, y: 148, height: 22, color: '#eda58a', shade: '#aa6582' },
  { x: 248, y: 143, height: 38, color: '#f38d9d', shade: '#9a567e' },
  { x: 271, y: 144, height: 27, color: '#c079d2', shade: '#79508f' },
];

const school = Array.from({ length: 24 }, (_, index) => ({
  kind: index % fish.length,
  x: (index * 61 + 15) % TANK_WIDTH,
  y: 24 + ((index * 31) % 86),
  speed: (8 + (index % 7) * 2.8) * (index % 3 === 0 ? -1 : 1),
  scale: index % 6 === 0 ? 2 : 1,
}));

const food = [
  { x: 115, drop: 0.15, eat: 2.3, speed: 22 },
  { x: 143, drop: 0.40, eat: 2.7, speed: 21 },
  { x: 170, drop: 0.23, eat: 3.3, speed: 22 },
  { x: 191, drop: 0.66, eat: 3.1, speed: 21 },
  { x: 222, drop: 0.49, eat: 3.7, speed: 22 },
  { x: 244, drop: 0.77, eat: 4.1, speed: 20 },
];
const rayFood = { x: 160, drop: 0.65, eat: 4.9, speed: 26 };
const octopusFood = { x: 188, drop: 0.91, eat: 5.7, speed: 27 };
const grains = [...food, rayFood, octopusFood];
export const FEED_DURATION = 7.5;

interface Grain { x: number; drop: number; eat: number; speed: number }
interface FeedingFish { grain: Grain; flip: boolean }
export interface Feeding { at: number; fish: ReadonlyMap<number, FeedingFish> }

function swimmerX(swimmer: typeof school[number], t: number): number {
  return ((swimmer.x + t * swimmer.speed) % 360 + 360) % 360 - 20;
}

function grainAt(grain: Grain, age: number) {
  const sinking = Math.max(0, Math.min(age, grain.eat) - grain.drop);
  return { x: grain.x + Math.sin(sinking * 1.5) * 4, y: 10 + sinking * grain.speed };
}

export function startFeeding(at: number): Feeding {
  const fish = new Map<number, FeedingFish>();
  for (const grain of food) {
    const destination = grainAt(grain, grain.eat);
    let closest: { index: number; flip: boolean; distance: number } | undefined;
    for (const [index, swimmer] of school.entries()) {
      if (fish.has(index)) continue;
      const x = swimmerX(swimmer, at);
      const distance = Math.hypot(x - destination.x, swimmer.y - destination.y);
      if (!closest || distance < closest.distance) {
        closest = { index, flip: x < destination.x, distance };
      }
    }
    if (closest) fish.set(closest.index, { grain, flip: closest.flip });
  }
  return { at, fish };
}

function feedBlend(grain: Grain, age: number): number {
  const approach = Math.min(1, Math.max(0, (age - grain.drop) / (grain.eat - grain.drop)));
  const release = Math.min(1, Math.max(0, (age - grain.eat - 0.22) / 1.4));
  const ease = (value: number) => value * value * (3 - 2 * value);
  return ease(approach) * (1 - ease(release));
}

function mix(from: number, to: number, weight: number): number {
  return from + (to - from) * weight;
}

function paintFood(ctx: CanvasRenderingContext2D, age: number): void {
  for (const grain of grains) {
    if (age < grain.drop || age > grain.eat + 0.26) continue;
    const { x, y } = grainAt(grain, age);
    const left = Math.round(x);
    const top = Math.round(y);
    if (age < grain.eat) {
      ctx.fillStyle = '#72465d';
      ctx.fillRect(left, top, 4, 4);
      ctx.fillStyle = '#ffd98e';
      ctx.fillRect(left, top, 3, 2);
      continue;
    }
    const spread = Math.round((age - grain.eat) * 23);
    ctx.fillStyle = '#fff0be';
    ctx.fillRect(left - spread, top - spread, 1, 1);
    ctx.fillRect(left + spread, top - 1, 1, 1);
    ctx.fillRect(left + 1, top + spread, 1, 1);
  }
}

function waterline(x: number, t: number): number {
  return 9 + Math.round(Math.sin(x * 0.10 + t * 2));
}

function coral(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, color: string, shade: string): void {
  for (const [side, top, width] of [[-1, 0.68, 3], [1, 0.82, 4], [0, 1, 5]] as const) {
    for (let step = 0; step < height * top; step += 3) {
      const offset = Math.round(side * step * 0.46);
      ctx.fillStyle = shade;
      ctx.fillRect(x + offset - 2, y - step, width + 2, 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + offset - 1, y - step, width - 1, 3);
    }
  }
}

function plants(ctx: CanvasRenderingContext2D, t: number): void {
  for (const [x, height] of [[15, 45], [61, 30], [105, 24], [223, 31], [285, 48], [307, 34]] as const) {
    for (let stalk = 0; stalk < 3; stalk++) {
      for (let y = 0; y < height - stalk * 5; y += 2) {
        const sway = Math.round(Math.sin(y * 0.10 + t * 1.25 + x) * y * 0.12);
        const left = x + (stalk - 1) * 6 + sway;
        ctx.fillStyle = stalk === 1 ? '#42bca0' : '#2c8a8c';
        ctx.fillRect(left, 143 - y, y < height * 0.55 ? 3 : 2, 3);
      }
    }
  }
}

function paintPump(ctx: CanvasRenderingContext2D, t: number, enabled: boolean): void {
  ctx.fillStyle = '#193451';
  ctx.fillRect(298, 26, 16, 31);
  ctx.fillRect(292, 33, 8, 6);
  ctx.fillStyle = '#527a86';
  ctx.fillRect(300, 28, 11, 25);
  ctx.fillRect(287, 34, 8, 4);
  ctx.fillStyle = '#244a66';
  for (let y = 35; y < 51; y += 3) ctx.fillRect(302, y, 7, 1);
  ctx.fillStyle = enabled ? '#92eeae' : '#de927e';
  ctx.fillRect(305, 30, 3, 2);
  if (!enabled) return;
  for (let i = 0; i < 15; i++) {
    const age = (t * (14 + i % 5) + i * 9) % 44;
    const x = Math.round(291 - age * (0.9 + (i % 3) * 0.38));
    const y = Math.round(38 - age * 0.61 + Math.sin(t + i) * 3);
    if (y < 12) continue;
    ctx.fillStyle = i % 4 === 0 ? '#bbf3de' : '#72bcc6';
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
  }
}

export function paintAquarium(ctx: CanvasRenderingContext2D, t: number, pump: boolean, feeding: Feeding | null): void {
  const age = feeding ? t - feeding.at : -1;
  ctx.imageSmoothingEnabled = false;
  water.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, index * 20, TANK_WIDTH, 21);
  });
  for (let x = 0; x < TANK_WIDTH; x += 2) {
    const surface = waterline(x, t);
    ctx.fillStyle = '#397b8d';
    ctx.fillRect(x, 0, 2, surface);
    ctx.fillStyle = '#8de0ce';
    ctx.fillRect(x, surface, 2, 1);
  }
  ctx.fillStyle = '#88ead01e';
  for (const start of [22, 96, 172, 242]) {
    for (let y = 12; y < 124; y += 4) {
      ctx.fillRect(start + Math.round(y * 0.26 + Math.sin(t + start) * 4), y, Math.max(3, 20 - y / 7), 3);
    }
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = i % 7 === 0 ? '#72bac1' : '#57879d';
    ctx.fillRect(Math.floor((i * 53 + t * (pump ? 3 : 0.6)) % TANK_WIDTH), 12 + (i * 17) % 116, 1, 1);
  }
  for (let x = 0; x < TANK_WIDTH; x += 2) {
    const bed = 141 + Math.round(Math.sin(x * 0.05) * 3 + Math.cos(x * 0.12) * 2);
    ctx.fillStyle = '#806979';
    ctx.fillRect(x, bed, 2, TANK_HEIGHT - bed);
    ctx.fillStyle = '#c7a47e';
    ctx.fillRect(x, bed + 3, 2, TANK_HEIGHT - bed - 3);
  }
  for (let i = 0; i < 125; i++) {
    ctx.fillStyle = sand[i % sand.length] ?? '#b79270';
    ctx.fillRect((i * 73) % TANK_WIDTH, 148 + (i * 11) % 16, i % 3 + 1, 1);
  }
  plants(ctx, t);
  for (const { x, y, height, color, shade } of reef) {
    ctx.fillStyle = '#786779';
    ctx.fillRect(x - 13, y - 4, 28, 9);
    ctx.fillStyle = '#9a8191';
    ctx.fillRect(x - 9, y - 6, 18, 6);
    coral(ctx, x, y, height, color, shade);
  }
  stamp(ctx, clam, clamColors, 109, 141, 2);
  stamp(ctx, clam, clamColors, 277, 149);
  stamp(ctx, star, starColors, 71, 148, 2);
  stamp(ctx, star, starColors, 182, 151);
  const octopusBite = grainAt(octopusFood, age);
  const octopusBlend = feedBlend(octopusFood, age);
  stamp(ctx, octopus, octopusColors,
    mix(212 + Math.sin(t * 0.7) * 5, octopusBite.x - 10, octopusBlend),
    mix(132 + Math.sin(t * 1.6) * 2, octopusBite.y - 6, octopusBlend), 2);
  stamp(ctx, horse, horseColors, 259 + Math.sin(t * 0.9) * 7, 94 + Math.sin(t * 1.2) * 4, 2);
  for (const [index, swimmer] of school.entries()) {
    const { kind, speed, scale } = swimmer;
    let x = swimmerX(swimmer, t);
    let y = swimmer.y + Math.sin(t * 2 + index) * 4;
    let flip = speed > 0;
    const goal = feeding?.fish.get(index);
    if (goal) {
      const blend = feedBlend(goal.grain, age);
      const bite = grainAt(goal.grain, age);
      flip = blend > 0.12 ? goal.flip : flip;
      x = mix(x, bite.x - (goal.flip ? 14 : 1) * scale, blend);
      y = mix(y, bite.y - 4 * scale, blend);
    }
    const rows = fish[kind];
    const colors = fishColors[kind];
    if (rows && colors) stamp(ctx, rows, colors, x, y, scale, flip);
  }
  stamp(ctx, jelly, jellyColors, 94 + Math.sin(t * 0.5) * 13, 72 + Math.sin(t * 0.9) * 7, 2);
  stamp(ctx, jelly, jellyColors, 218 + Math.sin(t * 0.45) * 14, 35 + Math.sin(t * 0.8) * 8);

  const rayBite = grainAt(rayFood, age);
  const rayBlend = feedBlend(rayFood, age);
  const rayX = mix(132 + Math.sin(t * 0.32) * 92, rayBite.x - 26, rayBlend);
  const rayY = mix(88 + Math.cos(t * 0.56) * 12 + Math.sin(t * 3.4) * 3, rayBite.y - 13, rayBlend);
  ctx.fillStyle = '#588ac0';
  for (let i = 0; i < 13; i++) {
    ctx.fillRect(Math.round(rayX + 26 + Math.sin(t * 2 - i * 0.33) * i * 0.42), Math.round(rayY + 17 + i), 2, 2);
  }
  stamp(ctx, ray, rayColors, rayX, rayY, 2);
  paintFood(ctx, age);
  paintPump(ctx, t, pump);
}
