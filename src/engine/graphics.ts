// Ported from stranded's graphics.c. Everything is drawn on the canvas
// surface, then shown on a <canvas> element, which the page scales

import { assets } from './assets';
import { eventsWaitTick, ev } from './events';
import { BLACK, blit, KEY, Surface, type Rect } from './surface';
import { SCREEN_HEIGHT, SCREEN_WIDTH, MAX_TTM_THREADS, type TtmSlot, type TtmThread } from './types';
import { toS16 } from './utils';


export const gr = {
    dx: 0,
    dy: 0,
    updateDelay: 0,
    background: null as Surface | null,

    // On a widescreen display, the picture is widened rather than stretched:
    // the 640x480 scene is drawn in the middle of a wider canvas, with a
    // margin of marginX pixels on each side. For open ocean scenes, the
    // ocean and sky are extended into the margins; other scenes keep black
    // margins
    width: SCREEN_WIDTH,
    marginX: 0,
};

let canvas: Surface;
let element: HTMLCanvasElement;
let context: CanvasRenderingContext2D;
let imageData: ImageData;
let savedZonesLayer: Surface | null = null;
let wideScene = false;


// The canvas width for a display of this shape: wider than 640 if the
// display is wider than 4:3
export function grWidthFor(aspectW: number, aspectH: number) {
    const width = (SCREEN_HEIGHT * aspectW / aspectH) & ~1;

    // Beyond 638 pixels, there's not enough of the scene to mirror
    const marginX = width > SCREEN_WIDTH ? Math.min((width - SCREEN_WIDTH) / 2, SCREEN_WIDTH - 2) : 0;

    return SCREEN_WIDTH + 2 * marginX;
}


export function graphicsInit(canvasElement: HTMLCanvasElement, width: number) {
    element = canvasElement;
    context = element.getContext('2d', { alpha: false })!;
    grSetWidth(width);
}


// Only between scenes: layers in use keep the width they were made with
export function grSetWidth(width: number) {
    gr.width = width;
    gr.marginX = (width - SCREEN_WIDTH) / 2;

    canvas = new Surface(width, SCREEN_HEIGHT);
    element.width = width;
    element.height = SCREEN_HEIGHT;
    imageData = new ImageData(new Uint8ClampedArray(canvas.pixels.buffer as ArrayBuffer), width, SCREEN_HEIGHT);

    grPresent();
}


function grPresent() {
    context.putImageData(imageData, 0, 0);
}


function color(index: number) {
    return assets.palette[index & 0x0f];
}


function grDrawHorizontalLine(sfc: Surface, x1: number, x2: number, y: number, colorNo: number) {
    if (y < 0 || y >= sfc.h)
        return;

    x1 = Math.max(x1, 0);
    x2 = Math.min(x2, sfc.w - 1);

    for (let x = x1; x <= x2; x++)
        sfc.putPixel(x, y, color(colorNo));
}


export async function grUpdateDisplay(ttmThreads: TtmThread[], ttmHolidayThread: TtmThread | null) {
    const sfc = canvas;

    // Unless the scene is widened, only show its 640x480 part, with black
    // margins
    const srcRect: Rect | null = wideScene ? null : { x: gr.marginX, y: 0, w: SCREEN_WIDTH, h: SCREEN_HEIGHT };
    const destX = srcRect ? gr.marginX : 0;

    if (!wideScene && gr.marginX) {
        sfc.fillRect({ x: 0, y: 0, w: gr.marginX, h: SCREEN_HEIGHT }, BLACK);
        sfc.fillRect({ x: gr.marginX + SCREEN_WIDTH, y: 0, w: gr.marginX, h: SCREEN_HEIGHT }, BLACK);
    }

    // The background, the layer of saved zones, each thread's layer, and
    // finally the holiday layer
    if (gr.background)
        blit(gr.background, srcRect, sfc, destX, 0);

    if (savedZonesLayer)
        blit(savedZonesLayer, srcRect, sfc, destX, 0);

    for (let i = 0; i < MAX_TTM_THREADS; i++)
        if (ttmThreads[i].isRunning && ttmThreads[i].ttmLayer)
            blit(ttmThreads[i].ttmLayer!, srcRect, sfc, destX, 0);

    if (ttmHolidayThread?.isRunning && ttmHolidayThread.ttmLayer)
        blit(ttmHolidayThread.ttmLayer, srcRect, sfc, destX, 0);

    // Wait for the tick, and refresh the display
    await eventsWaitTick(gr.updateDelay);
    grPresent();
}


