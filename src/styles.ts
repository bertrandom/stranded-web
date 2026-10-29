// The player's own styles, added to the page once. Everything is under
// .stranded-player, so that it doesn't affect the rest of the page

const CSS = `
.stranded-player {
  overflow: hidden;
  background: #000;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.stranded-player > canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.stranded-player.stranded-idle:fullscreen { cursor: none; }

.stranded-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 16px;
  padding: 40px 16px 14px;
  background: linear-gradient(transparent, rgba(0, 0, 0, .5));
  color: #fff;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: none;
  transition: opacity .6s;
}

.stranded-bar > * { pointer-events: auto; }

.stranded-player.stranded-idle .stranded-bar { opacity: 0; }
.stranded-player.stranded-idle .stranded-bar > * { pointer-events: none; }

.stranded-caption {
  margin: 0 auto 10px 4px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: .02em;
  color: rgba(255, 255, 255, .85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, .6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.stranded-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(0, 0, 0, .45);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  flex: none;
}

.stranded-buttons button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.stranded-buttons button:hover { background: rgba(255, 255, 255, .14); }
.stranded-buttons button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.stranded-buttons button[hidden] { display: none; }

.stranded-buttons svg { width: 22px; height: 22px; fill: currentColor; }

.stranded-buttons [data-on] > :last-child,
.stranded-buttons [aria-pressed="true"][data-on] > :first-child { display: none; }
.stranded-buttons [aria-pressed="true"][data-on] > :last-child { display: block; }

.stranded-day {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px 0 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, .8);
}

.stranded-day select {
  -webkit-appearance: none;
  appearance: none;
  border: 0;
  border-radius: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, .14);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.stranded-day select option { color: #000; }

@media (max-width: 520px) {
  .stranded-bar { padding: 28px 8px 8px; }
  .stranded-caption { display: none; }
  .stranded-buttons button { width: 34px; height: 34px; }
}
`;

let injected = false;

export function injectStyles() {
    if (injected)
        return;

    const style = document.createElement('style');
    style.dataset.stranded = '';
    style.textContent = CSS;
    document.head.prepend(style);     // first, so that the page can override it
    injected = true;
}
