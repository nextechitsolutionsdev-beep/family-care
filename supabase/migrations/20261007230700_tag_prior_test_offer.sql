update public.offers o set demo_batch_id=b.id from public.demo_batches b
where o.demo_batch_id is null and o.title='خصم اختبار' and o.code='T-'||upper(left(b.id::text,8));
