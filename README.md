# xVIZ

A browser music visualizer with glossy Y2K controls, ten hand-styled themes, and a **Studio** of gradient-driven visualizers you can color and stack effects on.

## Themes

Each theme has three modes: **Orbit** (a ring shaped by the spectrum), **Scope** (the live waveform), and **Kaleido** (the waveform folded into eight mirrored petals).

| # | Theme | Look |
| --- | --- | --- |
| 1 | Y2K Chrome | Liquid-metal blob, iridescent sweep, sparkle stars |
| 2 | Frutiger Aero | Sky, glass bubbles, green hills, lens flare |
| 3 | Cybercore | Neon grid floor, striped sun, glyph rain, beat glitches |
| 4 | Indie Sleaze | On-camera flash, film grain, marker scrawls, date stamp |
| 5 | Underground | Concrete, halftone rings rippling out from the bass, warning tape, strobe |
| 6 | Amp '98 | After Winamp: beveled skin window, LED-dot orbit and scope, scrolling title, time readout |
| 7 | Liquid Warp | After MilkDrop: per-frame feedback zoom and rotation with drifting hue, so every shape smears into tunnels |
| 8 | Magnet Cloud | After iTunes' Magnetosphere: 1,500 particles pulled by bass, mid and treble poles, burst on beats |
| 9 | Bass Halo | After Trap Nation: layered rings around the cover art, bass shake, flying dust, blurred art backdrop |
| 10 | Clean Cut | After Monstercat: flat colour per track, crisp white line work, big uppercase artist and title |

Turn on **Shuffle** to switch to a new look every 30 seconds, timed to a beat when music is playing.

## Sync: make the visuals follow the music

Open the **Sync** tab (or press Y). It shows a live view of what xVIZ hears, with lamps that light on every detected **Kick**, **Snare**, **Hi-hat** and **Drop**, plus the detected BPM.

**Feel** presets set everything at once: Chill, Balanced, Punchy, Bass heavy and Vocal.

| Slider | What it does |
| --- | --- |
| Overall gain | How big everything moves (same as Gain in the bottom bar) |
| Bass, Mids, Highs | Boost or cut each part of the sound before the visuals see it |
| Attack | How fast visuals jump on a hit (high = instant) |
| Decay | How long they hang before falling (low = tight and snappy) |
| Beat sensitivity | Low catches only big hits, high catches every tick |
| Beat punch | How hard each kick hits the visuals |
| Motion speed | Overall speed. Motion always runs on an audio clock, so it races in loud, busy passages and slows almost to a stop in quiet ones |

What drives what:
- **Kicks:** pulses, zooms and particle bursts.
- **Snares:** jolt the rotation, alternating direction, and re-shape the flow fields and ribbons.
- **Hi-hats:** sparkles and ripples.
- **Drops:** a sudden jump in loudness triggers a bigger burst and, with Color cycle on, a color shift.

**Add-ons:**
- **Beat lock:** once the tempo is known, pulses run on a phase-locked grid that real kicks keep in time, so missed or doubled hits don't break the rhythm.
- **Auto sensitivity:** steers the beat threshold so detected kicks track the tempo.
- **Contrast:** makes quiet parts calmer and loud hits pop.
- **Latency offset** (0–400 ms): delays the visuals to match sound that reaches you late, such as Bluetooth speakers and headphones (usually 150–250 ms).

Settings are saved per device.

## Studio

Open it with the **Colors** button in the top bar or the **Studio** tab. Every Studio visualizer draws with your gradient.

