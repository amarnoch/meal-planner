# Personal recipe photos

Drop a small JPG/WebP here when you cook one of the recipes — keeps the cookbook personal instead of stock-photo'd.

## Convention

- File name = the recipe's `id` from `recipes.json` plus `.jpg` (or `.webp`):
  `rec_japanese_curry.jpg`, `rec_classic_omurice.webp`, etc.
- Aim for ~600×600 or 800×600, 50–150KB. The renderer crops with `object-fit: cover` so any reasonable aspect ratio works.
- Then update that recipe's `imageUrl` in `recipes.json` from the Unsplash URL to:
  `"imageUrl": "images/recipes/rec_japanese_curry.jpg"`
- Commit + push. GitHub Pages serves the file from the same domain — no hotlinking dependencies.

## Quick mobile workflow

1. Cook the dish, snap a photo on your phone.
2. AirDrop / iCloud the photo to your laptop.
3. Resize: `sips -Z 800 your-photo.heic --out images/recipes/rec_xyz.jpg` (macOS converts HEIC → JPG and caps the long edge at 800px).
4. Update `recipes.json` `imageUrl` field to `images/recipes/rec_xyz.jpg`.
5. `git add images/recipes/rec_xyz.jpg recipes.json && git commit -m "Photo: xyz" && git push`.

The Unsplash placeholders will progressively get replaced as you cook through the cookbook.
