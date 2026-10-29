// Ported from stranded's ads.c: the ADS scripts, which run TTM scripts as
// threads, and decide which one to run next

import { assets } from './assets';
import { ev } from './events';
import { gr, grFadeOut, grInitEmptyBackground, grLoadBmp, grLoadScreen, grNewLayer, grRestoreZone, grUpdateDisplay } from './graphics';
import { islandAnimate, islandInit, islandInitHoliday, islandState } from './island';
import { ttmFindTag, ttmInitSlot, ttmLoadTtm, ttmPlay, ttmResetSlot } from './ttm';
import { MAX_TTM_SLOTS, MAX_TTM_THREADS, newTtmSlot, newTtmThread, type TtmTag } from './types';
import { debugMsg, peekUint16, rand, toS16 } from './utils';
import { walkAnimate, walkInit } from './walk';


const OP_ADD_SCENE  = 0;
const OP_STOP_SCENE = 1;
const OP_NOP        = 2;

interface AdsChunk {
    slot: number;
    tag: number;
    offset: number;
}

interface AdsRandOp {
    type: number;
    slot: number;
    tag: number;
    numPlays: number;
    weight: number;
}

// What's on screen, for the page
export interface NowPlaying {
    activity: 'intro' | 'scene' | 'walk' | '';
    adsName: string;    // for a scene: the ADS script and tag,
    adsTag: number;     // with the tag's description
    description: string;
    storyDay: number;   // day of the story the scene belongs to, or 0
}

export const nowPlaying: NowPlaying = { activity: '', adsName: '', adsTag: 0, description: '', storyDay: 0 };
export const nowPlayingListeners: ((np: NowPlaying) => void)[] = [];

let adsChunks: AdsChunk[] = [];
let adsChunksLocal: AdsChunk[] = [];

const ttmBackgroundSlot = newTtmSlot();
const ttmHolidaySlot = newTtmSlot();
const ttmSlots = Array.from({ length: MAX_TTM_SLOTS }, newTtmSlot);

const ttmBackgroundThread = newTtmThread(ttmBackgroundSlot);
const ttmHolidayThread = newTtmThread(ttmHolidaySlot);
const ttmThreads = Array.from({ length: MAX_TTM_THREADS }, () => newTtmThread(ttmSlots[0]));

let adsTags: TtmTag[] = [];
let adsRandOps: AdsRandOp[] = [];
let numThreads = 0;
let adsStopRequested = false;


export function adsSetNowPlaying(activity: NowPlaying['activity'], adsName: string | null, adsTag: number, storyDay: number) {
    let description = '';

    if (adsName)
        description = assets.ads.get(adsName)?.tags.find(t => t.id === adsTag)?.description ?? '';

    Object.assign(nowPlaying, { activity, adsName: adsName ?? '', adsTag, description, storyDay });

    for (const listener of nowPlayingListeners)
        listener({ ...nowPlaying });
}


// Bookmark the tags, and the chunks of the wanted tag which are run when a
// scene ends (IF_LASTPLAYED), and return where the tag starts
function adsLoad(data: Uint8Array, numTags: number, tag: number) {
    let offset = 0;
    let tagOffset = 0;
    let bookmarkingChunks = false;
    let bookmarkingIfNotRunnings = false;

    adsChunks = [];
    adsChunksLocal = [];
    adsTags = [];

    const skip = (numArgs: number) => offset += numArgs << 1;

    while (offset < data.length) {
        const opcode = peekUint16(data, offset);
        offset += 2;

        switch (opcode) {

            case 0x1350:     // IF_LASTPLAYED
                if (bookmarkingChunks) {
                    bookmarkingIfNotRunnings = false;
                    const slot = peekUint16(data, offset), sceneTag = peekUint16(data, offset + 2);
                    skip(2);
                    adsChunks.push({ slot, tag: sceneTag, offset });
                }
                else {
                    skip(2);
                }
                break;

            case 0x1360:     // IF_NOT_RUNNING
                // Only the IF_NOT_RUNNINGs before the first IF_LASTPLAYED
                // or IF_IS_RUNNING are bookmarked
                if (bookmarkingChunks && bookmarkingIfNotRunnings) {
                    const slot = peekUint16(data, offset), sceneTag = peekUint16(data, offset + 2);
                    skip(2);
                    adsChunks.push({ slot, tag: sceneTag, offset });
                }
                else {
                    skip(2);
                }
                break;

            case 0x1370:     // IF_IS_RUNNING
                bookmarkingIfNotRunnings = false;
                skip(2);
                break;

            case 0x1070: skip(2); break;
            case 0x1330: skip(2); break;
            case 0x1420: break;
            case 0x1430: break;
            case 0x1510: break;
            case 0x1520: skip(5); break;
            case 0x2005: skip(4); break;
            case 0x2010: skip(3); break;
            case 0x2014: break;
            case 0x3010: break;
            case 0x3020: skip(1); break;
            case 0x30ff: break;
            case 0x4000: skip(3); break;
            case 0xf010: break;
            case 0xf200: skip(1); break;
            case 0xffff: break;
            case 0xfff0: break;

            default:
                adsTags.push({ id: opcode, offset });

                if (opcode === tag) {
                    tagOffset = offset;
                    bookmarkingChunks = true;
                    bookmarkingIfNotRunnings = true;
                }
                else {
                    bookmarkingChunks = false;
                    bookmarkingIfNotRunnings = false;
                }
                break;
        }
    }

    if (adsTags.length !== numTags)
        debugMsg("Warning: didn't find every tag in ADS data");

    if (tagOffset === 0)
        debugMsg(`Warning: ADS tag #${tag} not found, starting from offset 0`);

    return tagOffset;
}


