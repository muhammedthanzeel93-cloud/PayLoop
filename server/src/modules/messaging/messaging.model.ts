import { Schema, model, Document } from 'mongoose';

export interface IMessageDocument extends Document {
  senderId: string;
  recipientId: string;
  propertyId?: string;
  content: string;
  attachments: string[];
  isRead: boolean;
  createdAt: Date;
}

const messageSchema = new Schema<IMessageDocument>(
  {
    senderId: { type: String, required: true, index: true },
    recipientId: { type: String, required: true, index: true },
    propertyId: { type: String, index: true },
    content: { type: String, required: true },
    attachments: [{ type: String }],
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const MessageModel = model<IMessageDocument>('Message', messageSchema);
