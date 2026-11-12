export interface CreatePostDto {
  userId: string;
  caption: string;
  images: string[];
  locationTag?: string;
  destinationId?: string;
  tags?: string[];
}

export interface PostCommentDto {
  userId: string;
  text: string;
}
