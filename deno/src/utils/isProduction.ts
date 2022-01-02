// there is probably a better way of working out if in production mode
export const isProduction = Boolean(Deno.env.get('github_client_id'))