| Visualizer | Look |
| --- | --- |
| Nebula | 1,200-particle galaxy that swells with the bass |
| Particle Dance | 280 dancers spring between formations (ring, flower, star, figure eight, spiral, grid, wave). Kicks throw them out, snares twist them, drops switch formation |
| Polar Curves | Layered rose and spirograph curves; snares morph the petal count |
| Wavy Form | A rolling 3-D sea of lines; the sound rolls toward you as swells |
| Starfield | Hyperspace streaks that surge on every kick |
| Ripples | Kicks, snares and hi-hats each drop their own ripple |
| Fractal Tree | Six branching arms that open with the mids |
| Plasma | Classic demoscene plasma mapped onto your gradient |
| Ridges | Stacked pulsar lines scrolling back in time, like the classic album cover |
| Tunnel | Rings rushing toward you, warped by the spectrum |
| Sunflower | 720 golden-angle seeds that grow per frequency |
| Silk | Translucent ribbons for bass, mids and highs |
| Blob | Five layered liquid shapes |
| Polygons | Nested shapes counter-rotating on the beat |
| Flow | 800 particles drifting through a moving current |
| Orbitals | XY scope loops in three rotated copies |

**Colors:** pick one of 12 gradients, edit up to six color stops with the color pickers, add or remove stops, **Random** for a generated harmonious palette (or press R), and **Reverse**. The background can be **Deep** (a dark tint of your first color), **Black**, or **Wash** (a dim version of the whole gradient).

**Effects** stack in any combination, and each one shows a strength slider when it's on: Bloom, Trails, Beat zoom, Warp (MilkDrop-style feedback), Bass shake, Mirror, Quad mirror, Kaleidoscope (4–12 wedges), RGB split, Glitch, Pixelate, Scanlines, Film grain, Vignette, Hue pop, Strobe and Color cycle. Strobe follows **Settings → Flash and strobe effects** and is capped at about 2.5 flashes a second.

**Shape** sliders: Size, Density, Thickness, Speed, Complexity and Reactivity. **Color grade**: Brightness, Saturation and Hue shift. **Surprise me** picks a random visualizer, palette and effect stack.

**Presets:** 15 built-in looks, plus **Save** for your own. **Copy mine** gives a share code (`XV1.…`) that anyone can paste into **Load**. On the full app you can also open a look directly with `?look=XV1.…` in the URL.

No build step and no dependencies. Plain HTML, CSS, and JavaScript.

## Use it online (recommended)

When xVIZ is published on GitHub Pages, open its address in Chrome or Edge and click the **install** icon in the address bar to add it as an app. There's nothing to download or run. Every update reaches you automatically: an **A new version of xVIZ is ready** bar appears, and **Update now** reloads into it. **Settings → About** shows your version and has **Check for updates**.

For Spotify on the hosted version, add the site address (for example `https://<you>.github.io/xviz/`) to your Spotify app's Redirect URIs. **Settings** shows the exact value.

### Publishing an update

1. Change the files.
2. Run `node scripts/release.mjs` (or `npm run release`) to bump `version.json`.
3. Commit and push to `main`.

The workflow in `.github/workflows/pages.yml` deploys the site, and every open copy offers the update. A service worker fetches fresh files first and falls back to the last copy when you're offline.

## Run it on your computer

```bash
node server.mjs        # or: npm start
```

Open **http://127.0.0.1:5173/**. Use `127.0.0.1`, not `localhost`, because Spotify only accepts loopback IP redirect URIs.

## Sound sources

| Source | What it does |
| --- | --- |
| Demo beats | Three built-in synth loops. Works right away. |
| Audio files | Pick one or more local files. Name them `Artist - Title.mp3` to get artist and title in the deck. |
| Spotify | Signs in, shows the current track and album art, and controls play, pause, and skip on your active Spotify device. |
| Apple Music | Signs in, searches the catalog, and plays songs in this tab with full transport control. |
| Tab or system audio | Captures a browser tab's sound, or the whole system's sound on Windows and ChromeOS, so the visuals follow whatever is playing. |
| Microphone | Listens to the room. |

### Why streaming needs "Capture sound"

Spotify and Apple Music stream DRM-protected audio. Browsers will not let any web app read those samples, and Spotify closed its audio-analysis API to new apps in November 2024. So the connection gives you track info and controls, and the visuals hear the music through capture:

- **Spotify:** play in the Spotify web player (open.spotify.com) in another tab, then click **Tab or system audio**, pick that tab, and tick **Share tab audio**. With the Spotify desktop app on Windows, share your **entire screen** and tick **Share system audio**. On macOS, browsers cannot capture system audio, so use the web player tab or the microphone.
- **Apple Music:** songs play inside the visualizer's own tab. Click **Tab or system audio** and choose **this tab**.