function adsFindTag(reqdTag: number) {
    const tag = adsTags.find(t => t.id === reqdTag);

    if (!tag)
        console.warn(`ADS tag #${reqdTag} not found, returning offset 0000`);

    return tag?.offset ?? 0;
}


function adsAddScene(ttmSlotNo: number, ttmTag: number, arg3: number) {
    for (const thread of ttmThreads) {
        if (thread.isRunning === 1 && thread.sceneSlot === ttmSlotNo && thread.sceneTag === ttmTag) {
            debugMsg(`(${ttmSlotNo},${ttmTag}) thread is already running - didn't add extra one`);
            return;
        }
    }

    const ttmThread = ttmThreads.find(t => !t.isRunning);
    if (!ttmThread) {
        console.warn('adsAddScene(): no free thread');
        return;
    }

    Object.assign(ttmThread, {
        ttmSlot: ttmSlots[ttmSlotNo],
        isRunning: 1,
        sceneSlot: ttmSlotNo,
        sceneTag: ttmTag,
        sceneTimer: 0,
        sceneIterations: 0,
        delay: 4,
        timer: 0,
        nextGotoOffset: 0,
        selectedBmpSlot: 0,
        fgColor: 0x0f,
        bgColor: 0x0f,
    });

    ttmThread.ip = ttmSlotNo ? ttmFindTag(ttmSlots[ttmSlotNo], ttmTag) : 0;

    if (toS16(arg3) < 0)
        ttmThread.sceneTimer = -toS16(arg3);
    else if (toS16(arg3) > 0)
        ttmThread.sceneIterations = arg3 - 1;

    ttmThread.ttmLayer = grNewLayer();

    numThreads++;
}


function adsStopScene(sceneNo: number) {
    ttmThreads[sceneNo].ttmLayer = null;
    ttmThreads[sceneNo].isRunning = 0;
    numThreads--;
}


function adsStopSceneByTtmTag(ttmSlotNo: number, ttmTag: number) {
    ttmThreads.forEach((thread, i) => {
        if (thread.isRunning && thread.sceneSlot === ttmSlotNo && thread.sceneTag === ttmTag)
            adsStopScene(i);
    });
}


function isSceneRunning(ttmSlotNo: number, ttmTag: number) {
    return ttmThreads.some(t => t.isRunning === 1 && t.sceneSlot === ttmSlotNo && t.sceneTag === ttmTag);
}


