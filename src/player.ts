// A Johnny Castaway player in an element of the page: the canvas, and
// optional controls, keys and full screen

import { controls as engine, startEngine, type NowPlaying } from './engine/engine';
import { describeScene } from './scenes';
import { injectStyles } from './styles';

export interface PlayerOptions {
    // URL of the data made by stranded-extract, eg. "data/". Relative to the
    // page
    data: string | URL;

    // 'fill' widens the picture to the shape of the element, as stranded
    // does on a widescreen display: the open ocean scenes extend to its
    // edges. '4:3' keeps the original picture, letterboxed if needed
    shape?: 'fill' | '4:3';

    // The control bar: pause, next scene, sound, full screen and the day of
    // the story
    controls?: boolean;

    // What's playing, in the control bar
    caption?: boolean;

    // Space, Return, N, M and F, while the player has the focus
    keyboard?: boolean;

    // How long without moving the pointer before the controls fade out, in
    // ms, or false to keep them
    autoHide?: number | false;

    // Whether sound is on, until the visitor changes it. Browsers only
    // play it after a click or a key press on the page
    sound?: boolean;

    // Remember the visitor's choice of sound in the browser
    rememberSound?: boolean;

    // Called with what's on screen, at each change
    onNowPlaying?: (np: PlayerNowPlaying) => void;
}

export interface PlayerNowPlaying extends NowPlaying {
    // In words, eg. "Fishing", or '' during the intro
    title: string;
}

export interface Player {
    readonly element: HTMLElement;
    readonly canvas: HTMLCanvasElement;
    readonly paused: boolean;
    readonly soundEnabled: boolean;
    readonly storyDay: number;
    play(): void;
    pause(): void;
    togglePause(): void;
    // When paused, advance one frame
    step(): void;
    nextScene(): void;
    toggleMaxSpeed(): void;
    setSound(enabled: boolean): void;
    // 1 to 11. Its scenes start with the next one
    setStoryDay(day: number): void;
    toggleFullscreen(): void;
}

const SOUND_KEY = 'stranded.sound';

const ICONS = {
    pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    next: '<path d="M6 5l9 7-9 7zM16 5h3v14h-3z"/>',
    soundOff: '<path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    soundOn: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor" stroke-width="2" fill="none"/>',
};

let created = false;


function icon(paths: string) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}


function loadSoundPreference(fallback: boolean) {
    try {
        const saved = localStorage.getItem(SOUND_KEY);
        return saved === null ? fallback : saved === '1';
    }
    catch {
        return fallback;
    }
}


// Start Johnny in `container`, which the page sizes. There can only be one
// player on a page: the engine, like the original, has a single island
export async function createPlayer(container: HTMLElement, options: PlayerOptions): Promise<Player> {
    if (created)
        throw new Error('There can only be one Johnny Castaway player on a page');
    created = true;

    const {
        shape = 'fill',
        controls = true,
        caption = true,
        keyboard = true,
        autoHide = 3000,
        rememberSound = true,
    } = options;

    injectStyles();

    container.classList.add('stranded-player');
    if (getComputedStyle(container).position === 'static')
        container.style.position = 'relative';

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvas.style.objectFit = shape === 'fill' ? 'cover' : 'contain';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Johnny Castaway, playing');
    container.prepend(canvas);

    let captionEl: HTMLElement | null = null;
    let update = () => {};

    const player: Player = {
        element: container,
        canvas,
        get paused() { return engine.paused; },
        get soundEnabled() { return engine.soundEnabled; },
        get storyDay() { return engine.storyDay; },
        play() { engine.setPaused(false); update(); },
        pause() { engine.setPaused(true); update(); },
        togglePause() { engine.togglePause(); update(); },
        step() { engine.step(); },
        nextScene() { engine.nextScene(); },
        toggleMaxSpeed() { engine.toggleMaxSpeed(); },
        setSound(enabled) {
            engine.setSoundEnabled(enabled);
            if (rememberSound) {
                try {
                    localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
                }
                catch {
                    // Not remembered then
                }
            }
            update();
        },
        setStoryDay(day) {
            engine.setStoryDay(Math.min(11, Math.max(1, Math.round(day))));
            engine.nextScene();
            update();
        },
        toggleFullscreen() {
            if (document.fullscreenElement)
                document.exitFullscreen();
            else
                container.requestFullscreen?.().then(() => container.focus()).catch(() => {});
        },
    };

    if (controls)
        ({ captionEl, update } = addControls(container, player, caption));

    if (keyboard)
        addKeys(container, player);

    if (controls && autoHide !== false)
        addAutoHide(container, autoHide);

    // Should the data not load, the page can try again
    await startEngine({
        canvas,
        assetsUrl: new URL(options.data, document.baseURI).href,
        aspect: () => shape === 'fill'
            ? { width: container.clientWidth, height: container.clientHeight }
            : { width: 4, height: 3 },
        onNowPlaying: np => {
            const now = { ...np, title: describeScene(np) };
            if (captionEl)
                captionEl.textContent = now.title ? `Day ${engine.storyDay} · ${now.title}` : '';
            update();
            options.onNowPlaying?.(now);
        },
    }).catch(e => {
        created = false;
        canvas.remove();
        container.querySelector('.stranded-bar')?.remove();
        throw e;
    });

    engine.setSoundEnabled(rememberSound ? loadSoundPreference(options.sound ?? false) : options.sound ?? false);
    update();

    return player;
}


