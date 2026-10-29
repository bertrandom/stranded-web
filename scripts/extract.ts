// Converts the original game's data files (RESOURCE.MAP, RESOURCE.001 and
// the sounds) into what the web engine loads:
//
//   manifest.json   the palette, and the ADS and TTM scripts, uncompressed
//   scr/*.png       the backgrounds
//   bmp/*.png       the sprites, one sheet per BMP, with each frame's
//                   position listed in the manifest
//   sounds/*.wav    the sounds, as they are
//
// The PNGs are 4-bit, using the game's 16-color palette, so they hold the
// original pixels exactly. Ported from stranded's resource.c and uncompress.c
//
//   npm run extract -- <directory with RESOURCE.MAP> [output directory]

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

// The color that sprites and layers treat as transparent
const KEY_RGB = [0xa8, 0x00, 0xa8];

const NUM_SOUNDS = 25;


class Reader {
    pos = 0;

    constructor(public buf: Buffer) {}

    u8() {
        return this.buf[this.pos++];
    }

    u16() {
        const v = this.buf.readUInt16LE(this.pos);
        this.pos += 2;
        return v;
    }

    u32() {
        const v = this.buf.readUInt32LE(this.pos);
        this.pos += 4;
        return v;
    }

    block(len: number) {
        const v = this.buf.subarray(this.pos, this.pos + len);
        this.pos += len;
        return v;
    }

    // Up to maxLen bytes, stopping after a NUL
    string(maxLen: number) {
        let s = '';
        for (let i = 0; i < maxLen; i++) {
            const c = this.u8();
            if (c === 0)
                break;
            s += String.fromCharCode(c);
        }
        return s;
    }

    expect(tag: string, what: string) {
        const found = this.block(4).toString('latin1');
        if (found !== tag)
            throw new Error(`'${tag}' not found while parsing ${what} resource`);
    }

    // The compressed data, which follows its method and uncompressed size
    compressed() {
        const compressedSize = this.u32() - 5;
        const method = this.u8();
        const uncompressedSize = this.u32();
        const start = this.pos;
        this.pos += compressedSize;
        return uncompress(this.buf.subarray(start, start + compressedSize), method, uncompressedSize);
    }
}


function uncompressRLE(src: Uint8Array, outSize: number) {
    const out = new Uint8Array(outSize);
    let inOffset = 0;
    let outOffset = 0;

    while (outOffset < outSize) {
        const control = src[inOffset++];

        if (control & 0x80) {
            const b = src[inOffset++];
            for (let i = 0; i < (control & 0x7f); i++)
                out[outOffset++] = b;
        }
        else {
            for (let i = 0; i < control; i++)
                out[outOffset++] = src[inOffset++];
        }
    }

    if (inOffset !== src.length)
        throw new Error('error while uncompressing RLE');

    return out;
}


function uncompressLZW(src: Uint8Array, outSize: number) {
    const inSize = src.length;
    let inOffset = 0;
    let nextBit = 0;
    let current = 0;

    const getByte = () => (inOffset >= inSize ? 0 : src[inOffset++]);

    const getBits = (n: number) => {
        let x = 0;
        for (let i = 0; i < n; i++) {
            if (current & (1 << nextBit))
                x |= 1 << i;
            if (++nextBit > 7) {
                current = getByte();
                nextBit = 0;
            }
        }
        return x;
    };

    const out = new Uint8Array(outSize);
    const prefix = new Uint16Array(4096);
    const append = new Uint8Array(4096);
    const stack = new Uint8Array(4096);
    let stackPtr = 0;
    let nBits = 9;
    let freeEntry = 257;
    let bitPos = 0;
    let outOffset = 0;

    current = getByte();
    let oldCode = getBits(nBits);
    let lastByte = oldCode;
    out[outOffset++] = oldCode;

    while (inOffset < inSize) {
        const newCode = getBits(nBits);
        bitPos += nBits;

        if (newCode === 256) {
            const nBits3 = nBits << 3;
            getBits(nBits3 - ((bitPos - 1) % nBits3) - 1);
            nBits = 9;
            freeEntry = 256;
            bitPos = 0;
            continue;
        }

        let code = newCode;

        if (code >= freeEntry) {
            if (stackPtr > 4095)
                break;
            stack[stackPtr++] = lastByte;
            code = oldCode;
        }

        while (code > 255 && code <= 4095) {
            stack[stackPtr++] = append[code];
            code = prefix[code];
        }

        stack[stackPtr++] = code;
        lastByte = code;

        while (stackPtr > 0) {
            if (outOffset >= outSize)
                return out;
            out[outOffset++] = stack[--stackPtr];
        }

        if (freeEntry < 4096) {
            prefix[freeEntry] = oldCode;
            append[freeEntry] = lastByte;
            freeEntry++;
            if (freeEntry >= 1 << nBits && nBits < 12) {
                nBits++;
                bitPos = 0;
            }
        }

        oldCode = newCode;
    }

    if (inOffset !== inSize)
        throw new Error('error while uncompressing LZW');

    return out;
}