Chrome and Edge support tab audio capture. Firefox and Safari do not, so use the microphone there.

## Spotify setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Redirect URIs**, add `http://127.0.0.1:5173/`. The app's **Settings** tab shows the exact value.
3. Tick **Web API**, save, and copy the **Client ID**.
4. In the visualizer, open **Settings**, paste the Client ID, and click **Save**.
5. Open **Source** and click **Spotify**. While your app is in Development Mode, add each listener's Spotify account under **User Management** in the dashboard.

Sign-in uses PKCE, so there is no client secret. Play, pause, and skip need Spotify Premium. Track info works on any plan.

## Apple Music setup

You need an Apple Developer Program membership and an Apple Music subscription.

1. In [developer.apple.com/account](https://developer.apple.com/account), go to **Certificates, Identifiers & Profiles → Identifiers** and create a **Media ID** with MusicKit enabled.
2. Under **Keys**, create a key with **Media Services (MusicKit)** enabled. Download the `.p8` file and note the **Key ID** and your **Team ID**.
3. Generate a developer token (valid up to 180 days):

   ```bash
   node scripts/apple-token.mjs <TEAM_ID> <KEY_ID> path/to/AuthKey_<KEY_ID>.p8
   ```

4. Paste the token into **Settings → Apple Music → Developer token** and click **Save**.
5. Click **Apple Music**, sign in, and search for a song.

Keep the `.p8` file private. If you host this publicly, generate the token from a small server endpoint instead of pasting it into the page.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play or pause |
| ← / → | Previous or next track |
| [ / ] | Previous or next theme (or Studio visualizer) |
| 1–9, 0 | Jump to a theme |
| M | Cycle Orbit, Scope, Kaleido |
| V | Next Studio visualizer |
| C | Colors and gradients |
| R | Random gradient |
| Y | Open Sync |
| S | Shuffle on or off |
| P | Save the current frame as a PNG |
| T | Open the theme picker |
| F | Fullscreen |
| H | Hide controls (tap the stage to bring them back) |
| ? | Show shortcuts |

Controls also fade out after a few idle seconds while music plays. Turn that off under **Settings**.

## Also built in

- **Beat and tempo detection:** separate spectral-flux detectors for kick (35–150 Hz), snare (1.5–5 kHz) and hi-hat (7–14 kHz), each against its own adaptive threshold. The BPM is voted from every pair of recent kicks, so off-beat hits don't throw it.
- **Auto gain** keeps quiet songs and the microphone lively. Turn it off in **Sync**.
- **Stable scope:** the waveform starts at a rising zero crossing, so it holds still instead of jittering.
- **Media keys and lock screen:** play, pause, skip and seek from your keyboard, headphones or phone lock screen.
- **Screen stays awake** while music plays.
- **Drag and drop** audio files anywhere on the page.
- **Smooth switching:** themes and visualizers crossfade.
- **Adaptive quality:** drops to 1x resolution if a device can't keep up.

## Flash safety

Indie Sleaze and Underground flash on bass hits. Flashes are capped at about 2.5 per second, are off by default when your system asks for reduced motion, and can be turned off under **Settings → Flash and strobe effects**.

## Files

```
index.html          page and controls
styles.css          Y2K button skins and per-theme tokens
js/audio.js         analyser, demo synth, file player
js/themes.js        the ten theme renderers
js/studio.js        Studio visualizers, gradients, effects, presets
version.json        current version; bump it to announce an update
sw.js               service worker (fresh files first, offline fallback)
manifest.webmanifest, icons/   installable app
.github/workflows/pages.yml    deploys to GitHub Pages on push
scripts/release.mjs bumps version.json
js/spotify.js       Spotify PKCE sign-in, now playing, controls
js/apple.js         MusicKit JS sign-in, search, playback
js/app.js           wiring, render loop, keyboard
server.mjs          local static server
scripts/apple-token.mjs   Apple Music developer token generator
```
