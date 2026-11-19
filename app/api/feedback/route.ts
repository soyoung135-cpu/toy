import { handleFeedback } from "@/conversation/server";

export async function POST(request: Request): Promise<Response> {
  return handleFeedback(request);
}
