// The landing page: Johnny in the hero, and its controls

import { controls, startEngine, type NowPlaying } from './engine/engine';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const hero = $('johnny');
const stage = hero.querySelector<HTMLElement>('.stage')!;
const canvas = $<HTMLCanvasElement>('screen');
const loading = $('loading');
const nowPlayingEl = $('now-playing');
const pauseButton = $<HTMLButtonElement>('pause');
const nextButton = $<HTMLButtonElement>('next');
const soundButton = $<HTMLButtonElement>('sound');
const fullscreenButton = $<HTMLButtonElement>('fullscreen');
const daySelect = $<HTMLSelectElement>('day');

const SOUND_KEY = 'stranded.sound';


// What the scenes are, by ADS script, and by tag where it says more
const SCENES: Record<string, { name: string; tags?: Record<number, string> }> = {
    'ACTIVITY.ADS': { name: 'Passing the time', tags: {
        1: 'Diving', 4: 'Diving', 5: 'A visit from the natives', 9: 'A visit from the natives',
        6: 'Reading', 7: 'Reading', 10: 'Reading', 12: 'Reading', 8: 'Taking a bath', 11: 'Taking a bath',
    } },
    'BUILDING.ADS': { name: 'Making do', tags: {
        1: 'Building a sandcastle', 2: 'The Lilliputians', 4: 'The Lilliputians', 6: 'The Lilliputians',
        3: 'Taking a nap', 5: 'Building a fire', 9: 'Building a fire', 7: 'Dinner time', 8: 'Dinner time',
    } },
    'FISHING.ADS': { name: 'Fishing', tags: { 3: 'The eight-armed menace' } },
    'JOHNNY.ADS': { name: 'Johnny', tags: {
        1: 'The end', 2: 'A message in a bottle', 3: 'The last message', 4: 'Finding a bottle',
        5: 'Throwing a bottle', 6: 'Meanwhile, at work',
    } },
    'MARY.ADS': { name: 'Mary', tags: {
        1: 'The date', 2: 'Johnny glimpses Mary', 3: 'Johnny asks Mary out',
        4: 'Johnny and Mary break up', 5: 'Johnny leaves',
    } },
    'MISCGAG.ADS': { name: 'Island life', tags: { 1: 'Hot summer days', 2: 'Shark!' } },
    'STAND.ADS': { name: 'Taking in the view', tags: { 15: 'Looking through the telescope', 16: 'Looking through the telescope' } },
    'SUZY.ADS': { name: 'Suzy', tags: { 1: 'Suzy in the city', 2: 'Johnny meets Suzy' } },
    'VISITOR.ADS': { name: 'Visitors', tags: { 3: 'A ship goes by', 4: 'Coconuts', 6: 'Coconuts', 7: 'Coconuts' } },
    'WALKSTUF.ADS': { name: 'Out and about', tags: { 2: 'Working on the raft', 3: 'Jogging' } },
};

function describe(np: NowPlaying) {
    switch (np.activity) {
        case 'walk':
            return 'Walking';
        case 'scene': {
            const scene = SCENES[np.adsName];
            return scene?.tags?.[np.adsTag] ?? scene?.name ?? np.description;
        }
        default:
            return '';
    }
}

function showNowPlaying(np: NowPlaying) {
    const what = describe(np);
    nowPlayingEl.textContent = what ? `Day ${controls.storyDay} · ${what}` : '';
    daySelect.value = String(controls.storyDay);
}


// Playback

function updateButtons() {
    pauseButton.setAttribute('aria-pressed', String(controls.paused));
    pauseButton.setAttribute('aria-label', controls.paused ? 'Play' : 'Pause');
    pauseButton.title = controls.paused ? 'Play (Space)' : 'Pause (Space)';
    soundButton.setAttribute('aria-pressed', String(controls.soundEnabled));
    soundButton.setAttribute('aria-label', controls.soundEnabled ? 'Turn sound off' : 'Turn sound on');
}

function togglePause() {
    controls.togglePause();
    updateButtons();
}

function toggleSound() {
    controls.setSoundEnabled(!controls.soundEnabled);
    try {
        localStorage.setItem(SOUND_KEY, controls.soundEnabled ? '1' : '0');
    }
    catch {
        // Not remembered then
    }
    updateButtons();
}

function toggleFullscreen() {
    if (document.fullscreenElement)
        document.exitFullscreen();
    else
        stage.requestFullscreen?.().then(() => stage.focus()).catch(() => {});
}

pauseButton.addEventListener('click', togglePause);
nextButton.addEventListener('click', () => controls.nextScene());
soundButton.addEventListener('click', toggleSound);
fullscreenButton.addEventListener('click', toggleFullscreen);

if (!document.fullscreenEnabled)
    fullscreenButton.hidden = true;

for (let day = 1; day <= 11; day++)
    daySelect.add(new Option(String(day), String(day)));

// A day's own scenes come up from the next scene on
daySelect.addEventListener('change', () => {
    controls.setStoryDay(Number(daySelect.value));
    controls.nextScene();
});


// The keys, while Johnny has the focus (or is full screen), as on the Pi
stage.addEventListener('keydown', e => {
    if (e.target !== stage || e.metaKey || e.ctrlKey || e.altKey)
        return;

    switch (e.key) {
        case ' ':
            togglePause();
            break;
        case 'Enter':
            controls.step();
            break;
        case 'n':
        case 'N':
            controls.nextScene();
            break;
        case 'm':
        case 'M':
            controls.toggleMaxSpeed();
            break;
        case 'f':
        case 'F':
            toggleFullscreen();
            break;
        default:
            return;
    }

    e.preventDefault();
});

stage.addEventListener('pointerdown', e => {
    if (e.target === canvas)
        stage.focus({ preventScroll: true });
});


// Once Johnny's been watched for a while without moving, the overlays fade
// out of his way, and come back on the next move

let idleTimer = 0;

function wakeUp() {
    hero.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => hero.classList.add('idle'), 9000);
}

for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin'])
    hero.addEventListener(type, wakeUp);

// Not while scrolled away from it, so that it's all there on the way back
window.addEventListener('scroll', () => {
    if (window.scrollY > 0)
        wakeUp();
}, { passive: true });


async function main() {
    let soundWanted = false;
    try {
        soundWanted = localStorage.getItem(SOUND_KEY) === '1';
    }
    catch {
        // Off then
    }

    try {
        await startEngine({
            canvas,
            assetsUrl: new URL(import.meta.env.VITE_ASSETS_URL ?? 'data/', document.baseURI).href,
            aspect: () => ({ width: stage.clientWidth, height: stage.clientHeight }),
            onNowPlaying: showNowPlaying,
        });
    }
    catch (e) {
        console.error(e);
        loading.textContent = "Johnny couldn't make it ashore. The game's data files didn't load.";
        return;
    }

    // Browsers only start sound after a click or a key press: until then,
    // it's on but silent
    controls.setSoundEnabled(soundWanted);
    updateButtons();

    loading.classList.add('done');
    wakeUp();
}

main();
