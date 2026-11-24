import type { ColorName } from '../lib/colors.ts';
import { Canvas } from '../lib/draw.ts';
import type { Pixels } from '../lib/pixels.ts';

function tile(paint: (canvas: Canvas) => void): Pixels {
  const canvas = new Canvas(16, 16);
  paint(canvas);
  return canvas.toPixels();
}

export const christmasTree = tile((canvas) => {
  canvas.rect(6, 11, 4, 4, 'bark').hline(7, 13, 2, 'clay');
  canvas.hline(7, 3, 2, 'pine').hline(6, 4, 4, 'green').hline(5, 5, 6, 'pine');
  canvas.rect(5, 6, 6, 2, 'green').hline(4, 8, 8, 'green').hline(3, 10, 10, 'pine');
  canvas.hline(4, 9, 8, 'fern').hline(6, 6, 4, 'emerald');
  canvas.px(7, 2, 'gold').px(7, 1, 'lemon').px(6, 6, 'pink').px(9, 7, 'gold').px(6, 9, 'cream');
});

export const christmasGift = tile((canvas) => {
  canvas.box(3, 7, 10, 7, { outline: 'maroon', dark: 'crimson', base: 'red', light: 'salmon' }).outline('maroon');
  canvas.vline(7, 7, 6, 'gold').vline(8, 7, 6, 'amber').hline(4, 9, 8, 'cream');
  canvas.hline(5, 6, 6, 'gold').px(5, 5, 'lemon').px(10, 5, 'honey');
});

export const christmasWreath = tile((canvas) => {
  canvas.rect(3, 5, 10, 6, 'pine').rect(5, 3, 6, 10, 'pine');
  canvas.hline(5, 4, 6, 'leaf').vline(4, 6, 4, 'green').vline(11, 6, 4, 'emerald');
  canvas.rect(6, 6, 4, 4, 'violet').rect(6, 6, 4, 3, 'grape');
  canvas.px(5, 5, 'salmon').px(10, 5, 'red').px(11, 10, 'gold').hline(6, 11, 4, 'red');
  canvas.px(6, 12, 'crimson').px(9, 12, 'crimson');
});

export const christmasGiftStack = tile((canvas) => {
  canvas.box(2, 9, 12, 6, { outline: 'wine', dark: 'rust', base: 'coral', light: 'peach' }).outline('wine');
  canvas.vline(8, 9, 5, 'cream').hline(3, 10, 10, 'gold');
  canvas.box(4, 5, 8, 5, { outline: 'pine', dark: 'green', base: 'emerald', light: 'leaf' }).outline('pine');
  canvas.vline(7, 5, 4, 'gold').hline(6, 4, 4, 'cream');
});

export const christmasCandyCane = tile((canvas) => {
  canvas.hline(5, 4, 5, 'wine').vline(4, 5, 4, 'wine').vline(10, 5, 9, 'wine');
  canvas.hline(5, 5, 5, 'cream').vline(5, 6, 3, 'white').vline(9, 6, 8, 'cream');
  canvas.px(6, 5, 'red').px(9, 7, 'red').px(9, 10, 'red').px(9, 13, 'crimson');
  canvas.hline(6, 14, 6, 'rosewood').px(7, 9, 'gold').px(8, 10, 'honey');
});

function stringLights(lights: readonly [ColorName, ColorName, ColorName, ColorName]): Pixels {
  return tile((canvas) => {
    canvas.hline(1, 4, 3, 'pine').hline(4, 5, 8, 'pine').hline(12, 4, 3, 'pine');
    canvas.vline(2, 5, 2, lights[0]).vline(5, 6, 2, lights[1]);
    canvas.vline(9, 6, 2, lights[2]).vline(13, 5, 2, lights[3]);
    canvas.px(2, 5, 'lemon').px(5, 6, 'cream').px(9, 6, 'white').px(13, 5, 'cream');
  });
}

export const christmasStringLights = stringLights(['gold', 'salmon', 'mint', 'lavender']);
export const grinchStringLights = stringLights(['lime', 'red', 'leaf', 'gold']);

export const grinchMax = tile((canvas) => {
  canvas.hline(4, 13, 9, 'bark').rect(7, 8, 6, 5, 'rust').rect(8, 8, 4, 4, 'tan');
  canvas.px(13, 8, 'bark').px(13, 7, 'clay').vline(11, 11, 3, 'bark');
  canvas.rect(3, 6, 5, 6, 'bark').rect(4, 7, 4, 4, 'tan').vline(7, 8, 3, 'maroon');
  canvas.hline(2, 9, 3, 'honey').px(3, 9, 'ink').px(5, 8, 'ink').vline(6, 10, 2, 'red');
  canvas.vline(5, 2, 4, 'bark').px(4, 3, 'bark').px(6, 1, 'honey');
  canvas.px(6, 6, 'red').px(7, 5, 'salmon').px(4, 6, 'crimson');
});

export const grinchSnowGlobe = tile((canvas) => {
  canvas.hline(5, 13, 6, 'wine').hline(4, 12, 8, 'crimson').hline(5, 14, 6, 'maroon');
  canvas.hline(6, 4, 4, 'deepteal').rect(4, 6, 8, 6, 'deepteal').hline(5, 5, 6, 'deepteal');
  canvas.rect(5, 6, 6, 5, 'ice').hline(6, 6, 4, 'white').hline(6, 10, 4, 'mist');
  canvas.px(7, 7, 'pine').hline(6, 8, 3, 'green').hline(6, 9, 4, 'leaf').px(9, 7, 'white');
});