function uncompress(src: Uint8Array, method: number, outSize: number) {
    switch (method) {
        case 1: return uncompressRLE(src, outSize);
        case 2: return uncompressLZW(src, outSize);
        default: throw new Error(`unknown compression method ${method}`);
    }
}


// PNG, 4 bits per pixel with the given palette. Pixels are one palette
// index per byte
function encodePng(width: number, height: number, pixels: Uint8Array,
                   palette: number[][], transparentIndex: number | null) {
    const chunk = (type: string, data: Buffer) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(data.length, 0);
        head.write(type, 4, 'latin1');
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0);
        return Buffer.concat([head, data, crc]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 4;    // bit depth
    ihdr[9] = 3;    // indexed color

    const rowBytes = Math.ceil(width / 2);
    const raw = Buffer.alloc((rowBytes + 1) * height);

    for (let y = 0; y < height; y++) {
        const row = y * (rowBytes + 1) + 1;     // after the filter type, 0
        for (let x = 0; x < width; x++)
            raw[row + (x >> 1)] |= pixels[y * width + x] << (x & 1 ? 0 : 4);
    }

    const chunks = [
        chunk('IHDR', ihdr),
        chunk('PLTE', Buffer.from(palette.flat())),
    ];

    if (transparentIndex !== null) {
        const alpha = Buffer.alloc(transparentIndex + 1, 0xff);
        alpha[transparentIndex] = 0;
        chunks.push(chunk('tRNS', alpha));
    }

    chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })));
    chunks.push(chunk('IEND', Buffer.alloc(0)));

    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}


// Two pixels per byte, the left one in the high nibble
function unpackNibbles(data: Uint8Array, offset: number, numPixels: number) {
    const out = new Uint8Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
        const b = data[offset + (i >> 1)];
        out[i] = i & 1 ? b & 0x0f : b >> 4;
    }
    return out;
}


// Lay the frames out in rows, in order
function packFrames(sizes: [number, number][]) {
    const area = sizes.reduce((sum, [w, h]) => sum + w * h, 0);
    const width = Math.max(...sizes.map(([w]) => w), Math.ceil(Math.sqrt(area) * 1.2), 1);
    const frames: [number, number, number, number][] = [];
    let x = 0, y = 0, rowHeight = 0;

    for (const [w, h] of sizes) {
        if (x + w > width) {
            x = 0;
            y += rowHeight;
            rowHeight = 0;
        }
        frames.push([x, y, w, h]);
        x += w;
        rowHeight = Math.max(rowHeight, h);
    }

    return { width, height: Math.max(y + rowHeight, 1), frames };
}


