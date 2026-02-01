import { db } from "./db-factory";
import { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "./supabase-route";
import type { UserRecord } from "./db-interface";

export async function getAgentFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const key = auth.slice(7);
  return db.getAgentByKey(key);
}

export async function requireAgent(req: NextRequest) {
  const agent = await getAgentFromRequest(req);
  if (!agent) {
    return { error: "Invalid or missing API key", status: 401 };
  }
  return { agent };
}

export async function getUserFromRequest(req: NextRequest): Promise<UserRecord | null> {
  try {
    const supabase = createSupabaseRouteClient(req);
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    
    // Look up user in our database
    const dbUser = await db.getUserById(user.id);
    if (!dbUser) {
      // Auto-create user record if they authenticated but don't exist in our DB yet
      return await db.createUserFromAuth({
        id: user.id,
        email: user.email || "",
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      });
    }
    return dbUser;
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest): Promise<{ user: UserRecord } | { error: string; status: number }> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return { error: "Not authenticated", status: 401 };
  }
  return { user };
}
