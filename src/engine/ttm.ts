// Ported from stranded's ttm.c: the TTM scripts, which draw the animations

import { assets } from './assets';
import {
    gr, grClearScreen, grCopyZoneToBg, grDrawCircle, grDrawLine, grDrawPixel, grDrawRect,
    grDrawSprite, grDrawSpriteFlip, grLoadBmp, grLoadScreen, grReleaseBmp, grRestoreZone, grSetClipZone,
} from './graphics';
import { soundPlay } from './sound';
import { MAX_BMP_SLOTS, type TtmSlot, type TtmThread } from './types';
import { debugMsg, peekUint16, toS16 } from './utils';


export const ttm = { dx: 0, dy: 0 };


function ttmFindPreviousTag(ttmSlot: TtmSlot, offset: number) {
    let result = 0;

    for (let i = 0; i < ttmSlot.tags.length && ttmSlot.tags[i].offset < offset; i++)
        result = ttmSlot.tags[i].offset;

    return result;
}


export function ttmFindTag(ttmSlot: TtmSlot, reqdTag: number) {
    for (let i = 0; i < ttmSlot.numTags && i < ttmSlot.tags.length; i++)
        if (ttmSlot.tags[i].id === reqdTag)
            return ttmSlot.tags[i].offset;

    console.warn(`TTM tag #${reqdTag} not found, returning offset 0000`);
    return 0;
}


export function ttmLoadTtm(ttmSlot: TtmSlot, ttmName: string) {
    const resource = assets.ttm.get(ttmName);
    if (!resource)
        throw new Error(`TTM resource ${ttmName} not found`);

    debugMsg(`---- Loading ${ttmName}`);

    const data = resource.data;
    ttmSlot.data = data;
    ttmSlot.dataSize = data.length;
    ttmSlot.numTags = resource.numTags;
    ttmSlot.tags = [];

    // Bookmark every tag, for later jumps
    let offset = 0;

    while (offset < data.length) {
        const opcode = peekUint16(data, offset);
        offset += 2;

        if (opcode === 0x1111 || opcode === 0x1101) {
            const arg = peekUint16(data, offset);
            offset += 2;
            ttmSlot.tags.push({ id: arg, offset });
        }
        else {
            const numArgs = opcode & 0x000f;

            if (numArgs === 0x0f) {
                while (data[offset] !== 0 && data[offset + 1] !== 0)
                    offset += 2;
                offset += 2;
            }
            else {
                offset += numArgs << 1;
            }
        }
    }

    // In SASKDATE.TTM, the number of tags differs from the resource's
    while (ttmSlot.tags.length < ttmSlot.numTags)
        ttmSlot.tags.push({ id: 0, offset: Infinity });
}


export function ttmInitSlot(ttmSlot: TtmSlot) {
    ttmSlot.data = null;
    ttmSlot.numSprites.fill(0);
}


export function ttmResetSlot(ttmSlot: TtmSlot) {
    ttmSlot.data = null;
    ttmSlot.tags = [];

    for (let i = 0; i < MAX_BMP_SLOTS; i++)
        if (ttmSlot.numSprites[i])
            grReleaseBmp(ttmSlot, i);
}


