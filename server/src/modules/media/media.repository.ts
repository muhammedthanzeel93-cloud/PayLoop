import { Types } from 'mongoose';
import { MediaModel, IMediaDocument } from './media.model';

export class MediaRepository {
  public async createMedia(data: Partial<IMediaDocument>): Promise<IMediaDocument> {
    return MediaModel.create(data);
  }

  public async findById(id: string | Types.ObjectId): Promise<IMediaDocument | null> {
    return MediaModel.findById(id);
  }

  public async findByIds(ids: (string | Types.ObjectId)[]): Promise<IMediaDocument[]> {
    if (ids.length === 0) {
      return [];
    }
    const objectIds = ids.map((id) =>
      id instanceof Types.ObjectId ? id : new Types.ObjectId(id.toString()),
    );
    return MediaModel.find({ _id: { $in: objectIds } });
  }

  public async findByStorageKey(storageKey: string): Promise<IMediaDocument | null> {
    return MediaModel.findOne({ storageKey });
  }

  public async findByDestination(
    destinationId: string | Types.ObjectId,
  ): Promise<IMediaDocument[]> {
    return MediaModel.find({ destinationId: new Types.ObjectId(destinationId.toString()) }).sort({
      isPrimary: -1,
      displayOrder: 1,
      createdAt: 1,
    });
  }

  public async findPrimaryForDestination(
    destinationId: string | Types.ObjectId,
  ): Promise<IMediaDocument | null> {
    return MediaModel.findOne({
      destinationId: new Types.ObjectId(destinationId.toString()),
      isPrimary: true,
    });
  }

  public async unsetPrimaryForDestination(
    destinationId: string | Types.ObjectId,
  ): Promise<void> {
    await MediaModel.updateMany(
      { destinationId: new Types.ObjectId(destinationId.toString()), isPrimary: true },
      { $set: { isPrimary: false } },
    );
  }

  public async updateMedia(
    id: string | Types.ObjectId,
    updates: Partial<IMediaDocument>,
  ): Promise<IMediaDocument | null> {
    return MediaModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );
  }

  public async deleteMedia(id: string | Types.ObjectId): Promise<IMediaDocument | null> {
    return MediaModel.findByIdAndDelete(id);
  }

  public async countByDestination(
    destinationId: string | Types.ObjectId,
  ): Promise<number> {
    return MediaModel.countDocuments({
      destinationId: new Types.ObjectId(destinationId.toString()),
    });
  }
}

export const mediaRepository = new MediaRepository();
