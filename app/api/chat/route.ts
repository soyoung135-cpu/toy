import { requireUser } from "@/auth/server";
import { handleChat } from "@/conversation/server";

export async function POST(request: Request): Promise<Response> {
  const denied = await requireUser();
  if (denied) return denied;
  return handleChat(request);
}
