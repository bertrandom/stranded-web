// Ported from stranded's events.c: the timing of frames, and the actions
// that control playback. Waiting yields to the browser instead of blocking

export const ev = {
    paused: false,
    maxSpeed: false,
    skipScene: false,   // set to end the current scene and play the next one
};

let lastTicks = performance.now();
let lastYield = performance.now();
let oneFrame = false;
let wake: (() => void) | null = null;


function sleep(ms: number) {
    return new Promise<void>(resolve => {
        const timeout = setTimeout(done, ms);
        function done() {
            clearTimeout(timeout);
            wake = null;
            resolve();
        }
        wake = done;
    });
}


// Wake a wait up early, so that an action takes effect right away
function interrupt() {
    wake?.();
}


export function eventsInit() {
    lastTicks = performance.now();
}


// Wait until `delay` ticks of 20 ms have passed since the last frame
export async function eventsWaitTick(delay: number) {
    const ms = delay * 20;
    oneFrame = false;

    while (true) {
        const elapsed = performance.now() - lastTicks;

        // Skipping a scene doesn't wait, even when paused
        if (ev.skipScene || !((ev.paused && !oneFrame) || (!ev.maxSpeed && elapsed < ms)))
            break;

        await sleep(ev.paused ? 1000 : ms - elapsed);
        lastYield = performance.now();
    }

    // When frames follow each other without waiting (at max speed, or with
    // no delay), still let the browser draw now and then
    if (performance.now() - lastYield > 15) {
        await sleep(0);
        lastYield = performance.now();
    }

    lastTicks = performance.now();
}


export function togglePause() {
    ev.paused = !ev.paused;
    interrupt();
}

export function setPaused(paused: boolean) {
    ev.paused = paused;
    interrupt();
}

// When paused, advance one frame
export function step() {
    oneFrame = true;
    interrupt();
}

export function toggleMaxSpeed() {
    ev.maxSpeed = !ev.maxSpeed;
    interrupt();
}

export function nextScene() {
    ev.skipScene = true;
    interrupt();
}
