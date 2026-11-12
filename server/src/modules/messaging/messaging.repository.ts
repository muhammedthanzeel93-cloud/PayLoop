import { MessageModel, IMessageDocument } from './messaging.model';
import { SendMessageDto } from './messaging.types';

export class MessagingRepository {
  public async create(data: SendMessageDto): Promise<IMessageDocument> {
    return MessageModel.create(data);
  }

  public async getThread(userA: string, userB: string, limit = 50): Promise<IMessageDocument[]> {
    return MessageModel.find({
      $or: [
        { senderId: userA, recipientId: userB },
        { senderId: userB, recipientId: userA },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

export const messagingRepository = new MessagingRepository();
