export const answerKeyFields = [
  "acl_tear",
  "mcl_injury",
  "meniscus_tear",
  "fracture",
  "osteoarthritis",
  "effusion",
] as const;

export const answerKeyValues = ["present", "absent", "uncertain", "not_reported"] as const;

export function makeReport(id: string) {
  return { id, split: "public" as const };
}

export function makeAnswerKey(
  reportId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    report_id: reportId,
    answer_values: {
      acl_tear: "absent",
      mcl_injury: "absent",
      meniscus_tear: "not_reported",
      fracture: "absent",
      osteoarthritis: "not_reported",
      effusion: "present",
      ...overrides,
    },
    acl_tear: "absent",
    mcl_injury: "absent",
    meniscus_tear: "not_reported",
    fracture: "absent",
    osteoarthritis: "not_reported",
    effusion: "present",
  };
}