export function grNewLayer() {
    return new Surface(gr.width, SCREEN_HEIGHT, true, new Uint32Array(gr.width * SCREEN_HEIGHT).fill(KEY));
}


// In a widened scene, a zone reaching the edge of the 640x480 scene is
// extended to the edge of the widened one. Eg. the tanker's hull in
// GJVIS6.TTM, which is drawn as rectangles and fills the whole width of the
// scene once the prow is gone, would otherwise end in the middle of the ocean
function widenZone(x: number, width: number): [number, number] {
    // Zones already in the margins, eg. the fade outs' strips, are left as is
    if (!wideScene || x + width <= 0 || x >= SCREEN_WIDTH)
        return [x, width];

    if (x <= 0) {
        width += x + gr.marginX;
        x = -gr.marginX;
    }

    if (x + width >= SCREEN_WIDTH)
        width = SCREEN_WIDTH + gr.marginX - x;

    return [x, width];
}


export function grSetClipZone(sfc: Surface, x1: number, y1: number, x2: number, y2: number) {
    // In a widened scene, a zone reaching the edge of the 640x480 scene
    // reaches the edge of the widened one, so that sprites aren't cut off
    // in the middle of the ocean
    if (wideScene && x1 <= 0)
        x1 = -gr.marginX;
    if (wideScene && x2 >= SCREEN_WIDTH - 1)
        x2 = SCREEN_WIDTH + gr.marginX;

    x1 += gr.dx + gr.marginX; y1 += gr.dy;
    x2 += gr.dx + gr.marginX; y2 += gr.dy;

    sfc.setClip({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
}


export function grCopyZoneToBg(sfc: Surface, x: number, y: number, width: number, height: number) {
    [x, width] = widenZone(toS16(x), width);

    x = toS16(x + gr.dx + gr.marginX);
    y = toS16(y + gr.dy);

    // Without the +2, there would be a graphical glitch (2 unfilled pixels)
    // on the hull of the cargo, caused by an error in coordinates in
    // GJIVS6.TTM. The original rounds SAVE_IMAGE's boundaries one way or
    // another
    const rect = { x, y, w: width + 2, h: height };

    savedZonesLayer ??= grNewLayer();
    blit(sfc, rect, savedZonesLayer, x, y);
}


// In Johnny's TTMs, RESTORE_ZONE is never called while several zones are
// saved, so zones aren't really saved: restoring one clears them all
export function grRestoreZone() {
    savedZonesLayer = null;
}


export function grDrawPixel(sfc: Surface, x: number, y: number, colorNo: number) {
    sfc.putPixel(x + gr.dx + gr.marginX, y + gr.dy, color(colorNo));
}


export function grDrawLine(sfc: Surface, x1: number, y1: number, x2: number, y2: number, colorNo: number) {
    x1 += gr.dx + gr.marginX; y1 += gr.dy;
    x2 += gr.dx + gr.marginX; y2 += gr.dy;

    // Bresenham's line drawing algorithm, pixel-perfect
    let x = x1, y = y1;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const xinc = x2 > x1 ? 1 : -1;
    const yinc = y2 > y1 ? 1 : -1;
    const c = color(colorNo);

    if (dy < dx) {
        let cumul = (dx + 1) >> 1;
        for (let i = 0; i < dx; i++) {
            sfc.putPixel(x, y, c);
            x += xinc;
            cumul += dy;
            if (cumul > dx) {
                cumul -= dx;
                y += yinc;
            }
        }
    }
    else {
        let cumul = (dy + 1) >> 1;
        for (let i = 0; i < dy; i++) {
            sfc.putPixel(x, y, c);
            y += yinc;
            cumul += dx;
            if (cumul > dy) {
                cumul -= dy;
                x += xinc;
            }
        }
    }
}


export function grDrawRect(sfc: Surface, x: number, y: number, width: number, height: number, colorNo: number) {
    [x, width] = widenZone(x, width);

    sfc.fillRect({ x: x + gr.dx + gr.marginX, y: y + gr.dy, w: width, h: height }, color(colorNo));
}


export function grDrawCircle(sfc: Surface, x1: number, y1: number, width: number, height: number,
                             fgColor: number, bgColor: number) {
    x1 += gr.dx + gr.marginX; y1 += gr.dy;

    // Only regular circles, and in the original data, every width is even
    if (width !== height || width % 2) {
        console.warn('grDrawCircle(): unable to draw an ellipse or an odd diameter');
        return;
    }

    // Bresenham's circle drawing algorithm, pixel-perfect
    const r = (width >> 1) - 1;
    const xc = x1 + r;
    const yc = y1 + r;
    let x = 0, y = r, d = 1 - r;

    while (true) {
        grDrawHorizontalLine(sfc, xc - x, xc + x + 1, yc + y + 1, bgColor);
        grDrawHorizontalLine(sfc, xc - x, xc + x + 1, yc - y, bgColor);
        grDrawHorizontalLine(sfc, xc - y, xc + y + 1, yc + x + 1, bgColor);
        grDrawHorizontalLine(sfc, xc - y, xc + y + 1, yc - x, bgColor);

        if (y - x <= 1)
            break;

        if (d < 0)
            d += (x << 1) + 3;
        else {
            d += ((x - y) << 1) + 5;
            y--;
        }
        x++;
    }

    if (fgColor !== bgColor) {
        const c = color(fgColor);
        x = 0; y = r; d = 1 - r;

        while (true) {
            sfc.putPixel(xc - x, yc + y + 1, c);
            sfc.putPixel(xc + x + 1, yc + y + 1, c);
            sfc.putPixel(xc - x, yc - y, c);
            sfc.putPixel(xc + x + 1, yc - y, c);
            sfc.putPixel(xc - y, yc + x + 1, c);
            sfc.putPixel(xc + y + 1, yc + x + 1, c);
            sfc.putPixel(xc - y, yc - x, c);
            sfc.putPixel(xc + y + 1, yc - x, c);

            if (y - x <= 1)
                break;

            if (d < 0)
                d += (x << 1) + 3;
            else {
                d += ((x - y) << 1) + 5;
                y--;
            }
            x++;
        }
    }
}


function getSprite(ttmSlot: TtmSlot, spriteNo: number, imageNo: number) {
    if (imageNo >= ttmSlot.numSprites.length || spriteNo >= ttmSlot.numSprites[imageNo]) {
        console.warn(`grDrawSprite(): less than ${spriteNo + 1} sprites loaded in slot ${imageNo}`);
        return null;
    }
    return ttmSlot.sprites[imageNo][spriteNo];
}


export function grDrawSprite(sfc: Surface, ttmSlot: TtmSlot, x: number, y: number, spriteNo: number, imageNo: number) {
    const sprite = getSprite(ttmSlot, spriteNo, imageNo);
    if (sprite)
        blit(sprite, null, sfc, x + gr.dx + gr.marginX, y + gr.dy);
}


export function grDrawSpriteFlip(sfc: Surface, ttmSlot: TtmSlot, x: number, y: number, spriteNo: number, imageNo: number) {
    const sprite = getSprite(ttmSlot, spriteNo, imageNo);
    if (!sprite)
        return;

    x += gr.dx + gr.marginX + sprite.w - 1;
    y += gr.dy;

    for (let i = 0; i < sprite.w; i++)
        blit(sprite, { x: i, y: 0, w: 1, h: sprite.h }, sfc, x - i, y);
}


export function grClearScreen(sfc: Surface) {
    sfc.fill(KEY);
}


// The night has the moon and its reflection on the left of the scene, so
// mirroring an edge far enough would show a second moon. Its margins are
// filled from the part of the scene with only sky, stars and dark water
// instead, mirrored back and forth across it. The water is dithered in a
// checkerboard, so each margin column is taken from a column of the same
// parity as the one the plain mirroring would have used: otherwise two
// identical columns would meet, and show as a line
const NIGHT_MOONLESS_FROM = 280;
const NIGHT_MOONLESS_TO   = 636;

// The column of that part of the scene that x falls on, mirroring at its ends
function moonlessColumn(x: number) {
    const len = NIGHT_MOONLESS_TO - NIGHT_MOONLESS_FROM;
    const t = (((x - NIGHT_MOONLESS_FROM) % (2 * len)) + 2 * len) % (2 * len);
    return t <= len ? NIGHT_MOONLESS_FROM + t : NIGHT_MOONLESS_TO - (t - len);
}


export function grLoadScreen(name: string) {
    savedZonesLayer = null;

    const scr = assets.scr.get(name);
    if (!scr)
        throw new Error(`SCR resource ${name} not found`);

    const { width, height } = scr;
    const marginX = gr.marginX;
    const sfcWidth = width + 2 * marginX;
    const pixels = new Uint32Array(sfcWidth * height).fill(BLACK);

    for (let y = 0; y < height; y++)
        pixels.set(scr.pixels.subarray(y * width, (y + 1) * width), y * sfcWidth + marginX);

    // Only the open ocean scenes are extended: the others have something
    // other than ocean and sky on their edges (eg. a part of the island)
    wideScene = marginX > 0 && marginX < width && (name.startsWith('OCEAN') || name === 'NIGHT.SCR');

    // Extend the ocean and sky by mirroring the edges of the scene. Their
    // outermost columns have stray pixels, which would show as a line once
    // mirrored, so they're replaced first
    if (wideScene) {
        for (let y = 0; y < height; y++) {
            const left = y * sfcWidth + marginX;
            const right = left + width - 1;

            pixels[left] = pixels[left + 2];
            pixels[right] = pixels[right - 2];

            if (name === 'NIGHT.SCR') {
                for (let k = 1; k <= marginX; k++) {
                    // Instead of columns k and width - 1 - k
                    pixels[left - k] = pixels[left + moonlessColumn(NIGHT_MOONLESS_FROM + k)];
                    pixels[right + k] = pixels[left + moonlessColumn(NIGHT_MOONLESS_TO + 1 - k)];
                }
            }
            else {
                for (let k = 1; k <= marginX; k++) {
                    pixels[left - k] = pixels[left + k];
                    pixels[right + k] = pixels[right - k];
                }
            }
        }
    }

    gr.background = new Surface(sfcWidth, height, false, pixels);
}


export function grInitEmptyBackground() {
    savedZonesLayer = null;
    gr.background = new Surface(gr.width, SCREEN_HEIGHT, false,
                                new Uint32Array(gr.width * SCREEN_HEIGHT).fill(BLACK));
    wideScene = false;
}


export function grReleaseBmp(ttmSlot: TtmSlot, slotNo: number) {
    ttmSlot.numSprites[slotNo] = 0;
    ttmSlot.sprites[slotNo] = [];
}


// The sprites are only ever drawn from, so they're shared between slots
export function grLoadBmp(ttmSlot: TtmSlot, slotNo: number, name: string) {
    const sprites = assets.bmp.get(name);
    if (!sprites)
        throw new Error(`BMP resource ${name} not found`);

    ttmSlot.sprites[slotNo] = sprites;
    ttmSlot.numSprites[slotNo] = sprites.length;
}


let fadeOutType = 0;

export async function grFadeOut() {
    const sfc = canvas;
    const tmpSfc = grNewLayer();

    // In a widened scene, the margins are faded out too
    const margin = wideScene ? gr.marginX : 0;

    gr.dx = gr.dy = 0;

    const frame = async () => {
        await eventsWaitTick(1);
        grPresent();
    };

    switch (fadeOutType) {

        // Circle from center
        case 0:
            for (let radius = 20; radius <= 400 + margin; radius += 20) {
                grDrawCircle(tmpSfc, 320 - radius, 240 - radius, radius << 1, radius << 1, 5, 5);
                blit(tmpSfc, null, sfc, 0, 0);
                await frame();
            }
            break;

        // Rectangle from center
        case 1:
            for (let i = 1; i <= 20 + Math.trunc((margin + 15) / 16); i++) {
                grDrawRect(sfc, 320 - i * 16, 240 - i * 12, i * 32, i * 24, 5);
                await frame();
            }
            break;

        // Right to left
        case 2:
            for (let i = 600 + Math.trunc((margin + 39) / 40) * 40; i >= -margin; i -= 40) {
                grDrawRect(sfc, i, 0, 40, 480, 5);
                await frame();
            }
            break;

        // Left to right
        case 3:
            for (let i = -Math.trunc((margin + 39) / 40) * 40; i < 640 + margin; i += 40) {
                grDrawRect(sfc, i, 0, 40, 480, 5);
                await frame();
            }
            break;

        // Middle to left and right
        case 4:
            for (let i = 0; i < 320 + margin; i += 20) {
                grDrawRect(sfc, 320 + i, 0, 20, 480, 5);
                grDrawRect(sfc, 300 - i, 0, 20, 480, 5);
                await frame();
            }
            break;
    }

    // A next scene requested during the fade out is the one that follows it
    ev.skipScene = false;

    fadeOutType = (fadeOutType + 1) % 5;
}
