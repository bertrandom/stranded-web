// The game's data, as made by scripts/extract.ts: the scripts in a manifest,
// and the pictures as 4-bit PNGs, decoded here to get their exact pixels

import { rgb, Surface } from './surface';

interface Manifest {
    palette: [number, number, number][];
    transparentIndex: number;
    ads: Record<string, { res: [number, string][]; tags: [number, string][]; data: string }>;
    ttm: Record<string, { numTags: number; data: string }>;
    bmp: Record<string, { file: string; frames: [number, number, number, number][] }>;
    scr: Record<string, { file: string; width: number; height: number }>;
    sounds: Record<string, string>;
}

export interface AdsResource {
    res: { id: number; name: string }[];
    tags: { id: number; description: string }[];
    data: Uint8Array;
}

export interface TtmResource {
    numTags: number;
    data: Uint8Array;
}

export interface ScrResource {
    width: number;
    height: number;
    pixels: Uint32Array;
}

export const assets = {
    ads: new Map<string, AdsResource>(),
    ttm: new Map<string, TtmResource>(),
    bmp: new Map<string, Surface[]>(),
    scr: new Map<string, ScrResource>(),
    sounds: new Map<number, ArrayBuffer>(),
    palette: [] as number[],
};


function fromBase64(s: string) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}


async function inflate(data: BlobPart) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}


// Decode an indexed PNG to palette indices, one per byte. Only what
// extract.ts writes: 4 or 8 bits per pixel, not interlaced
async function decodeIndexedPng(buf: ArrayBuffer) {
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);
    const idat: Uint8Array[] = [];
    let width = 0, height = 0, depth = 0;

    for (let pos = 8; pos < bytes.length; ) {
        const len = view.getUint32(pos);
        const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
        const data = bytes.subarray(pos + 8, pos + 8 + len);

        if (type === 'IHDR') {
            width = view.getUint32(pos + 8);
            height = view.getUint32(pos + 12);
            depth = data[8];
            if (data[9] !== 3 || (depth !== 4 && depth !== 8) || data[12] !== 0)
                throw new Error('unsupported PNG');
        }
        else if (type === 'IDAT') {
            idat.push(data);
        }

        pos += len + 12;
    }

    const raw = await inflate(new Uint8Array(await new Blob(idat as BlobPart[]).arrayBuffer()));
    const rowBytes = Math.ceil(width * depth / 8);
    const prev = new Uint8Array(rowBytes);
    const row = new Uint8Array(rowBytes);
    const out = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        const start = y * (rowBytes + 1);
        const filter = raw[start];

        for (let i = 0; i < rowBytes; i++) {
            const x = raw[start + 1 + i];
            const a = i > 0 ? row[i - 1] : 0;
            const b = prev[i];
            const c = i > 0 ? prev[i - 1] : 0;

            switch (filter) {
                case 0: row[i] = x; break;
                case 1: row[i] = x + a; break;
                case 2: row[i] = x + b; break;
                case 3: row[i] = x + ((a + b) >> 1); break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    row[i] = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
                    break;
                }
            }
        }

        for (let x = 0; x < width; x++)
            out[y * width + x] = depth === 8 ? row[x]
                                 : (x & 1 ? row[x >> 1] & 0x0f : row[x >> 1] >> 4);

        prev.set(row);
    }

    return { width, height, indices: out };
}


export async function loadAssets(baseUrl: string) {
    const get = async (path: string) => {
        const response = await fetch(new URL(path, baseUrl));
        if (!response.ok)
            throw new Error(`${path}: ${response.status} ${response.statusText}`);
        return response;
    };

    const manifest: Manifest = await (await get('manifest.json')).json();

    assets.palette = manifest.palette.map(([r, g, b]) => rgb(r, g, b));

    for (const [name, ads] of Object.entries(manifest.ads))
        assets.ads.set(name, {
            res: ads.res.map(([id, resName]) => ({ id, name: resName })),
            tags: ads.tags.map(([id, description]) => ({ id, description })),
            data: fromBase64(ads.data),
        });

    for (const [name, ttm] of Object.entries(manifest.ttm))
        assets.ttm.set(name, { numTags: ttm.numTags, data: fromBase64(ttm.data) });

    const toColors = (indices: Uint8Array) => {
        const pixels = new Uint32Array(indices.length);
        for (let i = 0; i < indices.length; i++)
            pixels[i] = assets.palette[indices[i]];
        return pixels;
    };

    await Promise.all([
        ...Object.entries(manifest.scr).map(async ([name, scr]) => {
            const png = await decodeIndexedPng(await (await get(scr.file)).arrayBuffer());
            assets.scr.set(name, { width: png.width, height: png.height, pixels: toColors(png.indices) });
        }),

        ...Object.entries(manifest.bmp).map(async ([name, bmp]) => {
            const png = await decodeIndexedPng(await (await get(bmp.file)).arrayBuffer());
            const sheet = toColors(png.indices);

            assets.bmp.set(name, bmp.frames.map(([fx, fy, w, h]) => {
                const pixels = new Uint32Array(w * h);
                for (let y = 0; y < h; y++)
                    pixels.set(sheet.subarray((fy + y) * png.width + fx, (fy + y) * png.width + fx + w), y * w);
                return new Surface(w, h, true, pixels);
            }));
        }),

        ...Object.entries(manifest.sounds).map(async ([no, file]) => {
            assets.sounds.set(Number(no), await (await get(file)).arrayBuffer());
        }),
    ]);
}
