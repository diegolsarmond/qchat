-- Force schema cache refresh by notifying PostgREST
NOTIFY pgrst, 'reload schema';