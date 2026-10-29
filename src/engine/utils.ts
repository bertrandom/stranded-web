// Ported from stranded's utils.c

export const debug = { enabled: false };

export function debugMsg(...args: unknown[]) {
    if (debug.enabled)
        console.debug(...args);
}

// What rand() % n gives in C
export function rand(n: number) {
    return Math.floor(Math.random() * n);
}

// A 16-bit value from the scripts, as the C code's sint16 sees it
export function toS16(v: number) {
    return (v << 16) >> 16;
}

export function toU16(v: number) {
    return v & 0xffff;
}

export function peekUint16(data: Uint8Array, offset: number) {
    return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

export function getDayOfYear(date = new Date()) {
    const start = new Date(date.getFullYear(), 0, 1);
    return Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
                       - start.getTime()) / 86400000);
}

// "MMDD"
export function getMonthAndDay(date = new Date()) {
    return String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
}