export function ttmPlay(ttmThread: TtmThread) {
    gr.dx = ttm.dx;
    gr.dy = ttm.dy;

    const ttmSlot = ttmThread.ttmSlot;
    const data = ttmSlot.data!;
    const layer = ttmThread.ttmLayer!;
    let offset = ttmThread.ip;
    let continueLoop = true;
    const args: number[] = [];
    let strArg = '';

    while (continueLoop) {
        const opcode = peekUint16(data, offset);
        offset += 2;

        const numArgs = opcode & 0x000f;

        if (numArgs === 0x0f) {         // the arg is a string
            strArg = '';
            while (data[offset] !== 0 && offset < data.length)
                strArg += String.fromCharCode(data[offset++]);
            offset++;
            if ((strArg.length + 1) & 1)    // always read an even number of bytes
                offset++;
        }
        else {                          // args are numArgs words
            for (let i = 0; i < numArgs; i++, offset += 2)
                args[i] = peekUint16(data, offset);
        }

        const s = (i: number) => toS16(args[i]);

        switch (opcode) {

            case 0x0080:
                debugMsg('    DRAW_BACKGROUND');
                break;

            case 0x0110:
                debugMsg('    PURGE');
                if (ttmThread.sceneTimer)
                    ttmThread.nextGotoOffset = ttmFindPreviousTag(ttmSlot, offset);
                else
                    ttmThread.isRunning = 2;
                break;

            case 0x0FF0:
                debugMsg('    UPDATE');
                continueLoop = false;
                break;

            case 0x1021:
                debugMsg(`    SET_DELAY ${args[0]}`);
                ttmThread.timer = ttmThread.delay = args[0] > 4 ? args[0] : 4;
                break;

            case 0x1051:
                debugMsg(`    SET_BMP_SLOT ${args[0]}`);
                ttmThread.selectedBmpSlot = args[0] & 0xff;
                break;

            case 0x1061:
                debugMsg(`    SET_PALETTE_SLOT ${args[0]}`);
                break;

            case 0x1101:
                debugMsg(`    :LOCAL_TAG ${args[0]}`);
                break;

            case 0x1111:
                debugMsg(`    :TAG ${args[0]}`);
                break;

            case 0x1121:
                // Before SAVE_IMAGE1, the id of the region for CLEAR_SCREEN
                debugMsg(`    TTM_UNKNOWN_1 ${args[0]}`);
                break;

            case 0x1201:
                debugMsg(`    GOTO_TAG ${args[0]}`);
                ttmThread.nextGotoOffset = ttmFindTag(ttmSlot, args[0]);
                break;

            case 0x2002:
                debugMsg(`    SET_COLORS ${args[0]} ${args[1]}`);
                ttmThread.fgColor = args[0] & 0xff;
                ttmThread.bgColor = args[1] & 0xff;
                break;

            case 0x2012:
                debugMsg(`    SET_FRAME1 ${args[0]} ${args[1]}`);
                break;

            case 0x2022:
                debugMsg(`    TIMER ${args[0]} ${args[1]}`);
                // Really not sure about this formula, but things work not
                // so bad like that
                ttmThread.delay = ttmThread.timer = ((args[0] + args[1]) / 2) & 0xffff;
                break;

            case 0x4004:
                debugMsg(`    SET_CLIP_ZONE ${args.slice(0, 4)}`);
                grSetClipZone(layer, s(0), s(1), s(2), s(3));
                break;

            case 0x4204:
                debugMsg(`    COPY_ZONE_TO_BG ${args.slice(0, 4)}`);
                grCopyZoneToBg(layer, args[0], args[1], args[2], args[3]);
                break;

            case 0x4214:
                // The zone redrawn at each update? Not used by the original
                debugMsg(`    SAVE_IMAGE1 ${args.slice(0, 4)}`);
                break;

            case 0xA002:
                debugMsg(`    DRAW_PIXEL ${args[0]} ${args[1]}`);
                grDrawPixel(layer, s(0), s(1), ttmThread.fgColor);
                break;

            case 0xA054:
                // Only once, in GJGULIVR.TTM. Zones aren't really saved
                debugMsg(`    SAVE_ZONE ${args.slice(0, 4)}`);
                break;

            case 0xA064:
                // Only once, in GJGULIVR.TTM
                debugMsg(`    RESTORE_ZONE ${args.slice(0, 4)}`);
                grRestoreZone();
                break;

            case 0xA0A4:
                debugMsg(`    DRAW_LINE ${args.slice(0, 4)}`);
                grDrawLine(layer, s(0), s(1), s(2), s(3), ttmThread.fgColor);
                break;

            case 0xA104:
                debugMsg(`    DRAW_RECT ${args.slice(0, 4)}`);
                grDrawRect(layer, s(0), s(1), args[2], args[3], ttmThread.fgColor);
                break;

            case 0xA404:
                debugMsg(`    DRAW_CIRCLE ${args.slice(0, 4)}`);
                grDrawCircle(layer, s(0), s(1), args[2], args[3], ttmThread.fgColor, ttmThread.bgColor);
                break;

            case 0xA504:
                debugMsg(`    DRAW_SPRITE ${args.slice(0, 4)}`);
                grDrawSprite(layer, ttmSlot, s(0), s(1), args[2], args[3]);
                break;

            case 0xA524:
                debugMsg(`    DRAW_SPRITE_FLIP ${args.slice(0, 4)}`);
                grDrawSpriteFlip(layer, ttmSlot, s(0), s(1), args[2], args[3]);
                break;

            case 0xA601:
                debugMsg(`    CLEAR_SCREEN ${args[0]}`);
                grClearScreen(layer);
                break;

            case 0xB606:
                debugMsg(`    DRAW_SCREEN ${args.slice(0, 6)}`);
                break;

            case 0xC051:
                debugMsg(`    PLAY_SAMPLE ${args[0]}`);
                soundPlay(args[0]);
                break;

            case 0xF01F:
                debugMsg(`    LOAD_SCREEN ${strArg}`);
                grLoadScreen(strArg);
                break;

            case 0xF02F:
                debugMsg(`    LOAD_IMAGE ${strArg}`);
                grLoadBmp(ttmSlot, ttmThread.selectedBmpSlot, strArg);
                break;

            case 0xF05F:
                debugMsg(`    LOAD_PALETTE ${strArg}`);
                break;
        }

        if (offset >= ttmSlot.dataSize) {
            ttmThread.isRunning = 2;
            continueLoop = false;
        }
    }

    ttmThread.ip = offset;
}
