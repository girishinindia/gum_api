-- ============================================================================
-- 70_catalog_search.sql
-- Unified catalog search across courses / bundles / webinars / batches / podcasts.
--
-- Returns a single jsonb { total, data[] } so that the count, the sort and the
-- pagination all derive from ONE query — making count == results by construction.
--
-- Tag semantics:
--   • bestseller / new / certificate  → exist only on courses (course-only filter)
--   • featured                        → courses + bundles + podcasts
--   (Types that lack a flag normalise it to false, so a tag filter naturally
--    excludes them — no special casing needed.)
--
-- This is the server-side scale path. The public catalog page currently merges
-- the per-type list endpoints client-side (to keep each type's rich card data);
-- adopt this RPC behind a thin GET /catalog endpoint when per-type result sets
-- grow beyond ~100 rows.
--
-- Tested live (June 2026): default total 38 / page 12; bestseller 3 (courses only);
-- featured 7; non-course+bestseller 0; price-sorted pages have no overlap.
-- ============================================================================

create or replace function public.fn_catalog_search(
  p_language_id bigint default 7,
  p_types text[] default null,
  p_search text default null,
  p_category_id bigint default null,
  p_sub_category_id bigint default null,
  p_level text default null,
  p_course_language_id bigint default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_is_free boolean default null,
  p_rating_min numeric default null,
  p_tag_bestseller boolean default false,
  p_tag_new boolean default false,
  p_tag_certificate boolean default false,
  p_tag_featured boolean default false,
  p_sort text default 'newest',
  p_order text default 'desc',
  p_limit int default 12,
  p_offset int default 0
) returns jsonb language sql stable as $$
with cat(content_type,id,slug,title,short_description,thumbnail,price,original_price,is_free,discount_percentage,rating_average,rating_count,popularity,language_id,is_bestseller,is_new,has_certificate,is_featured,difficulty_level,category_id,sub_category_id,category_name,created_at) as (
  select 'course', c.id, c.slug::text,
    coalesce(ctl.title, cte.title, c.name)::text,
    coalesce(ctl.short_intro, cte.short_intro),
    coalesce(ctl.web_thumbnail, cte.web_thumbnail, c.trailer_thumbnail_url),
    c.price, c.original_price, coalesce(c.is_free,false), c.discount_percentage,
    c.rating_average, c.rating_count, coalesce(c.enrollment_count,0)::bigint,
    c.course_language_id,
    coalesce(c.is_bestseller,false),
    (coalesce(c.is_new,false) and (c.new_until is null or c.new_until >= current_date)),
    coalesce(c.has_certificate,false), coalesce(c.is_featured,false),
    c.difficulty_level,
    cc.category_id, cc.sub_category_id, cat.name,
    c.created_at
  from courses c
  left join course_translations ctl on ctl.course_id=c.id and ctl.language_id=p_language_id
  left join course_translations cte on cte.course_id=c.id and cte.language_id=7
  left join lateral (
    select sc.category_id, csc.sub_category_id
    from course_sub_categories csc join sub_categories sc on sc.id=csc.sub_category_id
    where csc.course_id=c.id order by csc.is_primary desc nulls last limit 1
  ) cc on true
  left join categories cat on cat.id=cc.category_id
  where c.deleted_at is null and c.course_status='published' and coalesce(c.is_active,true)
    and (p_types is null or 'course' = any(p_types))
  union all
  select 'bundle', b.id, b.slug::text,
    coalesce(btl.title::text, bte.title::text, b.name),
    coalesce(btl.short_description, bte.short_description),
    coalesce(btl.thumbnail_url, bte.thumbnail_url),
    b.price, b.original_price, coalesce(b.price = 0, false), b.discount_percentage,
    b.rating_average, b.rating_count, coalesce(b.enrollment_count,0)::bigint,
    null::bigint,
    false, false, false, coalesce(b.is_featured,false),
    null::text, null::bigint, null::bigint, null::text,
    b.created_at
  from bundles b
  left join bundle_translations btl on btl.bundle_id=b.id and btl.language_id=p_language_id
  left join bundle_translations bte on bte.bundle_id=b.id and bte.language_id=7
  where b.deleted_at is null and coalesce(b.is_active,true)
    and (p_types is null or 'bundle' = any(p_types))
  union all
  select 'webinar', w.id, w.slug::text,
    coalesce(wtl.title::text, wte.title::text, w.title::text),
    coalesce(wtl.short_description, wte.short_description),
    coalesce(wtl.thumbnail, wte.thumbnail),
    w.price, null::numeric, coalesce(w.is_free,false), null::numeric,
    w.rating_average, w.rating_count, coalesce(w.rating_count,0)::bigint,
    null::bigint,
    false, false, false, false,
    null::text, null::bigint, null::bigint, null::text,
    w.created_at
  from webinars w
  left join webinar_translations wtl on wtl.webinar_id=w.id and wtl.language_id=p_language_id
  left join webinar_translations wte on wte.webinar_id=w.id and wte.language_id=7
  where w.deleted_at is null and coalesce(w.is_active,true)
    and (p_types is null or 'webinar' = any(p_types))
  union all
  select 'batch', cb.id::bigint, cb.slug::text,
    coalesce(bttl.title, btte.title, cb.title),
    coalesce(bttl.short_description, btte.short_description),
    coalesce(bttl.thumbnail_url, btte.thumbnail_url),
    cb.price, null::numeric, coalesce(cb.is_free,false), null::numeric,
    cb.rating_average, cb.rating_count, coalesce(cb.enrolled_count,0)::bigint,
    null::bigint,
    false, false, false, false,
    null::text, null::bigint, null::bigint, null::text,
    cb.created_at
  from course_batches cb
  left join batch_translations bttl on bttl.batch_id=cb.id and bttl.language_id=p_language_id
  left join batch_translations btte on btte.batch_id=cb.id and btte.language_id=7
  where cb.deleted_at is null and coalesce(cb.is_active,true) and cb.batch_status <> 'cancelled'
    and (p_types is null or 'batch' = any(p_types))
  union all
  select 'podcast', p.id, null::text,
    p.title::text, p.short_summary::text, p.thumbnail_url,
    null::numeric, null::numeric, null::boolean, null::numeric,
    null::numeric, null::bigint, coalesce(p.view_count,0)::bigint,
    null::bigint,
    false, false, false, coalesce(p.is_featured,false),
    null::text, p.category_id, p.sub_category_id, pcat.name,
    coalesce(p.published_at, p.created_at)
  from podcasts p
  left join categories pcat on pcat.id=p.category_id
  where p.deleted_at is null and coalesce(p.is_active,true) and p.status in ('published','coming_soon')
    and (p_types is null or 'podcast' = any(p_types))
),
filtered as (
  select * from cat
  where (p_search is null or title ilike '%'||p_search||'%')
    and (p_category_id is null or category_id = p_category_id)
    and (p_sub_category_id is null or sub_category_id = p_sub_category_id)
    and (p_level is null or difficulty_level = p_level)
    and (p_course_language_id is null or language_id = p_course_language_id)
    and (p_price_min is null or price >= p_price_min)
    and (p_price_max is null or price <= p_price_max)
    and (p_is_free is null or is_free = p_is_free)
    and (p_rating_min is null or rating_average >= p_rating_min)
    and (not p_tag_bestseller or is_bestseller)
    and (not p_tag_new or is_new)
    and (not p_tag_certificate or has_certificate)
    and (not p_tag_featured or is_featured)
)
select jsonb_build_object(
  'total', (select count(*) from filtered),
  'data', coalesce((select jsonb_agg(to_jsonb(t)) from (
    select * from filtered
    order by
      (case when p_sort='price' and lower(p_order)='asc' then price end) asc nulls last,
      (case when p_sort='price' and lower(p_order)='desc' then price end) desc nulls last,
      (case when p_sort='rating' and lower(p_order)='asc' then rating_average end) asc nulls last,
      (case when p_sort='rating' and lower(p_order)='desc' then rating_average end) desc nulls last,
      (case when p_sort='popularity' and lower(p_order)='asc' then popularity end) asc nulls last,
      (case when p_sort='popularity' and lower(p_order)='desc' then popularity end) desc nulls last,
      (case when p_sort='name' and lower(p_order)='asc' then lower(title) end) asc nulls last,
      (case when p_sort='name' and lower(p_order)='desc' then lower(title) end) desc nulls last,
      (case when p_sort='newest' and lower(p_order)='asc' then created_at end) asc nulls last,
      (case when (p_sort is null or p_sort not in ('price','rating','popularity','name') or p_sort='newest') and lower(p_order)='desc' then created_at end) desc nulls last,
      created_at desc, content_type, id
    limit greatest(p_limit,0) offset greatest(p_offset,0)
  ) t), '[]'::jsonb)
);
$$;

grant execute on function public.fn_catalog_search to anon, authenticated, service_role;

comment on function public.fn_catalog_search is
  'Unified catalog search across courses/bundles/webinars/batches/podcasts. Returns {total, data[]} with global filtering, tag semantics (bestseller/new/certificate=courses-only, featured=courses+bundles+podcasts), sort and limit/offset from a single source so count==results.';
