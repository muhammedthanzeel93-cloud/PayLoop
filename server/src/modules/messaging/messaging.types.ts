export interface SendMessageDto {
  senderId: string;
  recipientId: string;
  propertyId?: string;
  content: string;
  attachments?: string[];
}

export interface ConversationDto {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: string;
}
