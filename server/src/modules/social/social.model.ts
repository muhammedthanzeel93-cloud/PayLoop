// Unified canonical PostModel lives in modules/posts/post.model.ts to prevent duplicate 'Post' registration
export { PostModel, postSchema } from '../posts/post.model';
export type { IPostDocument } from '../posts/post.model';
