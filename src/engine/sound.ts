// Ported from stranded's sound.c: one sound at a time, a new one replacing
// the one playing. Browsers only let sound start after the page is clicked
// or a key is pressed, so the AudioContext is resumed then

import { assets } from './assets';
import { debugMsg } from './utils';

let context: AudioContext | null = null;
const buffers = new Map<number, AudioBuffer>();
let current: AudioBufferSourceNode | null = null;

export const sound = { enabled: false };


export async function soundInit() {
    if (typeof AudioContext === 'undefined')
        return;

    context = new AudioContext();

    await Promise.all([...assets.sounds].map(async ([no, data]) => {
        try {
            buffers.set(no, await context!.decodeAudioData(data.slice(0)));
        }
        catch (e) {
            debugMsg(`Couldn't decode sound #${no}`, e);
        }
    }));

    const resume = () => {
        if (context?.state === 'suspended' && sound.enabled)
            context.resume();
    };

    for (const type of ['pointerdown', 'keydown'])
        window.addEventListener(type, resume, { capture: true });
}


export function setSoundEnabled(enabled: boolean) {
    sound.enabled = enabled;

    if (enabled)
        context?.resume();
    else
        current?.stop();
}


export function soundPlay(nb: number) {
    if (!sound.enabled || !context || context.state !== 'running')
        return;

    const buffer = buffers.get(nb);

    if (!buffer) {
        debugMsg(`Non-existent sound sample #${nb}`);
        return;
    }

    current?.stop();
    current = context.createBufferSource();
    current.buffer = buffer;
    current.connect(context.destination);
    current.start();
}
