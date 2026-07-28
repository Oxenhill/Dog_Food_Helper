-- food_full is in the exposed public schema. Run with the querying role's
-- permissions/RLS rather than the view owner's privileges.
alter view public.food_full set (security_invoker = true);
