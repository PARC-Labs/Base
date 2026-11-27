import {createPublicFormHandler} from './handler.js'

Deno.serve(createPublicFormHandler({
 baseUrl:Deno.env.get('SUPABASE_URL'),
 serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}))
