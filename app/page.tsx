import { isAuthConfigured, LogoutButton } from "@/auth";
import { ConversationView } from "@/conversation";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      {isAuthConfigured() && (
        <div className="flex justify-end">
          <LogoutButton />
        </div>
      )}
      <ConversationView />
    </main>
  );
}