// Pick in a list of weighted operations
function adsRandomEnd() {
    if (!adsRandOps.length) {
        debugMsg('RANDOM: no operation to choose from');
        return;
    }

    const totalWeight = adsRandOps.reduce((sum, op) => sum + op.weight, 0);
    const a = rand(totalWeight || 1);
    let partialWeight = 0;
    let op = adsRandOps[adsRandOps.length - 1];

    for (const candidate of adsRandOps) {
        partialWeight += candidate.weight;
        if (a < partialWeight) {
            op = candidate;
            break;
        }
    }

    switch (op.type) {
        case OP_ADD_SCENE:
            debugMsg(`RANDOM: chose ADD_SCENE ${op.slot} ${op.tag}`);
            adsAddScene(op.slot, op.tag, op.numPlays);
            break;

        case OP_STOP_SCENE:
            debugMsg(`RANDOM: chose STOP_SCENE ${op.slot} ${op.tag}`);
            adsStopSceneByTtmTag(op.slot, op.tag);
            break;

        default:
            debugMsg('RANDOM: chose NOP');
            break;
    }
}


// Init slots and threads for TTM scripts
export function adsInit() {
    for (const slot of ttmSlots)
        ttmInitSlot(slot);

    for (const thread of ttmThreads) {
        thread.isRunning = 0;
        thread.timer = 0;
    }

    gr.updateDelay = 0;
    ttmBackgroundThread.isRunning = 0;
    ttmHolidayThread.isRunning = 0;
    numThreads = 0;
    adsStopRequested = false;
}


function adsPlayChunk(data: Uint8Array, offset: number) {
    let inRandBlock = false;
    let inOrBlock = false;
    let inSkipBlock = false;
    let inIfLastplayedLocal = false;
    let continueLoop = true;
    const args: number[] = [];

    const read = (numArgs: number) => {
        for (let i = 0; i < numArgs; i++, offset += 2)
            args[i] = peekUint16(data, offset);
    };

    while (continueLoop && offset < data.length) {
        const opcode = peekUint16(data, offset);
        offset += 2;

        switch (opcode) {

            case 0x1070:
                // Inside an IF_LASTPLAYED chunk, a local IF_LASTPLAYED which
                // overrides the global ones
                read(2);
                debugMsg('IF_LASTPLAYED_LOCAL');
                inIfLastplayedLocal = true;
                adsChunksLocal.push({ slot: args[0], tag: args[1], offset });
                break;

            case 0x1330:
                // Always just before an ADD_SCENE with the same (ttm, tag),
                // which references tags with init commands. Seemingly a
                // synonym of IF_NOT_RUNNING; ignoring it works anyway
                read(2);
                debugMsg(`IF_UNKNOWN_1 ${args[0]} ${args[1]}`);
                break;

            case 0x1350:
                read(2);
                debugMsg(`IF_LASTPLAYED ${args[0]} ${args[1]}`);
                if (!inOrBlock)
                    continueLoop = false;
                inOrBlock = false;
                break;

            case 0x1360:
                read(2);
                debugMsg(`IF_NOT_RUNNING ${args[0]} ${args[1]}`);
                if (isSceneRunning(args[0], args[1]))
                    inSkipBlock = true;
                break;

            case 0x1370:
                read(2);
                debugMsg(`IF_IS_RUNNING ${args[0]} ${args[1]}`);
                inSkipBlock = !isSceneRunning(args[0], args[1]);
                break;

            case 0x1420:
                debugMsg('AND');
                break;

            case 0x1430:
                debugMsg('OR');
                inOrBlock = true;
                break;

            case 0x1510:
                // PLAY_SCENE: in fact, a sort of closing brace for a block
                debugMsg('PLAY_SCENE');
                if (inSkipBlock)
                    inSkipBlock = false;
                else
                    continueLoop = false;
                break;

            case 0x1520:
                // Only in ACTIVITY.ADS tag 7, after IF_LASTPLAYED_LOCAL
                read(5);
                debugMsg('ADD_SCENE_LOCAL');

                // First pass: the scene was queued by IF_LASTPLAYED_LOCAL.
                // Second pass, from the scheduler: run the scene
                if (inIfLastplayedLocal)
                    inIfLastplayedLocal = false;
                else
                    adsAddScene(args[1], args[2], args[3]);
                break;

            case 0x2005:
                read(4);
                debugMsg(`ADD_SCENE ${args.slice(0, 4)}`);
                if (!inSkipBlock) {
                    if (inRandBlock)
                        adsRandOps.push({ type: OP_ADD_SCENE, slot: args[0], tag: args[1], numPlays: args[2], weight: args[3] });
                    else
                        adsAddScene(args[0], args[1], args[2]);
                }
                break;

            case 0x2010:
                read(3);
                debugMsg(`STOP_SCENE ${args.slice(0, 3)}`);
                if (!inSkipBlock) {
                    if (inRandBlock)
                        adsRandOps.push({ type: OP_STOP_SCENE, slot: args[0], tag: args[1], numPlays: 0, weight: args[2] });
                    else
                        adsStopSceneByTtmTag(args[0], args[1]);
                }
                break;

            case 0x3010:
                debugMsg('RANDOM_START');
                adsRandOps = [];
                inRandBlock = true;
                break;

            case 0x3020:
                read(1);
                debugMsg('NOP');
                if (inRandBlock)
                    adsRandOps.push({ type: OP_NOP, slot: 0, tag: 0, numPlays: 0, weight: args[0] });
                break;

            case 0x30ff:
                debugMsg('RANDOM_END');
                adsRandomEnd();
                inRandBlock = false;
                break;

            case 0x4000:
                read(3);
                debugMsg('UNKNOWN_6');    // only in BUILDING.ADS tag 7
                break;

            case 0xf010:
                debugMsg('FADE_OUT');
                break;

            case 0xf200:
                read(1);
                // Only in STAND.ADS, to tag 14, which has only one scene
                debugMsg(`GOSUB_TAG ${args[0]}`);
                adsPlayChunk(data, adsFindTag(args[0]));
                break;

            case 0xffff:
                debugMsg('END');
                if (inSkipBlock)
                    inSkipBlock = false;
                else
                    adsStopRequested = true;
                break;

            case 0xfff0:
                debugMsg('END_IF');
                break;

            default:
                debugMsg(`:TAG ${opcode}`);
                break;
        }
    }
}


