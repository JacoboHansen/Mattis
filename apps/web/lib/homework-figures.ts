import sharp from 'sharp';

export type HomeworkFigureCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HomeworkFigureSpec = {
  kind: string;
  altNb: string;
  crop?: HomeworkFigureCrop;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalized(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeCrop(value: unknown): HomeworkFigureCrop | undefined {
  if (!isRecord(value)) return undefined;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const width = finiteNumber(value.width);
  const height = finiteNumber(value.height);
  if (x === null || y === null || width === null || height === null)
    return undefined;
  if (width <= 0 || height <= 0) return undefined;

  const left = clamp(x, 0, 1);
  const top = clamp(y, 0, 1);
  const right = clamp(x + width, 0, 1);
  const bottom = clamp(y + height, 0, 1);
  if (right - left < 0.015 || bottom - top < 0.015) return undefined;

  return {
    x: normalized(left),
    y: normalized(top),
    width: normalized(right - left),
    height: normalized(bottom - top),
  };
}

export function normalizeHomeworkFigureSpec(
  value: unknown,
): HomeworkFigureSpec | null {
  if (!isRecord(value)) return null;
  const crop = normalizeCrop(value.crop ?? value.boundingBox ?? value.bbox);
  const rawKind = value.kind;
  const rawAlt = value.altNb ?? value.alt_nb;
  const hasFigureDescriptor = Boolean(
    crop ||
      (typeof rawKind === 'string' && rawKind.trim()) ||
      (typeof rawAlt === 'string' && rawAlt.trim()),
  );
  const kind =
    typeof rawKind === 'string' && rawKind.trim()
      ? rawKind.trim().slice(0, 80)
      : hasFigureDescriptor
        ? 'illustration'
        : '';
  const altNb =
    typeof rawAlt === 'string' && rawAlt.trim()
      ? rawAlt.trim().slice(0, 240)
      : hasFigureDescriptor
        ? 'Illustrasjon fra leksebildet'
        : '';
  if (!kind || !altNb) return null;

  return {
    kind,
    altNb,
    ...(crop ? { crop } : {}),
  };
}

export function homeworkFigureCrop(value: unknown): HomeworkFigureCrop | null {
  return normalizeHomeworkFigureSpec(value)?.crop ?? null;
}

export function homeworkFigureAltText(value: unknown): string | null {
  return normalizeHomeworkFigureSpec(value)?.altNb ?? null;
}

export async function cropHomeworkFigure(
  bytes: Uint8Array,
  crop: HomeworkFigureCrop,
): Promise<Uint8Array> {
  // Normalize EXIF orientation before applying model coordinates. Phone photos
  // otherwise have a different visual orientation than their raw pixel data.
  const oriented = await sharp(Buffer.from(bytes)).rotate().toBuffer();
  const metadata = await sharp(oriented).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;
  if (!imageWidth || !imageHeight)
    throw new Error('Leksebildet mangler dimensjoner.');

  const left = Math.max(
    0,
    Math.min(imageWidth - 1, Math.round(crop.x * imageWidth)),
  );
  const top = Math.max(
    0,
    Math.min(imageHeight - 1, Math.round(crop.y * imageHeight)),
  );
  const right = Math.max(
    left + 1,
    Math.min(imageWidth, Math.round((crop.x + crop.width) * imageWidth)),
  );
  const bottom = Math.max(
    top + 1,
    Math.min(imageHeight, Math.round((crop.y + crop.height) * imageHeight)),
  );

  // A little context keeps labels and nearby arrows from being cut off when
  // the model's box is tight around the visible drawing.
  const paddingX = Math.max(8, Math.round((right - left) * 0.04));
  const paddingY = Math.max(8, Math.round((bottom - top) * 0.04));
  const paddedLeft = Math.max(0, left - paddingX);
  const paddedTop = Math.max(0, top - paddingY);
  const paddedRight = Math.min(imageWidth, right + paddingX);
  const paddedBottom = Math.min(imageHeight, bottom + paddingY);

  return new Uint8Array(
    await sharp(oriented)
      .extract({
        left: paddedLeft,
        top: paddedTop,
        width: paddedRight - paddedLeft,
        height: paddedBottom - paddedTop,
      })
      .resize({
        width: 1600,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 86, progressive: true })
      .toBuffer(),
  );
}
