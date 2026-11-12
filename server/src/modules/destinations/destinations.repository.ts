import { Types, FilterQuery, PipelineStage } from 'mongoose';
import {
  DestinationModel,
  IDestinationDocument,
  DestinationCategoryModel,
  IDestinationCategoryDocument,
  DestinationSubmissionModel,
  IDestinationSubmissionDocument,
} from '../../shared/models';
import {
  DESTINATION_VERIFICATION_STATUSES,
  DESTINATION_PUBLICATION_STATUSES,
} from '@kerala-tourism/constants';
import { DestinationQueryInput, NearbyDestinationQueryInput } from './destinations.types';

export class DestinationsRepository {
  /**
   * Query published & verified destinations with pagination, sorting & filters
   */
  public async findPublishedDestinations(
    query: DestinationQueryInput,
  ): Promise<{ items: IDestinationDocument[]; total: number }> {
    const filter: FilterQuery<IDestinationDocument> = {
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    };

    if (query.district) {
      filter.district = query.district;
    }

    if (query.categoryId) {
      filter.categoryIds = new Types.ObjectId(query.categoryId);
    }

    if (query.search) {
      const sanitized = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: sanitized, $options: 'i' };
    }

    const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
    const sortField = query.sortBy === 'name' ? 'name' : 'createdAt';

    const [items, total] = await Promise.all([
      DestinationModel.find(filter)
        .sort({ [sortField]: sortDirection })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      DestinationModel.countDocuments(filter),
    ]);

    return { items, total };
  }

  /**
   * Find nearby published & verified destinations using $geoNear aggregation
   */
  public async findNearbyDestinations(
    query: NearbyDestinationQueryInput,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    await DestinationModel.init();

    const maxDistanceMeters = (query.radiusKm || 25) * 1000;
    const [lng, lat] = [Number(query.longitude), Number(query.latitude)];

    const matchQuery: Record<string, unknown> = {
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    };

    if (query.categoryId) {
      matchQuery.categoryIds = new Types.ObjectId(query.categoryId);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(50, query.limit || 10));

    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          distanceField: 'distanceMeters',
          maxDistance: maxDistanceMeters,
          query: matchQuery,
          spherical: true,
        },
      },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          totalCount: [
            { $count: 'total' },
          ],
        },
      },
    ];

    const results = await DestinationModel.aggregate(pipeline);
    const facetResult = results[0] || { items: [], totalCount: [] };
    const items = facetResult.items || [];
    const total =
      facetResult.totalCount && facetResult.totalCount.length > 0
        ? facetResult.totalCount[0].total
        : 0;

    return { items, total };
  }

  /**
   * Find single published & verified destination by unique slug
   */
  public async findPublishedBySlug(slug: string): Promise<IDestinationDocument | null> {
    const normalizedSlug = slug.toLowerCase().trim();
    return DestinationModel.findOne({
      slug: normalizedSlug,
      verificationStatus: DESTINATION_VERIFICATION_STATUSES.VERIFIED,
      publicationStatus: DESTINATION_PUBLICATION_STATUSES.PUBLISHED,
    });
  }

  /**
   * Find any destination by ID (including draft/pending/archived for management)
   */
  public async findDestinationById(id: string | Types.ObjectId): Promise<IDestinationDocument | null> {
    return DestinationModel.findById(id);
  }

  /**
   * Batch find destinations by IDs (used to hydrate feed posts without N+1 queries)
   */
  public async findDestinationsByIds(
    ids: (string | Types.ObjectId)[],
  ): Promise<IDestinationDocument[]> {
    if (ids.length === 0) {
      return [];
    }
    const objectIds = ids.map((id) =>
      id instanceof Types.ObjectId ? id : new Types.ObjectId(id.toString()),
    );
    return DestinationModel.find({ _id: { $in: objectIds } });
  }

  /**
   * Find any destination by slug
   */
  public async findDestinationBySlug(slug: string): Promise<IDestinationDocument | null> {
    return DestinationModel.findOne({ slug: slug.toLowerCase().trim() });
  }

  /**
   * Create destination document
   */
  public async createDestination(
    data: Partial<IDestinationDocument>,
  ): Promise<IDestinationDocument> {
    return DestinationModel.create(data);
  }

  /**
   * Update destination document
   */
  public async updateDestination(
    id: string | Types.ObjectId,
    updates: Partial<IDestinationDocument>,
  ): Promise<IDestinationDocument | null> {
    return DestinationModel.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
  }

  /**
   * Create master category
   */
  public async createCategory(
    data: Partial<IDestinationCategoryDocument>,
  ): Promise<IDestinationCategoryDocument> {
    return DestinationCategoryModel.create(data);
  }

  /**
   * Find category by ID
   */
  public async findCategoryById(id: string | Types.ObjectId): Promise<IDestinationCategoryDocument | null> {
    return DestinationCategoryModel.findById(id);
  }

  /**
   * Find category by slug
   */
  public async findCategoryBySlug(slug: string): Promise<IDestinationCategoryDocument | null> {
    return DestinationCategoryModel.findOne({ slug: slug.toLowerCase().trim() });
  }

  /**
   * Find category by name
   */
  public async findCategoryByName(name: string): Promise<IDestinationCategoryDocument | null> {
    return DestinationCategoryModel.findOne({ name: name.trim() });
  }

  /**
   * List all active categories in alphabetical order
   */
  public async listActiveCategories(): Promise<IDestinationCategoryDocument[]> {
    return DestinationCategoryModel.find({ isActive: true }).sort({ name: 1 });
  }

  /**
   * Create tourist destination submission
   */
  public async createSubmission(
    data: Partial<IDestinationSubmissionDocument>,
  ): Promise<IDestinationSubmissionDocument> {
    return DestinationSubmissionModel.create(data);
  }

  /**
   * Find submission by ID
   */
  public async findSubmissionById(
    id: string | Types.ObjectId,
  ): Promise<IDestinationSubmissionDocument | null> {
    return DestinationSubmissionModel.findById(id);
  }

  /**
   * List submissions by tourist account ID
   */
  public async findSubmissionsByTourist(
    touristAccountId: string | Types.ObjectId,
    page = 1,
    limit = 20,
  ): Promise<{ items: IDestinationSubmissionDocument[]; total: number }> {
    const filter = { submittedBy: new Types.ObjectId(touristAccountId.toString()) };
    const [items, total] = await Promise.all([
      DestinationSubmissionModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      DestinationSubmissionModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  /**
   * List submissions for admin moderation
   */
  public async listSubmissions(filter: {
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: IDestinationSubmissionDocument[]; total: number }> {
    const query: FilterQuery<IDestinationSubmissionDocument> = {};
    if (filter.status) {
      query.submissionStatus = filter.status;
    }
    const page = filter.page || 1;
    const limit = filter.limit || 20;

    const [items, total] = await Promise.all([
      DestinationSubmissionModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      DestinationSubmissionModel.countDocuments(query),
    ]);
    return { items, total };
  }

  /**
   * Update destination submission
   */
  public async updateSubmission(
    id: string | Types.ObjectId,
    updates: Partial<IDestinationSubmissionDocument>,
  ): Promise<IDestinationSubmissionDocument | null> {
    return DestinationSubmissionModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );
  }
}

export const destinationsRepository = new DestinationsRepository();