function adsPlayTriggeredChunks(data: Uint8Array, ttmSlotNo: number, ttmTag: number) {
    // First, a local trigger, if one was declared (only in ACTIVITY.ADS
    // tag 7)
    if (adsChunksLocal.length) {
        for (const chunk of [...adsChunksLocal])
            if (chunk.slot === ttmSlotNo && chunk.tag === ttmTag) {
                adsPlayChunk(data, chunk.offset);
                adsChunksLocal.splice(adsChunksLocal.indexOf(chunk), 1);
            }
    }

    // Then, the general case. In a few cases (eg. BUILDING.ADS tag 2),
    // there are several IF_LASTPLAYEDs for one scene
    else {
        for (const chunk of adsChunks)
            if (chunk.slot === ttmSlotNo && chunk.tag === ttmTag)
                adsPlayChunk(data, chunk.offset);
    }
}


export async function adsPlay(adsName: string, adsTag: number) {
    const adsResource = assets.ads.get(adsName);
    if (!adsResource)
        throw new Error(`ADS resource ${adsName} not found`);

    debugMsg(`========== Playing ADS: ${adsName}:${adsTag} ==========`);

    const data = adsResource.data;

    for (const res of adsResource.res)
        ttmLoadTtm(ttmSlots[res.id], res.name);

    const offset = adsLoad(data, adsResource.tags.length, adsTag);

    adsStopRequested = false;
    gr.updateDelay = 0;

    // Play the first chunk of the sequence
    adsPlayChunk(data, offset);

    // Main ADS loop
    while (numThreads && !ev.skipScene) {

        if (ttmBackgroundThread.isRunning && ttmBackgroundThread.timer === 0) {
            ttmBackgroundThread.timer = ttmBackgroundThread.delay;
            islandAnimate(ttmBackgroundThread);
        }

        // Run each thread whose timer reaches 0
        for (const thread of ttmThreads) {
            if (thread.isRunning && thread.timer === 0) {
                thread.timer = thread.delay;
                ttmPlay(thread);
            }
        }

        await grUpdateDisplay(ttmThreads, ttmHolidayThread);

        // The shortest timer of all threads
        let mini = 300;

        if (ttmBackgroundThread.isRunning)
            mini = ttmBackgroundThread.timer;

        for (const thread of ttmThreads) {
            if (thread.isRunning) {
                mini = Math.min(mini, thread.delay, thread.timer);
            }
        }

        // Decrease all timers by it, and wait that long
        ttmBackgroundThread.timer = (ttmBackgroundThread.timer - mini) & 0xffff;

        for (const thread of ttmThreads)
            if (thread.isRunning)
                thread.timer = (thread.timer - mini) & 0xffff;

        gr.updateDelay = mini;

        ttmThreads.forEach((thread, i) => {
            if (!thread.isRunning || thread.timer !== 0)
                return;

            // Jumps
            if (thread.nextGotoOffset) {
                thread.ip = thread.nextGotoOffset;
                thread.nextGotoOffset = 0;
            }

            // The timer given by ADD_SCENE's arg3 (a negative value)
            if (thread.sceneTimer > 0) {
                thread.sceneTimer = toS16(thread.sceneTimer - thread.delay);
                if (thread.sceneTimer <= 0)
                    thread.isRunning = 2;
            }

            // Terminated threads
            if (thread.isRunning === 2) {

                // The number of plays given by ADD_SCENE's arg3 (a positive
                // value)
                if (thread.sceneIterations) {
                    thread.sceneIterations--;
                    thread.isRunning = 1;
                    thread.ip = ttmFindTag(ttmSlots[thread.sceneSlot], thread.sceneTag);
                }

                // Is there one (or more) IF_LASTPLAYED for this thread?
                else {
                    adsStopScene(i);
                    if (!adsStopRequested)
                        adsPlayTriggeredChunks(data, thread.sceneSlot, thread.sceneTag);
                }
            }
        });
    }

    // Skipped: stop what's still running. skipScene stays set to skip the
    // walk to the next scene (or the fade out) too, and is cleared there
    if (ev.skipScene)
        ttmThreads.forEach((thread, i) => {
            if (thread.isRunning)
                adsStopScene(i);
        });

    for (const slot of ttmSlots)
        ttmResetSlot(slot);

    grRestoreZone();
}


