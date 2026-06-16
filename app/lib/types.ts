export type FindingValue = "present" | "absent" | "uncertain";

export type FindingKey =
  | "acl_tear"
  | "mcl_injury"
  | "meniscus_tear"
  | "fracture"
  | "osteoarthritis"
  | "effusion";

export type AnswerKey = Record<FindingKey, FindingValue>;

export type ReportSplit = "sample" | "public" | "private";

export type ReportManifestItem = {
  id: string;
  filename: string;
  split: ReportSplit;
};

export type AnswerKeyItem = ReportManifestItem & {
  answer_key: AnswerKey;
  notes?: string;
};

export type SampleReport = AnswerKeyItem & {
  text: string;
};

export type ScoreSummary = {
  correct: number;
  total: number;
  accuracy: number;
};
