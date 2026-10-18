export interface CollectedArtifact {
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface CollectedItem {
  url: string;
  title: string;
  content: string;
  contentHash: string;
  externalId?: string;
  author?: string;
  publishedAt?: string;
  screenshotKey?: string;
  artifacts: CollectedArtifact[];
}