export async function adsPlayIntro() {
    adsSetNowPlaying('intro', null, 0, 0);
    grLoadScreen('INTRO.SCR');
    gr.updateDelay = 100;
    await grUpdateDisplay(ttmThreads, null);
    await grFadeOut();
    ttmResetSlot(ttmSlots[0]);
}


// The background thread (animated waves), drawing the island, and the
// holiday layer and thread
export function adsInitIsland() {
    ttmInitSlot(ttmBackgroundSlot);

    ttmBackgroundThread.isRunning = 3;
    ttmBackgroundThread.delay = 40;
    ttmBackgroundThread.timer = 0;

    islandInit(ttmBackgroundThread);

    ttmInitSlot(ttmHolidaySlot);

    ttmHolidayThread.isRunning = 0;
    ttmHolidayThread.delay = 0;
    ttmHolidayThread.timer = 0;

    islandInitHoliday(ttmHolidayThread);
}


export function adsReleaseIsland() {
    ttmBackgroundThread.isRunning = 0;
    ttmResetSlot(ttmBackgroundSlot);

    if (ttmHolidayThread.isRunning) {
        ttmHolidayThread.isRunning = 0;
        ttmHolidayThread.ttmLayer = null;
    }
}


export function adsNoIsland() {
    gr.dx = gr.dy = 0;
    grInitEmptyBackground();
}


export async function adsPlayWalk(fromSpot: number, fromHdg: number, toSpot: number, toHdg: number) {
    adsSetNowPlaying('walk', null, 0, 0);
    adsAddScene(0, 0, 0);
    grLoadBmp(ttmSlots[0], 0, 'JOHNWALK.BMP');

    gr.dx = islandState.xPos;
    gr.dy = islandState.yPos;

    const walker = ttmThreads[0];
    walker.timer = walker.delay = 6;

    walkInit(fromSpot, fromHdg, toSpot, toHdg);

    walker.delay = walkAnimate(walker, ttmBackgroundThread.ttmSlot);

    // Skipping during the walk goes straight to the next scene
    while (walker.delay && !ev.skipScene) {

        if (!ttmBackgroundThread.timer) {
            ttmBackgroundThread.timer = ttmBackgroundThread.delay;
            islandAnimate(ttmBackgroundThread);
        }

        if (!walker.timer)
            walker.timer = walker.delay = walkAnimate(walker, ttmBackgroundThread.ttmSlot);

        await grUpdateDisplay(ttmThreads, ttmHolidayThread);

        // The shorter timer of the two threads
        const mini = Math.min(ttmBackgroundThread.timer, walker.timer);

        ttmBackgroundThread.timer -= mini;
        walker.timer -= mini;

        gr.updateDelay = mini;
    }

    ev.skipScene = false;
    adsStopScene(0);
}
