# Speedtest

Qx marketplace port of the Raycast [Speedtest](https://www.raycast.com/tonka3000/speedtest) extension.

Authors: **tonka3000**, **mcxen**. Original Raycast contributors: koayon, pernielsentikaer, stevensd2m, aliaksandr_zhebit, xilopaint, alexi.build, luarmr.

Upstream snapshot: [`2e9c66f0bbc014643d6f9d7bd42ec7cd26bb3384`](https://github.com/raycast/extensions/tree/2e9c66f0bbc014643d6f9d7bd42ec7cd26bb3384/extensions/speedtest)

Requires Qx 0.6.54 or newer for the host-rendered Workbench chart port.

## What it does

Opens a Workbench panel, downloads the official [speedtest.net CLI](https://www.speedtest.net/apps/cli) on first run (SHA-256 verified), then measures:

- Download and upload bandwidth
- Idle latency, jitter, and packet loss
- Loaded latency on download/upload
- Voice / video / streaming quality from the same thresholds as the source extension
- Ookla result URL

Live CLI JSONL events drive the list, Island progress, and download/upload sample charts. Charts only plot real samples.

## Actions

- Restart (`⌘R` / `Ctrl+R`)
- Open results in the browser
- Copy summary / current section
- Clear CLI cache (type `YES`)

## License agreements

Starting this panel automatically passes `--accept-license --accept-gdpr` to the official CLI, matching the Raycast extension.

- [Ookla terms of use](https://www.speedtest.net/about/terms)
- [EULA](https://www.speedtest.net/about/eula)
- [GDPR DPA](https://www.speedtest.net/gdpr-dpa)

Do not open the panel if you do not agree.

Ookla rate-limits the CLI. Frequent tests from the same network return a wait-and-retry message.

## Not ported

The Raycast SVG speedometer and macOS QuickLook meter-image export are host-chrome-incompatible. Qx shows the same metrics in Workbench plus a line chart of real bandwidth samples.
