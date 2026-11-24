import { FOOSBALL, FOOSBALL_RODS, foosballKicking, type FoosballState, type PongSide } from '@pixelwork/shared';

export function paintFoosball(
  ctx: CanvasRenderingContext2D,
  side: PongSide,
  positions: Pick<FoosballState, 'rods' | 'kickAt'> | undefined,
  ball: FoosballState['ball'] | undefined,
  serverNow: number,
): void {
  const { WIDTH, HEIGHT, INSET, GOAL_TOP, GOAL_BOTTOM, BALL_RADIUS } = FOOSBALL;
  const goalHeight = GOAL_BOTTOM - GOAL_TOP;
  ctx.fillStyle = '#754a4d';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#239063';
  ctx.fillRect(INSET, INSET, WIDTH - INSET * 2, HEIGHT - INSET * 2);
  ctx.fillStyle = '#26734d';
  for (let stripe = 0; stripe < 6; stripe += 2) ctx.fillRect(INSET + stripe * 25, INSET, 25, HEIGHT - INSET * 2);

  ctx.strokeStyle = '#adf2ad';
  ctx.lineWidth = 1;
  ctx.strokeRect(INSET + 2.5, INSET + 2.5, WIDTH - INSET * 2 - 5, HEIGHT - INSET * 2 - 5);
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 + 0.5, INSET + 2);
  ctx.lineTo(WIDTH / 2 + 0.5, HEIGHT - INSET - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(WIDTH / 2, HEIGHT / 2, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(INSET + 2.5, GOAL_TOP - 6.5, 15, goalHeight + 13);
  ctx.strokeRect(WIDTH - INSET - 17.5, GOAL_TOP - 6.5, 15, goalHeight + 13);

  ctx.fillStyle = '#2e222f';
  ctx.fillRect(0, GOAL_TOP, INSET + 3, goalHeight);
  ctx.fillRect(WIDTH - INSET - 3, GOAL_TOP, INSET + 3, goalHeight);
  ctx.fillStyle = '#e6cba5';
  for (const x of [0, WIDTH - INSET - 3]) {
    ctx.fillRect(x, GOAL_TOP - 1, INSET + 3, 1);
    ctx.fillRect(x, GOAL_BOTTOM, INSET + 3, 1);
  }

  for (const rod of FOOSBALL_RODS) {
    const center = positions?.rods[rod.side] ?? HEIGHT / 2;
    const kicking = foosballKicking(positions?.kickAt[rod.side] ?? null, serverNow);
    const kickDirection = rod.side === 'left' ? 1 : -1;
    const mine = rod.side === side;
    const gripY = mine ? HEIGHT - 4 : 1;
    ctx.fillStyle = '#5a6988';
    ctx.fillRect(rod.x - 1, 0, 3, HEIGHT);
    ctx.fillStyle = '#b9b5b8';
    ctx.fillRect(rod.x, 0, 1, HEIGHT);
    ctx.fillStyle = mine ? '#4d65b4' : '#ab5130';
    ctx.fillRect(rod.x - 3, gripY, 7, 3);

    for (const offset of rod.offsets) {
      const y = Math.round(center + offset);
      const x = rod.x + (kicking ? kickDirection * 3 : 0);
      ctx.fillStyle = '#2e222f';
      ctx.fillRect(x - 3, y - 4, 7, 8);
      ctx.fillStyle = mine ? '#4d9be6' : '#e86a73';
      ctx.fillRect(x - 2, y - 3, 5, 6);
      ctx.fillStyle = mine ? '#a4ddfa' : '#f6aeb5';
      ctx.fillRect(x - 1, y - 2, 2, 2);
    }
  }

  const x = Math.round(ball?.x ?? WIDTH / 2);
  const y = Math.round(ball?.y ?? HEIGHT / 2);
  ctx.fillStyle = '#2e222f';
  ctx.fillRect(x - BALL_RADIUS - 1, y - BALL_RADIUS - 1, BALL_RADIUS * 2 + 2, BALL_RADIUS * 2 + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - BALL_RADIUS, y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
}
