// Ported from stranded's walk.c and calcpath.c: Johnny walking from one
// spot of the island to another, between scenes

import { NUM_OF_NODES, UNDEF_NODE, walkMatrix } from '../data/calcpathData';
import {
    walkData, walkDataBookmarks, walkDataBookmarksTurns, walkDataEndHeadings, walkDataStartHeadings,
} from '../data/walkData';
import { grClearScreen, grDrawSprite, grDrawSpriteFlip } from './graphics';
import type { TtmSlot, TtmThread } from './types';
import { debugMsg, rand } from './utils';


// Every path from one spot to another, picking one at random. Certainly not
// the exact algorithm of the original, but the best fit so far
function calcPath(fromNode: number, toNode: number) {
    const paths: number[][] = [];
    const isMarked = new Array(NUM_OF_NODES).fill(false);
    const path = [fromNode];

    const recurse = (prevNode: number, curNode: number) => {
        if (curNode === toNode) {
            paths.push([...path]);
            return;
        }

        // Each spot we can reach from where we are
        for (let nextNode = 0; nextNode < NUM_OF_NODES; nextNode++) {
            if (walkMatrix[prevNode][curNode][nextNode] && !isMarked[nextNode]) {
                isMarked[nextNode] = true;
                path.push(nextNode);
                recurse(curNode, nextNode);
                path.pop();
                isMarked[nextNode] = false;
            }
        }
    };

    isMarked[fromNode] = true;
    recurse(UNDEF_NODE, fromNode);

    const res = paths[rand(paths.length)];
    debugMsg(`Walking from ${'ABCDEF'[fromNode]} to ${'ABCDEF'[toNode]}: ${res.map(n => 'ABCDEF'[n]).join('')}`);

    return res;
}


let walkPath: number[] = [];
let pathPos = 0;
let currentSpot = 0;
let currentHdg = 0;
let nextSpot = 0;
let nextHdg = 0;
let finalSpot = 0;
let finalHdg = 0;
let increment = 0;
let lastTurn = false;
let hasArrived = false;
let isBehindTree = false;
let data = 0;   // the current row of walkData


function turnIncrement() {
    const inc = (nextHdg - currentHdg) & 0x07;
    return inc ? (inc < 4 ? 1 : -1) : 0;
}


export function walkInit(fromSpot: number, fromHdg: number, toSpot: number, toHdg: number) {
    walkPath = calcPath(fromSpot, toSpot);
    pathPos = 0;

    currentSpot  = fromSpot;
    currentHdg   = fromHdg;
    finalSpot    = toSpot;
    finalHdg     = toHdg;
    hasArrived   = false;
    isBehindTree = false;

    if (currentSpot === finalSpot) {
        nextSpot = -1;
        nextHdg = finalHdg;
        lastTurn = true;
    }
    else {
        nextSpot = walkPath[++pathPos];
        nextHdg = walkDataStartHeadings[currentSpot][nextSpot];
        lastTurn = false;
    }

    increment = turnIncrement();
}


// Draw the next step, and return how long to wait until the following one,
// or 0 once arrived
export function walkAnimate(ttmThread: TtmThread, ttmBgSlot: TtmSlot) {
    const ttmSlot = ttmThread.ttmSlot;
    const sfc = ttmThread.ttmLayer!;

    if (hasArrived) {
        debugMsg('WALKING: end walk');
        return 0;
    }

    // Are we turning?
    if (nextHdg !== -1) {

        // More than one iteration left? Then let's turn
        if ((((nextHdg - currentHdg) & 0x07) % 7) > 1) {
            currentHdg = (currentHdg + increment) & 7;
            data = walkDataBookmarksTurns[currentSpot] + currentHdg;
            if (lastTurn)
                data += 9;
        }

        // The turn is over
        else {

            // Do we have another spot to walk to?
            if (currentSpot !== finalSpot) {
                nextHdg = -1;
                isBehindTree = (currentSpot === 3 && nextSpot === 4) || (currentSpot === 4 && nextSpot === 3);
                data = walkDataBookmarks[currentSpot][nextSpot];
            }

            // Else, we arrived at destination
            else {
                data = walkDataBookmarksTurns[finalSpot] + finalHdg + 9;   // hands in pockets
                hasArrived = true;
            }
        }
    }

    // Walking forward
    else {
        data++;

        // Have we reached a spot? Then let's begin a turn
        if (!walkData[data][1]) {

            currentHdg = walkDataEndHeadings[currentSpot][nextSpot];
            currentSpot = nextSpot;

            // What's the next heading, and the next spot of the path?
            if (currentSpot !== finalSpot) {
                nextSpot = walkPath[++pathPos];
                nextHdg = walkDataStartHeadings[currentSpot][nextSpot];
            }
            else {
                nextHdg = finalHdg;
                lastTurn = true;
            }

            // Turning: left or right?
            increment = turnIncrement();

            currentHdg = (currentHdg + increment) & 7;
            data = walkDataBookmarksTurns[currentSpot] + currentHdg;

            if (lastTurn) {
                data += 9;   // hands in pockets
                if (currentHdg === finalHdg)
                    hasArrived = true;
            }
        }
    }

    const [flipped, x, y, spriteNo] = walkData[data];

    grClearScreen(sfc);

    if (flipped)
        grDrawSpriteFlip(sfc, ttmSlot, x - 1, y, spriteNo, 0);
    else
        grDrawSprite(sfc, ttmSlot, x - 1, y, spriteNo, 0);

    if (isBehindTree) {
        grDrawSprite(sfc, ttmBgSlot, 442, 148, 13, 0);  // trunk
        grDrawSprite(sfc, ttmBgSlot, 365, 122, 12, 0);  // leafs
    }

    return hasArrived ? 80 : 6;
}