function addControls(container: HTMLElement, player: Player, withCaption: boolean) {
    const bar = document.createElement('div');
    bar.className = 'stranded-bar';
    bar.innerHTML = `
        ${withCaption ? '<p class="stranded-caption" aria-live="polite"></p>' : ''}
        <div class="stranded-buttons">
          <label class="stranded-day" title="Day of the story">Day <select aria-label="Day of the story"></select> / 11</label>
          <button type="button" data-action="pause" data-on>${icon(ICONS.pause)}${icon(ICONS.play)}</button>
          <button type="button" data-action="next" title="Next scene (N)" aria-label="Next scene">${icon(ICONS.next)}</button>
          <button type="button" data-action="sound" data-on>${icon(ICONS.soundOff)}${icon(ICONS.soundOn)}</button>
          <button type="button" data-action="fullscreen" title="Full screen (F)" aria-label="Full screen">${icon(ICONS.fullscreen)}</button>
        </div>`;
    container.append(bar);

    const button = (action: string) => bar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
    const pause = button('pause');
    const sound = button('sound');
    const day = bar.querySelector('select')!;

    for (let i = 1; i <= 11; i++)
        day.add(new Option(String(i), String(i)));

    pause.addEventListener('click', () => player.togglePause());
    button('next').addEventListener('click', () => player.nextScene());
    sound.addEventListener('click', () => player.setSound(!player.soundEnabled));
    button('fullscreen').addEventListener('click', () => player.toggleFullscreen());
    button('fullscreen').hidden = !document.fullscreenEnabled;
    day.addEventListener('change', () => player.setStoryDay(Number(day.value)));

    const update = () => {
        pause.setAttribute('aria-pressed', String(player.paused));
        pause.setAttribute('aria-label', player.paused ? 'Play' : 'Pause');
        pause.title = player.paused ? 'Play (Space)' : 'Pause (Space)';
        sound.setAttribute('aria-pressed', String(player.soundEnabled));
        sound.setAttribute('aria-label', player.soundEnabled ? 'Turn sound off' : 'Turn sound on');
        sound.title = player.soundEnabled ? 'Sound off' : 'Sound on';
        day.value = String(player.storyDay);
    };

    return { captionEl: bar.querySelector<HTMLElement>('.stranded-caption'), update };
}


// The keys, as on the Pi, while the player has the focus
function addKeys(container: HTMLElement, player: Player) {
    if (!container.hasAttribute('tabindex'))
        container.tabIndex = 0;

    container.addEventListener('keydown', e => {
        if (e.target !== container || e.metaKey || e.ctrlKey || e.altKey)
            return;

        switch (e.key) {
            case ' ': player.togglePause(); break;
            case 'Enter': player.step(); break;
            case 'n': case 'N': player.nextScene(); break;
            case 'm': case 'M': player.toggleMaxSpeed(); break;
            case 'f': case 'F': player.toggleFullscreen(); break;
            default: return;
        }

        e.preventDefault();
    });

    container.addEventListener('pointerdown', e => {
        if (e.target === container || e.target instanceof HTMLCanvasElement)
            container.focus({ preventScroll: true });
    });
}


// Out of Johnny's way after a while, back on the next move
function addAutoHide(container: HTMLElement, delay: number) {
    let timer = 0;

    const wake = () => {
        container.classList.remove('stranded-idle');
        clearTimeout(timer);
        timer = window.setTimeout(() => {
            // Not while a control is being used
            if (!container.querySelector('.stranded-bar :focus-visible, .stranded-bar select:focus'))
                container.classList.add('stranded-idle');
        }, delay);
    };

    for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin'])
        container.addEventListener(type, wake);

    wake();
}