function main() {
    const [srcDir, outDir = 'public/data'] = process.argv.slice(2);

    if (!srcDir) {
        console.error('Usage: npm run extract -- <directory with RESOURCE.MAP> [output directory]');
        process.exit(1);
    }

    // The map: where each resource is in the resources file
    const map = new Reader(readFileSync(join(srcDir, 'RESOURCE.MAP')));
    map.block(6);
    const resFileName = map.string(13);
    const numEntries = map.u16();
    const offsets: number[] = [];

    for (let i = 0; i < numEntries; i++) {
        map.u32();      // length
        offsets.push(map.u32());
    }

    const res = new Reader(readFileSync(join(srcDir, resFileName)));

    const manifest = {
        palette: [] as number[][],
        transparentIndex: -1,
        ads: {} as Record<string, { res: [number, string][]; tags: [number, string][]; data: string }>,
        ttm: {} as Record<string, { numTags: number; data: string }>,
        bmp: {} as Record<string, { file: string; frames: [number, number, number, number][] }>,
        scr: {} as Record<string, { file: string; width: number; height: number }>,
        sounds: {} as Record<number, string>,
    };

    const bmps: { name: string; widths: number[]; heights: number[]; data: Uint8Array }[] = [];
    const scrs: { name: string; width: number; height: number; data: Uint8Array }[] = [];

    for (const offset of offsets) {
        res.pos = offset;
        const name = res.block(13).toString('latin1').replace(/\0.*$/s, '');
        res.u32();      // size
        const type = name.slice(-4);

        if (type === '.ADS') {
            res.expect('VER:', 'ADS');
            res.u32();
            res.block(5);
            res.expect('ADS:', 'ADS');
            res.block(4);
            res.expect('RES:', 'ADS');
            res.u32();
            const resources: [number, string][] = [];
            for (let i = res.u16(); i > 0; i--)
                resources.push([res.u16(), res.string(40)]);
            res.expect('SCR:', 'ADS');
            const data = res.compressed();
            res.expect('TAG:', 'ADS');
            res.u32();
            const tags: [number, string][] = [];
            for (let i = res.u16(); i > 0; i--)
                tags.push([res.u16(), res.string(40)]);
            manifest.ads[name] = { res: resources, tags, data: Buffer.from(data).toString('base64') };
        }
        else if (type === '.BMP') {
            res.expect('BMP:', 'BMP');
            res.u16();
            res.u16();
            res.expect('INF:', 'BMP');
            res.u32();
            const numImages = res.u16();
            const widths = Array.from({ length: numImages }, () => res.u16());
            const heights = Array.from({ length: numImages }, () => res.u16());
            res.expect('BIN:', 'BMP');
            bmps.push({ name, widths, heights, data: res.compressed() });
        }
        else if (type === '.PAL') {
            res.expect('PAL:', 'PAL');
            res.u16();
            res.block(2);
            res.expect('VGA:', 'PAL');
            res.block(4);
            // Only the first 16 colors are used. They're 6 bits per component
            for (let i = 0; i < 16; i++)
                manifest.palette.push([res.u8() << 2 & 0xff, res.u8() << 2 & 0xff, res.u8() << 2 & 0xff]);
        }
        else if (type === '.SCR') {
            res.expect('SCR:', 'SCR');
            res.u16();
            res.u16();
            res.expect('DIM:', 'SCR');
            res.u32();
            const width = res.u16();
            const height = res.u16();
            res.expect('BIN:', 'SCR');
            scrs.push({ name, width, height, data: res.compressed() });
        }
        else if (type === '.TTM') {
            res.expect('VER:', 'TTM');
            res.u32();
            res.block(5);
            res.expect('PAG:', 'TTM');
            res.u32();
            res.block(2);
            res.expect('TT3:', 'TTM');
            const data = res.compressed();
            res.expect('TTI:', 'TTM');
            res.block(4);
            res.expect('TAG:', 'TTM');
            res.u32();
            const numTags = res.u16();
            manifest.ttm[name] = { numTags, data: Buffer.from(data).toString('base64') };
        }
        // FILES.VIN is only a list of the files
    }

    manifest.transparentIndex = manifest.palette.findIndex(
        c => c.every((v, i) => v === KEY_RGB[i]));

    if (manifest.transparentIndex === -1)
        throw new Error('the palette has no transparent color');

    rmSync(outDir, { recursive: true, force: true });
    for (const dir of ['bmp', 'scr', 'sounds'])
        mkdirSync(join(outDir, dir), { recursive: true });

    const fileName = (name: string) => name.replace(/\.[A-Z]+$/, '.png');

    for (const scr of scrs) {
        if (scr.width % 2)
            throw new Error(`${scr.name}: odd width`);
        const pixels = unpackNibbles(scr.data, 0, scr.width * scr.height);
        const file = `scr/${fileName(scr.name)}`;
        writeFileSync(join(outDir, file),
                      encodePng(scr.width, scr.height, pixels, manifest.palette, null));
        manifest.scr[scr.name] = { file, width: scr.width, height: scr.height };
    }

    for (const bmp of bmps) {
        const sizes = bmp.widths.map((w, i) => [w, bmp.heights[i]] as [number, number]);
        const sheet = packFrames(sizes);
        const pixels = new Uint8Array(sheet.width * sheet.height).fill(manifest.transparentIndex);
        let offset = 0;

        sheet.frames.forEach(([fx, fy, w, h]) => {
            if (w % 2)
                throw new Error(`${bmp.name}: odd width`);
            const frame = unpackNibbles(bmp.data, offset, w * h);
            offset += w * h / 2;
            for (let y = 0; y < h; y++)
                pixels.set(frame.subarray(y * w, (y + 1) * w), (fy + y) * sheet.width + fx);
        });

        const file = `bmp/${fileName(bmp.name)}`;
        writeFileSync(join(outDir, file),
                      encodePng(sheet.width, sheet.height, pixels, manifest.palette, manifest.transparentIndex));
        manifest.bmp[bmp.name] = { file, frames: sheet.frames };
    }

    for (let i = 0; i < NUM_SOUNDS; i++) {
        const src = join(srcDir, `sound${i}.wav`);
        if (existsSync(src)) {
            const file = `sounds/sound${i}.wav`;
            copyFileSync(src, join(outDir, file));
            manifest.sounds[i] = file;
        }
    }

    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest));

    console.log(`Extracted ${Object.keys(manifest.ads).length} ADS, ${Object.keys(manifest.ttm).length} TTM, `
                + `${bmps.length} BMP, ${scrs.length} SCR and ${Object.keys(manifest.sounds).length} sounds to ${outDir}`);
}

main();
