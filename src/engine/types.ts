// Ported from stranded's graphics.h

import type { Surface } from './surface';

export const SCREEN_WIDTH  = 640;
export const SCREEN_HEIGHT = 480;

export const MAX_BMP_SLOTS   = 6;
export const MAX_TTM_SLOTS   = 10;
export const MAX_TTM_THREADS = 10;

export interface TtmTag {   // used for ADS too
    id: number;
    offset: number;
}

export interface TtmSlot {
    data: Uint8Array | null;
    dataSize: number;
    tags: TtmTag[];
    numTags: number;
    numSprites: number[];
    sprites: Surface[][];
}

export interface TtmThread {
    ttmSlot: TtmSlot;
    isRunning: number;
    sceneSlot: number;
    sceneTag: number;
    sceneTimer: number;
    sceneIterations: number;
    ip: number;
    delay: number;
    timer: number;
    nextGotoOffset: number;
    selectedBmpSlot: number;
    fgColor: number;
    bgColor: number;
    ttmLayer: Surface | null;
}

export function newTtmSlot(): TtmSlot {
    return {
        data: null,
        dataSize: 0,
        tags: [],
        numTags: 0,
        numSprites: new Array(MAX_BMP_SLOTS).fill(0),
        sprites: Array.from({ length: MAX_BMP_SLOTS }, () => []),
    };
}

export function newTtmThread(ttmSlot: TtmSlot): TtmThread {
    return {
        ttmSlot,
        isRunning: 0,
        sceneSlot: 0,
        sceneTag: 0,
        sceneTimer: 0,
        sceneIterations: 0,
        ip: 0,
        delay: 0,
        timer: 0,
        nextGotoOffset: 0,
        selectedBmpSlot: 0,
        fgColor: 0,
        bgColor: 0,
        ttmLayer: null,
    };
}
