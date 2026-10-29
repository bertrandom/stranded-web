// Ported from stranded's island.c: the island, the ocean around it and its
// waves, the raft, and the holiday decorations

import { gr, grDrawSprite, grDrawSpriteFlip, grLoadBmp, grLoadScreen, grNewLayer, grReleaseBmp } from './graphics';
import type { TtmThread } from './types';
import { rand } from './utils';


export const islandState = {
    lowTide: false,
    night: false,
    raft: 0,
    holiday: 0,
    xPos: 0,
    yPos: 0,
};

let counter1 = 0;
let counter2 = 0;


export function islandInit(ttmThread: TtmThread) {
    const ttmSlot = ttmThread.ttmSlot;

    grLoadScreen(islandState.night ? 'NIGHT.SCR' : `OCEAN0${rand(3)}.SCR`);

    const bg = gr.background!;
    ttmThread.ttmLayer = bg;

    gr.dx = islandState.xPos;
    gr.dy = islandState.yPos;

    // The raft
    grLoadBmp(ttmSlot, 0, 'MRAFT.BMP');

    const xRaft = islandState.lowTide ? 529 : 512;
    const yRaft = islandState.lowTide ? 281 : 266;

    if (islandState.raft >= 1 && islandState.raft <= 5)
        grDrawSprite(bg, ttmSlot, xRaft, yRaft, islandState.raft - 1, 0);

    grLoadBmp(ttmSlot, 0, 'BACKGRND.BMP');

    // The clouds
    const windDirection = rand(2);
    let numClouds: number;

    gr.dx = gr.dy = 0;

    if (rand(2))
        numClouds = 1;
    else if (rand(2))
        numClouds = 0;
    else if (rand(4))
        numClouds = 2;
    else if (rand(4))
        numClouds = 3;
    else if (rand(4))
        numClouds = 4;
    else
        numClouds = 5;

    for (let i = 0; i < numClouds; i++) {
        const cloudNo = rand(3);
        let cloudX: number, cloudY: number;

        switch (cloudNo) {
            case 0:
                cloudX = rand(gr.width - 129) - gr.marginX;
                cloudY = rand(135 - 36);
                break;
            case 1:
                cloudX = rand(gr.width - 192) - gr.marginX;
                cloudY = rand(135 - 57);
                break;
            default:
                cloudX = rand(gr.width - 264) - gr.marginX;
                cloudY = rand(135 - 76);
                break;
        }

        if (windDirection)
            grDrawSprite(bg, ttmSlot, cloudX, cloudY, 15 + cloudNo, 0);
        else
            grDrawSpriteFlip(bg, ttmSlot, cloudX, cloudY, 15 + cloudNo, 0);
    }

    gr.dx = islandState.xPos;
    gr.dy = islandState.yPos;

    // The island itself
    grDrawSprite(bg, ttmSlot, 288, 279,  0, 0);      // island
    grDrawSprite(bg, ttmSlot, 442, 148, 13, 0);      // trunk
    grDrawSprite(bg, ttmSlot, 365, 122, 12, 0);      // leafs
    grDrawSprite(bg, ttmSlot, 396, 279, 14, 0);      // palmtree's shadow

    if (islandState.lowTide) {
        grDrawSprite(bg, ttmSlot, 249, 303,  1, 0);  // low tide shore
        grDrawSprite(bg, ttmSlot, 150, 328,  2, 0);  // rock
    }

    // Initial waves on the shore
    for (let i = 0; i < 4; i++)
        islandAnimate(ttmThread);

    // Waves animation thread
    ttmThread.delay = ttmThread.timer = 8;
}


export function islandAnimate(ttmThread: TtmThread) {
    const ttmSlot = ttmThread.ttmSlot;
    const bg = gr.background!;

    gr.dx = islandState.xPos;
    gr.dy = islandState.yPos;

    if (islandState.lowTide) {
        counter2 = (counter2 + 1) % 4;

        switch (counter2) {
            case 0: grDrawSprite(bg, ttmSlot, 129, 340, 39 + counter1, 0); break;  // rock waves
            case 1: grDrawSprite(bg, ttmSlot, 233, 323, 30 + counter1, 0); break;  // low tide waves - left
            case 2: grDrawSprite(bg, ttmSlot, 367, 356, 33 + counter1, 0); break;  // low tide waves - center
            case 3: grDrawSprite(bg, ttmSlot, 558, 323, 36 + counter1, 0); break;  // low tide waves - right
        }
    }
    else {
        counter2 = (counter2 + 1) % 3;

        switch (counter2) {
            case 0: grDrawSprite(bg, ttmSlot, 270, 306, 3 + counter1, 0); break;   // high tide waves - left
            case 1: grDrawSprite(bg, ttmSlot, 364, 319, 6 + counter1, 0); break;   // high tide waves - center
            case 2: grDrawSprite(bg, ttmSlot, 518, 303, 9 + counter1, 0); break;   // high tide waves - right
        }
    }

    if (!counter2)
        counter1 = (counter1 + 1) % 3;
}


export function islandInitHoliday(ttmThread: TtmThread) {
    const ttmSlot = ttmThread.ttmSlot;

    if (!islandState.holiday) {
        ttmThread.isRunning = 0;
        return;
    }

    const layer = grNewLayer();
    ttmThread.ttmLayer = layer;
    ttmThread.isRunning = 3;

    gr.dx = islandState.xPos;
    gr.dy = islandState.yPos;

    grLoadBmp(ttmSlot, 0, 'HOLIDAY.BMP');

    switch (islandState.holiday) {
        case 1: grDrawSprite(layer, ttmSlot, 410, 298, 0, 0); break;   // Halloween
        case 2: grDrawSprite(layer, ttmSlot, 333, 286, 1, 0); break;   // St Patrick
        case 3: grDrawSprite(layer, ttmSlot, 404, 267, 2, 0); break;   // Christmas
        case 4: grDrawSprite(layer, ttmSlot, 361, 155, 3, 0); break;   // New year
    }

    grReleaseBmp(ttmSlot, 0);
}
