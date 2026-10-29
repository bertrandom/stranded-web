// A software surface, behaving like the SDL surfaces stranded draws on:
// 32-bit pixels, a clip rectangle, and an optional color key. Pixels are in
// ImageData's byte order (0xAABBGGRR on little-endian machines), always
// opaque, so a surface can be shown as is

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function rgb(r: number, g: number, b: number) {
    return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// The color key: pixels of this color aren't copied by a blit from a
// surface which has the color key set
export const KEY = rgb(0xa8, 0x00, 0xa8);
export const BLACK = rgb(0, 0, 0);


export class Surface {
    readonly pixels: Uint32Array;
    clip: Rect;

    constructor(readonly w: number, readonly h: number,
                readonly colorKey = false, pixels?: Uint32Array) {
        this.pixels = pixels ?? new Uint32Array(w * h).fill(0xff000000);
        this.clip = { x: 0, y: 0, w, h };
    }

    // As SDL_SetClipRect(): the rectangle, within the surface, or all of it
    setClip(rect: Rect | null) {
        this.clip = rect ? intersect(rect, { x: 0, y: 0, w: this.w, h: this.h })
                         : { x: 0, y: 0, w: this.w, h: this.h };
    }

    // As SDL_FillRect(): within the clip rectangle
    fillRect(rect: Rect | null, color: number) {
        const r = rect ? intersect(rect, this.clip) : this.clip;

        if (r.w <= 0 || r.h <= 0)
            return;

        for (let y = r.y; y < r.y + r.h; y++)
            this.pixels.fill(color, y * this.w + r.x, y * this.w + r.x + r.w);
    }

    // Unlike fillRect(), not limited by the clip rectangle
    fill(color: number) {
        this.pixels.fill(color);
    }

    // Outside of the surface, nothing is drawn. Not limited by the clip
    // rectangle
    putPixel(x: number, y: number, color: number) {
        if (x >= 0 && y >= 0 && x < this.w && y < this.h)
            this.pixels[y * this.w + x] = color;
    }
}


function intersect(a: Rect, b: Rect): Rect {
    if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0)
        return { x: 0, y: 0, w: 0, h: 0 };

    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);

    return {
        x, y,
        w: Math.min(a.x + a.w, b.x + b.w) - x,
        h: Math.min(a.y + a.h, b.y + b.h) - y,
    };
}


// As SDL_BlitSurface(): copy srcRect (or all) of src to dst at (dx, dy),
// within dst's clip rectangle
export function blit(src: Surface, srcRect: Rect | null, dst: Surface, dx: number, dy: number) {
    let sx = 0, sy = 0, w = src.w, h = src.h;

    if (srcRect) {
        ({ x: sx, y: sy, w, h } = srcRect);

        if (sx < 0) {
            w += sx;
            dx -= sx;
            sx = 0;
        }
        w = Math.min(w, src.w - sx);

        if (sy < 0) {
            h += sy;
            dy -= sy;
            sy = 0;
        }
        h = Math.min(h, src.h - sy);
    }

    const clip = dst.clip;

    const cx1 = clip.x - dx;
    if (cx1 > 0) {
        w -= cx1;
        dx += cx1;
        sx += cx1;
    }
    w = Math.min(w, clip.x + clip.w - dx);

    const cy1 = clip.y - dy;
    if (cy1 > 0) {
        h -= cy1;
        dy += cy1;
        sy += cy1;
    }
    h = Math.min(h, clip.y + clip.h - dy);

    if (w <= 0 || h <= 0)
        return;

    const sp = src.pixels, dp = dst.pixels;

    for (let y = 0; y < h; y++) {
        const s = (sy + y) * src.w + sx;
        const d = (dy + y) * dst.w + dx;

        if (src.colorKey) {
            for (let x = 0; x < w; x++) {
                const p = sp[s + x];
                if (p !== KEY)
                    dp[d + x] = p;
            }
        }
        else {
            dp.set(sp.subarray(s, s + w), d);
        }
    }
}
