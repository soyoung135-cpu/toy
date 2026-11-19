import { handleChat } from "@/conversation/server";

export async function POST(request: Request): Promise<Response> {
  return handleChat(request);
}
