import { HttpResponse, type HttpResponseInit } from "msw/http";
import type { JsonBodyType } from "msw";

/** Check successful fixtures against the API while allowing a handler's error responses too. */
export function jsonResponse<Body extends JsonBodyType = never>(
  body: NoInfer<Body>,
  init?: HttpResponseInit,
): Response {
  return HttpResponse.json(body, init);
}
