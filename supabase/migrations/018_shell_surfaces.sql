-- The room as designed, as two surface items every player owns.
--
-- WHY THESE EXIST. Applying a surface item writes its textures onto the shell's material instances,
-- and the native bridge has no getter — so nothing in the app ever holds the textures that were
-- there before, and the authored look cannot be put back. Without these rows "revert to default" is
-- a button that provably does nothing, and a floor item shipping no cornice maps silently inherits
-- the PREVIOUS floor's cornice: a room that is two floors at once.
-- Making the authored look an ITEM rather than a special case means it is applied by exactly the
-- same code as anything a player buys, so there is no second path to keep correct.
--
-- GRANTED, NOT PURCHASED. `granted` marks an item every player owns without a user_buy row.
-- Materialising ownership instead — one row per player per default item — would store N x M rows to
-- express a constant, and would go stale the first time a signup path forgot to insert them.
-- "Everyone owns this" is a property of the ITEM, so it lives on the item. listOwned unions these in.
--
-- The maps live at room/bought/herringbone-parquet/ and room/bought/cream-plaster/, produced by
-- scripts/extract-shell-defaults.mjs straight out of the shipped GLB — so they are the shell's own
-- art rather than a re-authored lookalike, and a re-export regenerates them.

alter table public.item_buy add column if not exists granted boolean not null default false;

insert into public.item_buy (id, name, brand_id, category_id, link, price, min_level, granted) values
  ('herringbone-parquet', 'Herringbone Parquet',     null, 'floor', null, 0, 1, true),
  ('cream-plaster',  'Cream Plaster', null, 'wall',  null, 0, 1, true)
on conflict (id) do update set granted = excluded.granted, price = excluded.price;

-- The tiling and plinth colour are the values MEASURED off the shipped shell, not chosen:
--   Floor's baseColorTexture carries KHR_texture_transform scale [5.1, 5] offset [0, -4]
--   FloorEdge's baseColorFactor is [0.36, 0.22, 0.11] — the plinth brown chosen against the wooden floor
--   Wall and Trim carry an identity transform; their tiling is baked into the shell's own UV0
-- scripts/verify-room-glb.mts asserts the GLB still matches, so a re-export that retiles the floor
-- fails the build rather than leaving this row quietly describing the wrong room.
insert into public.item_surfaces
  (item_id, scale_x, scale_y, offset_x, offset_y, has_normal, has_rough,
   edge_r, edge_g, edge_b, has_trim, has_trim_normal, has_trim_rough, trim_scale_x, trim_scale_y, trim_offset_x, trim_offset_y) values
  ('herringbone-parquet', 5.1, 5, 0, -4, true, true, 0.36, 0.22, 0.11, true, true, true, 1, 1, 0, 0),
  ('cream-plaster',  1,   1, 0,  0, true, true, null, null, null, false, false, false, null, null, null, null)
on conflict (item_id) do update set
  scale_x = excluded.scale_x, scale_y = excluded.scale_y,
  offset_x = excluded.offset_x, offset_y = excluded.offset_y,
  has_normal = excluded.has_normal, has_rough = excluded.has_rough,
  edge_r = excluded.edge_r, edge_g = excluded.edge_g, edge_b = excluded.edge_b,
  has_trim = excluded.has_trim, has_trim_normal = excluded.has_trim_normal, has_trim_rough = excluded.has_trim_rough,
  trim_scale_x = excluded.trim_scale_x, trim_scale_y = excluded.trim_scale_y,
  trim_offset_x = excluded.trim_offset_x, trim_offset_y = excluded.trim_offset_y;
