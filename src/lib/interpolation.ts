import * as flubberModule from 'flubber';
const flubberInterpolate: (a: string, b: string, opts?: { maxSegmentLength?: number }) => (t: number) => string =
    (flubberModule as any).default?.interpolate ?? (flubberModule as any).interpolate;

/**
 * Extract the `d` attribute value from a stored `<path d="..."/>` string.
 * If the input is already raw path data (no wrapping tag), return as-is.
 */
function extractD(svgStr: string): string
{
    const match = svgStr.match(/d="([^"]+)"/);
    return match ? match[1] : svgStr;
}

/**
 * Interpolate between two SVG path strings at parameter t (0..1).
 * Returns an SVG path data string (the `d` attribute value).
 */
export function interpolatePaths(pathA: string, pathB: string, t: number): string
{
    const dA = extractD(pathA);
    const dB = extractD(pathB);
    const interpolator = flubberInterpolate(dA, dB, { maxSegmentLength: 20 });
    return interpolator(Math.max(0, Math.min(1, t)));
}

/**
 * Wrap raw path data into the stored `<path d="..."/>` format.
 */
export function wrapPathData(d: string): string
{
    return `<path d="${d}"/>`;
}
