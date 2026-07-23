# Qxpicture

Qx Workbench plugin for browsing random image APIs.

- Browse built-in and custom direct-image or JSON APIs.
- Adjust typed API parameters (`text`, `number`, `select`) in the image detail.
- Manage every API and parameter directly in the detail form: add, change type,
  edit select options, restore defaults, or delete with confirmation.
- Edit each API's parameter schema in Settings and save reusable parameter presets.
- Generate encoded query strings or POST JSON bodies from the same stored schema.
- Refresh the selected source.
- Keep cached images visible while each async refresh reports item-level status.
- Use the host-owned adaptive detail image and zoom dialog.
- Save or copy the current image.
- Set the current image as the desktop wallpaper through Qx's native system port.
- Manage API entries and the save directory in the plugin's Settings tab.

JSON sources use `data[0].urls.original`, matching the built-in Lolicon API.

Requires Qx 0.6.14+ for revisioned Workbench updates, adaptive detail media,
and managed form groups/actions.
