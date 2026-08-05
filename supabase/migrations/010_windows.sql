-- Windows: purchasable wall-placed items that OPEN A HOLE in the room shell's window band.
--
-- A window is an ordinary item_buy row — price, min_level, ownership via purchase_item, model at
-- room/bought/<id>/<variation|'default'>.glb — distinguished ONLY by category 'window'. The app
-- routes on that category: allowedSurfaces becomes ["wall"] and the wall-grid footprint is derived
-- from the measured size (round(size / 0.25) per axis — NEAREST, because a hole smaller than the
-- glazing would show wall through the glass, while a slightly-large hole reads as a plaster
-- reveal). No hole columns: like floor footprints, the hole is DERIVED from size in
-- src/room/core/placeableItems.ts, so the DB keeps storing only what a tool measures.
--
-- Sizes below are measured by scripts/derive_window_defs.py from the window-* collections in
-- print_room.blend (world AABB: x = width along the wall, y = height, z = depth out of the wall).
-- base_offset_y stays 0: wall items are authored with their origin ON the mounting plane at the
-- hole centre (the anchor-empty convention), so no lift applies.

insert into public.item_categories (id, name) values
  ('win', 'Windows')
on conflict (id) do nothing;

-- Prices/min_level are PLACEHOLDERS like the rest of the seed. brand_id null: not IKEA items.
insert into public.item_buy (id, name, brand_id, category_id, link, price, min_level, size_x, size_y, size_z, base_offset_y) values
  ('window-wc-narrow',    'Narrow WC Window',     null, 'win', null,  60, 1, 0.504, 1.251, 0.165, 0),
  ('window-double-hung',  'Double-Hung Window',   null, 'win', null,  80, 1, 0.730, 1.040, 0.107, 0),
  ('window-pvc-single',   'PVC Single Window',    null, 'win', null,  90, 1, 1.005, 1.256, 0.167, 0),
  ('window-sash',         'Victorian Sash Window', null, 'win', null, 120, 1, 1.061, 1.262, 0.218, 0),
  ('window-wood-classic', 'Classic Wood Window',  null, 'win', null, 140, 1, 1.239, 1.231, 0.349, 0)
on conflict (id) do nothing;

-- One model each, no colour axis yet: null variation = the 'default' path segment, so the models
-- live at room/bought/<id>/default.glb — exactly what derive_window_defs.py exports.
insert into public.item_variants (id, item_id, variation, is_default) values
  ('window-wc-narrow__default',    'window-wc-narrow',    null, true),
  ('window-double-hung__default',  'window-double-hung',  null, true),
  ('window-pvc-single__default',   'window-pvc-single',   null, true),
  ('window-sash__default',         'window-sash',         null, true),
  ('window-wood-classic__default', 'window-wood-classic', null, true)
on conflict (id) do nothing;
