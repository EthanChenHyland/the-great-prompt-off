export async function POST() {
  return Response.json(
    {
      error:
        "Legacy submission route disabled. Use /api/submissions/public with a validated participant session.",
    },
    { status: 410 },
  );
}
