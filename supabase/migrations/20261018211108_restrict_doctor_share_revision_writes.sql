revoke all on public.doctor_share_revisions from public,anon,authenticated;
grant select on public.doctor_share_revisions to authenticated;
revoke all on sequence public.doctor_share_revisions_id_seq from public,anon,authenticated;
