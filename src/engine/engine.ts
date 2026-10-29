// Johnny Castaway, in a <canvas>: what the page uses of the engine

import { nowPlayingListeners, type NowPlaying } from './ads';
import { loadAssets } from './assets';
import { ev, eventsInit, nextScene, setPaused, step, toggleMaxSpeed, togglePause } from './events';
import { gr, graphicsInit, grSetWidth, grWidthFor } from './graphics';
import { setSoundEnabled, sound, soundInit } from './sound';
import { story, storyHooks, storyPlay, storySetDay } from './story';

export type { NowPlaying };

export interface EngineOptions {
    canvas: HTMLCanvasElement;
    assetsUrl: string;
    // The shape of the display, to widen the picture to; checked between
    // scenes
    aspect: () => { width: number; height: number };
    onNowPlaying?: (np: NowPlaying) => void;
}


export async function startEngine(options: EngineOptions) {
    await loadAssets(options.assetsUrl);
    await soundInit();

    const widthNow = () => {
        const { width, height } = options.aspect();
        return width > 0 && height > 0 ? grWidthFor(width, height) : gr.width;
    };

    graphicsInit(options.canvas, widthNow());

    storyHooks.beforeScene = () => {
        const width = widthNow();
        if (width !== gr.width)
            grSetWidth(width);
    };

    if (options.onNowPlaying)
        nowPlayingListeners.push(options.onNowPlaying);

    eventsInit();

    storyPlay().catch(e => console.error('Johnny stopped:', e));
}


export const controls = {
    get paused() { return ev.paused; },
    get maxSpeed() { return ev.maxSpeed; },
    get soundEnabled() { return sound.enabled; },
    get storyDay() { return story.currentDay; },
    togglePause,
    setPaused,
    step,
    toggleMaxSpeed,
    nextScene,
    setSoundEnabled,
    setStoryDay: storySetDay,
};
