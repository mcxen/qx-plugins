# Qxpicture

Qx Workbench plugin for browsing random image APIs.

- Browse built-in and custom image APIs with GET query or POST JSON requests.
- Read direct image responses, image URLs inside JSON, or base64 images inside JSON.
- Start from a curated Stable Diffusion WebUI FastAPI template and edit every field.
- Adjust typed API parameters (`text`, `number`, `select`) in the image detail.
- Add APIs through an inline validated draft form, then manage every API and
  parameter directly in the detail form: change type,
  edit select options, restore defaults, or delete with confirmation.
- The new API form keeps required name/URL fields first, with response-only fields
  shown when needed. Parameters can be added before saving; request previews appear
  only for saved APIs with parameters. Layout and control styling belong to Qx.
- Edit each API's parameter schema in Settings and save reusable parameter presets.
- Generate encoded query strings or POST JSON bodies from the same stored schema.
- Refresh the selected source or refresh every configured API with one Action.
- On first open, automatically fetch every configured API once when no image
  cache exists; subsequent opens remain cache-first.
- Keep cached images visible while each async refresh reports item-level status.
- Use the host-owned adaptive detail image and zoom dialog.
- Save or copy the current image.
- Set the current image as the desktop wallpaper through Qx's native system port.
- Manage API entries and the save directory in the plugin's Settings tab.

JSON URL sources default to `data[0].urls.original`, matching the built-in Lolicon API.
JSON base64 sources support paths such as `images[0]`, matching the FastAPI-based
Stable Diffusion WebUI API. Direct POST responses request an image media type, which
also supports FastAPI services that return image bytes for an `Accept: image/*` request.

Requires Qx 0.6.22+ for revisioned Workbench updates, adaptive detail media,
and managed form groups/actions.
