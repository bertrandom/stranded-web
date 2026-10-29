# stranded-web

Johnny Castaway in the browser, and the landing page for [stranded-pi](https://github.com/bertrandom/stranded-pi).

It's a TypeScript port of [stranded](https://github.com/bertrandom/stranded)'s engine, itself a fork of Jérémie Guillaume's [Johnny Reborn](https://github.com/jno6809/jc_reborn). It draws on a `<canvas>` that spans the whole width of the window, and widens the picture as stranded does on a widescreen display: the open ocean scenes extend their ocean and sky to the edges.

## Running it

    npm install
    npm run extract -- <directory with RESOURCE.MAP>
    npm run dev

`npm run build` writes the site to `dist`, ready for any static host.

## The game's data

The original game's data files aren't in this repository. `npm run extract` reads `RESOURCE.MAP`, `RESOURCE.001` and the `sound*.wav` files (the same ones stranded uses, see [its README](https://github.com/bertrandom/stranded#data-files)) and writes what the page loads to `public/data`:

| File | What |
| --- | --- |
| `manifest.json` | The palette, the ADS and TTM scripts (uncompressed), and where each sprite is in its sheet |
| `scr/*.png` | The backgrounds |
| `bmp/*.png` | The sprites, one sheet per BMP |
| `sounds/*.wav` | The sounds, as they are |

The PNGs are 4-bit with the game's 16-color palette, so they hold the original pixels exactly; the page decodes them itself rather than through a canvas, which could alter colors. About 1.6 MB in all.

To serve the data from somewhere else, build with `VITE_ASSETS_URL` set to its URL (with a trailing slash). That host needs to allow the page's origin with CORS.

## How the port is organized

`src/engine` follows stranded's C files: `ads.ts`, `ttm.ts`, `graphics.ts`, `island.ts`, `walk.ts` (with `calcpath.c`), `story.ts`, `sound.ts` and `events.ts`. `src/data` holds the tables from its `*_data.h` headers. The C engine waits in blocking loops; here, the loops are `async` and waiting yields to the browser, so the structure stays the same. SDL's surfaces become `Surface` (`surface.ts`), with the same clipping and color key behavior.

What's left out, being for the Pi: the web server and API, night mode, and the settings file. The story's progress is kept in the browser's local storage instead.

## Keys

With the picture selected: Space pauses, Return steps a frame while paused, N skips to the next scene, M toggles max speed, F goes full screen.

## License

GPL v3 or later, as stranded and Johnny Reborn.
