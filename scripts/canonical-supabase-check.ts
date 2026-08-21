import fs from "node:fs";

const expectedProject = "gwqvninbrmrsabuseqbx";
const directSession = fs.readFileSync("src/lib/direct-session.server.ts", "utf8");
const middleware = fs.readFileSync("src/integrations/supabase/auth-middleware.ts", "utf8");
const browserClient = fs.readFileSync("src/integrations/supabase/client.ts", "utf8");

if (!directSession.includes(`https://${expectedProject}.supabase.co`)) {
  throw new Error("Canonical Supabase project is missing from direct-session.server.ts");
}
if (/process\.env\.SUPABASE_(URL|PUBLISHABLE_KEY)/.test(directSession)) {
  throw new Error("Session validation can still be redirected to Lovable Cloud");
}
if (/process\.env\.SUPABASE_(URL|PUBLISHABLE_KEY)/.test(middleware)) {
  throw new Error("Auth middleware can still be redirected to Lovable Cloud");
}
if (!browserClient.includes(`https://${expectedProject}.supabase.co`)) {
  throw new Error("Canonical Supabase project is missing from the browser client");
}
if (/(?:process|import\.meta)\.env\.(?:VITE_)?SUPABASE_(URL|PUBLISHABLE_KEY)/.test(browserClient)) {
  throw new Error("Browser Auth can still be redirected to another Supabase project");
}

console.log(`Canonical Supabase check passed (${expectedProject}).`);
