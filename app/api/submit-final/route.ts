export async function POST() {
  return Response.json(
    {
      error:
        "Legacy submission route disabled. Use /api/submissions/final with a validated participant session.",
    },
    { status: 410 },
  );
}
