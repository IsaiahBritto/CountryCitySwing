-- Hoodie preorders: schema + seed four $5 hoodie SKUs

ALTER TABLE merch_products
  ADD COLUMN IF NOT EXISTS preorder_end_at timestamptz NULL;

ALTER TABLE merch_products
  ADD COLUMN IF NOT EXISTS unlimited_inventory boolean NOT NULL DEFAULT false;

ALTER TABLE merch_products
  DROP CONSTRAINT IF EXISTS merch_products_type_check;

ALTER TABLE merch_products
  ADD CONSTRAINT merch_products_type_check
  CHECK (type IN ('shirt', 'crop', 'hat', 'hoodie'));

-- Black Hoodie (Preorder)
WITH new_product AS (
  INSERT INTO merch_products (
    id,
    name,
    type,
    price,
    available_sizes,
    main_image_url,
    display_order,
    unlimited_inventory,
    preorder_end_at
  ) VALUES (
    gen_random_uuid(),
    'Black Hoodie (Preorder)',
    'hoodie',
    5.00,
    ARRAY['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/black_hoodie_front.PNG',
    20,
    true,
    NULL
  )
  RETURNING id, name, main_image_url
)
INSERT INTO merch_product_images (product_id, image_url, alt_text, display_order)
SELECT id, main_image_url, name || ' - front', 1 FROM new_product
UNION ALL
SELECT id,
  'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/black_hoodie_back.PNG',
  name || ' - back',
  2
FROM new_product;

-- Brown Hoodie (Preorder)
WITH new_product AS (
  INSERT INTO merch_products (
    id,
    name,
    type,
    price,
    available_sizes,
    main_image_url,
    display_order,
    unlimited_inventory,
    preorder_end_at
  ) VALUES (
    gen_random_uuid(),
    'Brown Hoodie (Preorder)',
    'hoodie',
    5.00,
    ARRAY['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/brown_hoodie_front.PNG',
    21,
    true,
    NULL
  )
  RETURNING id, name, main_image_url
)
INSERT INTO merch_product_images (product_id, image_url, alt_text, display_order)
SELECT id, main_image_url, name || ' - front', 1 FROM new_product
UNION ALL
SELECT id,
  'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/brown_hoodie_back.PNG',
  name || ' - back',
  2
FROM new_product;

-- Army Green Hoodie (Preorder)
WITH new_product AS (
  INSERT INTO merch_products (
    id,
    name,
    type,
    price,
    available_sizes,
    main_image_url,
    display_order,
    unlimited_inventory,
    preorder_end_at
  ) VALUES (
    gen_random_uuid(),
    'Army Green Hoodie (Preorder)',
    'hoodie',
    5.00,
    ARRAY['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/green_hoodie_front.PNG',
    22,
    true,
    NULL
  )
  RETURNING id, name, main_image_url
)
INSERT INTO merch_product_images (product_id, image_url, alt_text, display_order)
SELECT id, main_image_url, name || ' - front', 1 FROM new_product
UNION ALL
SELECT id,
  'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/green_hoodie_back.PNG',
  name || ' - back',
  2
FROM new_product;

-- Mossy Oak Camo Hoodie (Preorder)
WITH new_product AS (
  INSERT INTO merch_products (
    id,
    name,
    type,
    price,
    available_sizes,
    main_image_url,
    display_order,
    unlimited_inventory,
    preorder_end_at
  ) VALUES (
    gen_random_uuid(),
    'Mossy Oak Camo Hoodie (Preorder)',
    'hoodie',
    5.00,
    ARRAY['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/camo_hoodie_front.PNG',
    23,
    true,
    NULL
  )
  RETURNING id, name, main_image_url
)
INSERT INTO merch_product_images (product_id, image_url, alt_text, display_order)
SELECT id, main_image_url, name || ' - front', 1 FROM new_product
UNION ALL
SELECT id,
  'https://yazjuavsmtobokehppkz.supabase.co/storage/v1/object/public/merch-products/camo_hoodie_back.PNG',
  name || ' - back',
  2
FROM new_product;
