import { http, HttpResponse } from "msw";
import type { Channel, Slide, ChannelDraft, SlideDraft } from "@/signage/playlistModel";
import type { Playlist } from "@/signage/types";
import { seedOrganizations } from "../data/organizations";
import type { Template, TemplateDraft } from "@/signage/editorModel";

const channels: Channel[] = [];
const slides: Slide[] = [];
const templates: Template[] = [];
function authorized(request: Request) {
  return ["Bearer mock-access-token", "Bearer dev-token"].includes(
    request.headers.get("Authorization") ?? "",
  );
}
export const signageHandlers = [
  http.get("/api/signage/video-exports/capability", ({ request }) =>
    authorized(request)
      ? HttpResponse.json({ available: false, max_slides: 60, max_seconds: 600 })
      : new HttpResponse(null, { status: 401 }),
  ),
  http.get("/api/signage/video-exports", ({ request }) =>
    authorized(request) ? HttpResponse.json([]) : new HttpResponse(null, { status: 401 }),
  ),
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
    authorized(request) ? HttpResponse.json(slides) : new HttpResponse(null, { status: 401 }),
  ),
  http.get("/api/signage/channels", ({ request }) =>
    authorized(request) ? HttpResponse.json(channels) : new HttpResponse(null, { status: 401 }),
  ),
  http.post("/api/signage/channels", async ({ request }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const body = (await request.json()) as ChannelDraft;
    const item = { ...body, id: crypto.randomUUID(), epoch: new Date().toISOString(), revision: 1 };
    channels.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.put("/api/signage/channels/:id", async ({ request, params }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const index = channels.findIndex((item) => item.id === params.id);
    if (index < 0) return new HttpResponse(null, { status: 404 });
    const item = { ...channels[index]!, ...((await request.json()) as ChannelDraft) };
    channels[index] = item;
    return HttpResponse.json(item);
  }),
  http.post("/api/signage/slides", async ({ request }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const item = { ...((await request.json()) as SlideDraft), id: crypto.randomUUID() };
    slides.push(item);
    return HttpResponse.json(item, { status: 201 });
  }),
  http.put("/api/signage/slides/:id", async ({ request, params }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const index = slides.findIndex((item) => item.id === params.id);
    if (index < 0) return new HttpResponse(null, { status: 404 });
    const item = { ...((await request.json()) as SlideDraft), id: String(params.id) };
    slides[index] = item;
    return HttpResponse.json(item);
  }),
  http.delete("/api/signage/:resource/:id", ({ request, params }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const items = params.resource === "channels" ? channels : slides;
    const index = items.findIndex((item) => item.id === params.id);
    if (index < 0) return new HttpResponse(null, { status: 404 });
    items.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/signage/channels/:id/reorder", async ({ request, params }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const { ordered_ids } = (await request.json()) as { ordered_ids: string[] };
    ordered_ids.forEach((id, index) => {
      const item = slides.find((slide) => slide.id === id && slide.channel_id === params.id);
      if (item) item.sort_order = index;
    });
    return HttpResponse.json(slides.filter((item) => item.channel_id === params.id));
  }),
  http.post("/api/signage/preview", async ({ request }) => {
    if (!authorized(request)) return new HttpResponse(null, { status: 401 });
    const body = (await request.json()) as { slides: SlideDraft[]; at: string };
    const output: Playlist["slides"] = [];
    for (const [index, slide] of body.slides
      .sort((a, b) => a.sort_order - b.sort_order)
      .entries()) {
      if (
        !slide.active ||
        (slide.starts_at && Date.parse(slide.starts_at) > Date.parse(body.at)) ||
        (slide.ends_at && Date.parse(slide.ends_at) <= Date.parse(body.at))
      )
        continue;
      const template = templates.find((item) => item.id === slide.template_id);
      if (!template) continue;
      const base = {
        id: String(index),
        duration: slide.duration,
        template,
        title: slide.content.title_nl || slide.content.title_fr || slide.content.title_en,
        text: slide.content.text_nl || slide.content.text_fr || slide.content.text_en,
        translations: slide.content,
        image: slide.content.image,
        icon: slide.content.icon,
        organization: null,
      };
      if (slide.kind === "organizations") {
        for (const org of seedOrganizations.filter(
          (item) =>
            !slide.content.organization_type || item.type === slide.content.organization_type,
        ))
          output.push({
            ...base,
            id: `${index}:${org.id}`,
            kind: "organization",
            organization: {
              name: org.name,
              logo: org.image,
              description: null,
              sponsor: org.type === "sponsor",
            },
          });
      } else output.push({ ...base, kind: slide.kind });
    }
    return HttpResponse.json({ epoch: body.at, revision: "preview", slides: output });
  }),
];
