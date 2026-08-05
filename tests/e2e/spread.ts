import { createCanvas, loadImage } from '@napi-rs/canvas';

export async function inkSpread(png: Buffer): Promise<number> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);

  const br = data[0]!;
  const bg = data[1]!;
  const bb = data[2]!;

  let left = width;
  let right = -1;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const delta =
        Math.abs(data[i]! - br) + Math.abs(data[i + 1]! - bg) + Math.abs(data[i + 2]! - bb);
      if (delta < 36) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  return right < left ? 0 : (right - left) / width;
}
