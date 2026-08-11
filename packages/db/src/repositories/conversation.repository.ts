import { prisma } from "../client.js";
import type { MessageRole } from "../generated/prisma/client.js";

/** Persistence for AI chat threads (conversations + messages). */
export class ConversationRepository {
  async createConversation(userId: string, title?: string) {
    return prisma.conversation.create({
      data: { userId, title },
    });
  }

  async findById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async listByUser(userId: string, take = 50) {
    return prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take,
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
  ) {
    return prisma.message.create({
      data: { conversationId, role, content },
    });
  }

  async getHistory(conversationId: string, limit = 100) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return messages.reverse(); // oldest -> newest
  }
}
