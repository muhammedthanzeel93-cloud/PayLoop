import { POST_STATUSES, POST_VISIBILITIES } from '@kerala-tourism/constants';
import { PostModel, IPostDocument } from '../posts/post.model';

export class SocialRepository {
  public async findById(id: string): Promise<IPostDocument | null> {
    return PostModel.findById(id);
  }

  public async getFeed(limit = 20): Promise<IPostDocument[]> {
    return PostModel.find({
      visibility: POST_VISIBILITIES.PUBLIC,
      status: POST_STATUSES.PUBLISHED,
      deletedAt: null,
    })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit);
  }
}

export const socialRepository = new SocialRepository();
