ALTER FUNCTION public.submit_lead(text,text,text,text,text,text,text,text) SET search_path = public;
ALTER FUNCTION public.can_bootstrap(text) SET search_path = public;
ALTER FUNCTION public.is_staff(uuid) SET search_path = public;
ALTER FUNCTION public.has_role(uuid, public.staff_role[]) SET search_path = public;
ALTER FUNCTION public.touch_sign_in() SET search_path = public;
ALTER FUNCTION public.add_bootstrap(text, public.staff_role, text) SET search_path = public;
ALTER FUNCTION public.promote_staff(text, public.staff_role, text) SET search_path = public;
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;