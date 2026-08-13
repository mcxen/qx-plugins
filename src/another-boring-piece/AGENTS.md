# Art Wallpapers — Agent Guide

## Attribution

- Preserve manifest author `yevgen_glukhov` and README / notice credits for contributors `alexi.build` and `0xdhrv`.
- Keep `THIRD_PARTY_NOTICES.md` in every package. The upstream package declares MIT.
- This is a Qx-native clean rewrite; never introduce Raycast imports, runtime shims, or converter output.

## Surfaces

- One Workbench panel with `today` and `history` tabs.
- `set-random-art-wallpaper`: real user-triggered no-view command.
- `auto-switch-art-wallpaper`: 30-minute host heartbeat; background changes are opt-in and respect the configured interval.
- No duplicate open-panel or history command.

## Cache invariants

- Catalog uses `another-boring.catalog.v1`: six-hour SWR, validated records, stale fallback.
- Wallpaper bytes use 20 fixed JPEG slots and `another-boring.image-index.v1`; never grow one file per random request.
- History uses `another-boring.history.v1`, is user data rather than rebuildable cache, and is capped at 200 newest events.
- Automatic state and recent ids use `another-boring.auto.v1`; retain at most five recent ids.
- Never persist raw HTTP bodies, base64 image bytes, or unbounded arrays.

## UI and action invariants

- `panel.render` paints synchronously before cache or network work.
- Use only host Workbench media/detail/Actions; no custom HTML, CSS, shell, or lightbox.
- Collection/detail Enter remains host navigation. Business Actions must not be primary.
- Every visible business action has a stable id and a unique single-letter `menuKey`; never use Esc or host-reserved D/B.
- Keep all visible runtime and manifest strings localized in English and Simplified Chinese.

## Permissions

- `http`: catalog, random endpoint, and image bytes.
- `system`: bounded local image materialization, Downloads, and host-native wallpaper setter.
- exact `plugin_file_*`: exists/ensure/write only for the 20-slot wallpaper ring.
- `open-url`, `clipboard`, `notifications`: explicit user Actions and optional auto-rotation notice.

## Release checklist

1. Bump manifest version and add localized release notes.
2. Live-test catalog, random, artwork page, and image response content type.
3. Run `npm run smoke:another-boring-piece`.
4. Run `npm run package:one -- --only=another-boring-piece` and inspect the archive.
5. Install locally and verify Today/History, Actions, Esc, both themes, and opt-in background behavior.
