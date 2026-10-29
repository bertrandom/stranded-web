// Ported from stranded's story.c: which scenes are played, and in which
// order. The story advances by a day each day, as saved in the browser

import {
    FINAL, FIRST, HOLIDAY_NOK, ISLAND, LEFT_ISLAND, LOWTIDE_OK, NORAFT, storyScenes, VARPOS_OK, type StoryScene,
} from '../data/storyData';
import { adsInit, adsInitIsland, adsNoIsland, adsPlay, adsPlayIntro, adsPlayWalk, adsReleaseIsland, adsSetNowPlaying } from './ads';
import { grFadeOut } from './graphics';
import { islandState } from './island';
import { soundPlay } from './sound';
import { ttm } from './ttm';
import { debugMsg, getDayOfYear, getMonthAndDay, rand } from './utils';


const STORAGE_KEY = 'stranded.story';

export const story = { currentDay: 1 };

// Called between scenes, eg. to follow the page's size
export const storyHooks = { beforeScene: () => {} };


function storyPickScene(wantedFlags: number, unwantedFlags: number) {
    const scenes = storyScenes.filter(scene =>
        (scene.flags & wantedFlags) === wantedFlags
        && !(scene.flags & unwantedFlags)
        && (scene.dayNo === 0 || scene.dayNo === story.currentDay));

    return scenes[rand(scenes.length)];
}


function load(): { currentDay: number; date: number } {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
        if (typeof saved?.currentDay === 'number' && typeof saved?.date === 'number')
            return saved;
    }
    catch {
        // Nothing saved, or storage isn't available
    }

    return { currentDay: 1, date: -1 };
}


function save(state: { currentDay: number; date: number }) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch {
        // Then the story starts over next time
    }
}


function storyUpdateCurrentDay() {
    const state = load();
    const today = getDayOfYear();
    let hasChanged = false;

    if (state.date === -1) {
        debugMsg('First known date of the story');
        state.date = today;
        hasChanged = true;
    }
    else if (today !== state.date) {
        debugMsg('The date has changed since the last sequence -> next day of the story');
        state.date = today;
        state.currentDay += 1;
        hasChanged = true;
    }

    if (state.currentDay < 1 || state.currentDay > 11) {
        state.currentDay = 1;
        hasChanged = true;
    }

    if (hasChanged)
        save(state);

    story.currentDay = state.currentDay;
    debugMsg(`The day of the story is: ${story.currentDay}`);
}


// Takes effect at the next scene
export function storySetDay(day: number) {
    save({ ...load(), currentDay: day });
    story.currentDay = day;
}


function storyCalculateIslandFromDateAndTime() {
    // Night?
    const hour = new Date().getHours() % 8;
    islandState.night = hour === 0 || hour === 7;

    // Holidays?
    const date = getMonthAndDay();

    if ('1028' < date && date < '1101')         // Halloween: 29/10 to 31/10
        islandState.holiday = 1;
    else if ('0314' < date && date < '0318')    // St Patrick: 15/03 to 17/03
        islandState.holiday = 2;
    else if ('1222' < date && date < '1226')    // Christmas: 23/12 to 25/12
        islandState.holiday = 3;
    else if ('1228' < date || date < '0102')    // New year: 29/12 to 01/01
        islandState.holiday = 4;
    else
        islandState.holiday = 0;
}


function storyCalculateIslandFromScene(scene: StoryScene) {
    // Low tide?
    islandState.lowTide = Boolean(scene.flags & LOWTIDE_OK) && rand(2) === 1;

    // Randomize the position of the island
    if (scene.flags & VARPOS_OK) {
        if (rand(2)) {
            islandState.xPos = -222 + rand(109);
            islandState.yPos = -44 + rand(128);
        }
        else if (rand(2)) {
            islandState.xPos = -114 + rand(134);
            islandState.yPos = -14 + rand(99);
        }
        else {
            islandState.xPos = -114 + rand(119);
            islandState.yPos = -73 + rand(60);
        }
    }
    else if (scene.flags & LEFT_ISLAND) {
        islandState.xPos = -272;
        islandState.yPos = 0;
    }
    else {
        islandState.xPos = 0;
        islandState.yPos = 0;
    }

    // How much of the raft was Johnny able to build?
    if (scene.flags & NORAFT)
        islandState.raft = 0;
    else if (story.currentDay <= 2)
        islandState.raft = 1;
    else if (story.currentDay <= 5)
        islandState.raft = story.currentDay - 1;
    else
        islandState.raft = 5;

    // For VISITOR.ADS#3 (the cargo), never show holiday items, or they'd be
    // drawn over the hull when it fills the screen at the end. As the
    // original does
    if (scene.flags & HOLIDAY_NOK)
        islandState.holiday = 0;
}


async function playScene(scene: StoryScene) {
    if (scene.dayNo)
        soundPlay(0);

    adsSetNowPlaying('scene', scene.adsName, scene.adsTagNo, scene.dayNo);
    await adsPlay(scene.adsName, scene.adsTagNo);
}


export async function storyPlay() {
    adsInit();
    storyUpdateCurrentDay();    // so that the day is known during the intro
    await adsPlayIntro();

    while (true) {
        storyHooks.beforeScene();
        storyUpdateCurrentDay();
        storyCalculateIslandFromDateAndTime();
        let unwantedFlags = 0;

        const finalScene = storyPickScene(FINAL, unwantedFlags);

        if (finalScene.flags & ISLAND) {
            storyCalculateIslandFromScene(finalScene);
            adsInitIsland();
        }
        else {
            adsNoIsland();
        }

        let prevSpot = -1;
        let prevHdg = -1;

        if (!(finalScene.flags & FIRST)) {
            let wantedFlags = 0;
            unwantedFlags |= FINAL;

            if (islandState.lowTide)
                wantedFlags |= LOWTIDE_OK;

            if (islandState.xPos || islandState.yPos)
                wantedFlags |= VARPOS_OK;

            for (let i = 0, n = 6 + rand(14); i < n; i++) {
                const scene = storyPickScene(wantedFlags, unwantedFlags);

                if (prevSpot !== -1)
                    await adsPlayWalk(prevSpot, prevHdg, scene.spotStart, scene.hdgStart);

                ttm.dx = islandState.xPos + (scene.flags & LEFT_ISLAND ? 272 : 0);
                ttm.dy = islandState.yPos;

                await playScene(scene);

                unwantedFlags |= FIRST;
                prevSpot = scene.spotEnd;
                prevHdg = scene.hdgEnd;
            }
        }

        if (prevSpot !== -1)
            await adsPlayWalk(prevSpot, prevHdg, finalScene.spotStart, finalScene.hdgStart);

        if (finalScene.flags & ISLAND) {
            ttm.dx = islandState.xPos + (finalScene.flags & LEFT_ISLAND ? 272 : 0);
            ttm.dy = islandState.yPos;
        }
        else {
            ttm.dx = ttm.dy = 0;
        }

        await playScene(finalScene);
        await grFadeOut();

        if (finalScene.flags & ISLAND)
            adsReleaseIsland();
    }
}