export const grinchMiniature = tile((canvas) => {
  canvas.hline(4, 14, 8, 'grape').rect(5, 11, 6, 3, 'crimson').hline(6, 11, 4, 'cream');
  canvas.hline(4, 5, 8, 'pine').rect(3, 6, 10, 4, 'pine').hline(5, 10, 6, 'pine');
  canvas.rect(4, 6, 8, 3, 'leaf').hline(5, 9, 6, 'emerald').px(7, 4, 'green').px(8, 3, 'pine');
  canvas.px(5, 7, 'ink').px(10, 7, 'ink').px(8, 8, 'lime').hline(7, 9, 3, 'pine');
});

export const grinchCrookedTree = tile((canvas) => {
  canvas.box(5, 11, 7, 4, { outline: 'maroon', dark: 'rust', base: 'clay', light: 'coral' }).outline('maroon');
  canvas.vline(8, 6, 7, 'bark').hline(6, 5, 4, 'pine').hline(4, 4, 4, 'pine');
  canvas.hline(4, 3, 2, 'leaf').hline(3, 4, 2, 'leaf').hline(6, 6, 5, 'green').hline(5, 7, 6, 'pine');
  canvas.hline(4, 9, 7, 'pine').hline(5, 8, 5, 'leaf').px(6, 6, 'sprout');
  canvas.vline(4, 5, 2, 'gold').px(4, 7, 'red').px(4, 8, 'crimson');
});

export const grinchHeart = tile((canvas) => {
  canvas.box(3, 3, 10, 10, { outline: 'grape', dark: 'violet', base: 'purple', light: 'lavender' }).outline('grape');
  canvas.rect(4, 4, 8, 8, 'cream').hline(5, 5, 2, 'crimson').hline(9, 5, 2, 'crimson');
  canvas.hline(5, 6, 6, 'red').hline(5, 7, 6, 'coral').hline(6, 8, 4, 'red').hline(7, 9, 2, 'crimson').px(7, 10, 'crimson');
  canvas.px(5, 6, 'peach').px(4, 10, 'gold').px(11, 5, 'gold');
});

export const grinchGiftSack = tile((canvas) => {
  canvas.hline(6, 4, 4, 'bark').rect(4, 8, 9, 6, 'bark').hline(5, 14, 7, 'bark');
  canvas.rect(5, 8, 7, 5, 'clay').hline(6, 13, 5, 'tan').vline(6, 9, 3, 'honey');
  canvas.rect(6, 5, 4, 3, 'tan').hline(5, 7, 6, 'gold').px(11, 8, 'honey');
  canvas.rect(8, 2, 4, 4, 'crimson').hline(9, 2, 3, 'red').vline(10, 2, 4, 'cream');
  canvas.px(8, 10, 'rust').px(11, 12, 'rust');
});

export const newYearStar = tile((canvas) => {
  canvas.hline(5, 13, 6, 'bark').vline(8, 8, 6, 'amber');
  canvas.vline(8, 3, 7, 'gold').hline(4, 6, 9, 'gold');
  canvas.hline(6, 5, 5, 'honey').hline(6, 7, 5, 'amber').px(6, 9, 'amber').px(10, 9, 'amber');
  canvas.px(8, 6, 'lemon').px(7, 5, 'white').px(12, 3, 'cream').px(3, 9, 'lavender');
});

export const newYearPopper = tile((canvas) => {
  canvas.hline(6, 8, 5, 'grape').hline(5, 9, 5, 'violet').hline(4, 10, 5, 'purple');
  canvas.hline(4, 11, 4, 'lavender').hline(3, 12, 4, 'violet').hline(3, 13, 2, 'grape');
  canvas.px(6, 9, 'gold').px(5, 11, 'gold').px(10, 6, 'lemon').px(12, 4, 'lavender');
  canvas.px(7, 4, 'mint').px(9, 2, 'pink').hline(11, 7, 2, 'gold').px(13, 6, 'honey');
});

export const newYearClock = tile((canvas) => {
  canvas.rect(3, 4, 10, 8, 'grape').hline(5, 3, 6, 'grape').hline(5, 12, 6, 'grape');
  canvas.rect(4, 5, 8, 6, 'gold').hline(5, 4, 6, 'lemon').rect(5, 5, 6, 6, 'cream');
  canvas.vline(8, 5, 4, 'ink').hline(6, 7, 2, 'dusk').px(8, 8, 'crimson');
  canvas.px(2, 3, 'gold').px(13, 10, 'lavender');
});

export const newYearBalloons = tile((canvas) => {
  canvas.vline(7, 7, 6, 'mauve').vline(9, 9, 4, 'dusk').px(8, 13, 'grape');
  canvas.rect(3, 4, 6, 5, 'rust').rect(4, 3, 4, 6, 'gold').hline(5, 4, 2, 'lemon');
  canvas.rect(8, 5, 5, 5, 'violet').rect(9, 4, 3, 7, 'purple').px(9, 5, 'lilac');
  canvas.hline(6, 14, 5, 'grape').px(8, 14, 'gold');
});
