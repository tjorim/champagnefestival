import { http, HttpResponse } from "msw";
import type { Template, TemplateDraft } from "@/signage/editorModel";

const templates: Template[] = [];
function authorized(request: Request) {
  return ["Bearer mock-access-token", "Bearer dev-token"].includes(
    request.headers.get("Authorization") ?? "",
  );
}
export const signageHandlers = [
  http.get("/api/signage/templates", ({ request }) =>
    authorized(request) ? HttpResponse.json(templates) : new HttpResponse(null, { status: 401 }),
  ),
  http.post("/api/signage/templates", async ({ request }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const draft = (await request.json()) as TemplateDraft;
    const template = { ...draft, id: crypto.randomUUID() };
    templates.push(template);
    return HttpResponse.json(template, { status: 201 });
  }),
  http.put("/api/signage/templates/:id", async ({ request, params }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const index = templates.findIndex((item) => item.id === params.id);
    if (index < 0) return new HttpResponse(null, { status: 404 });
    const draft = (await request.json()) as TemplateDraft;
    const template = { ...draft, id: String(params.id) };
    templates[index] = template;
    return HttpResponse.json(template);
  }),
  http.get("/api/signage/slides", ({ request }) =>
    authorized(request) ? HttpResponse.json([]) : new HttpResponse(null, { status: 401 }),
  ),
];
