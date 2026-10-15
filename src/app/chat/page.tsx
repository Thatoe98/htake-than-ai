import { Suspense } from "react";
import { getOrCreateConversation, loadMessages } from "@/lib/chat-store";
import { asLocale } from "@/lib/i18n";
import { canDraftPosts } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { ChatClient } from "./chat-client";

async function Chat() {
  const user = await requireUser();
  const conversation = await getOrCreateConversation(user.id);
  const initialMessages = await loadMessages(conversation.id, 60);
  return (
    <ChatClient
      initialMessages={initialMessages}
      locale={asLocale(user.locale)}
      name={user.name}
      canDraftPosts={canDraftPosts({ id: user.id, role: user.role })}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Chat />
    </Suspense>
  );
}
