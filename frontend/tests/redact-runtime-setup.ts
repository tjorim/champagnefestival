import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useState as redactState } from "@tanstack/redact";
import { createRoot as redactRoot } from "@tanstack/redact/dom-client";

// Fail if either components or their renderer silently fall back to native React.
if (useState !== redactState || createRoot !== redactRoot) {
  throw new Error("Compatibility tests must use Redact for both hooks and DOM rendering");
}

// Browsers expose Event's Web IDL attributes as enumerable prototype getters.
// Happy DOM uses non-enumerable class getters, which Redact's native-event
// snapshot cannot see. Match browser descriptors without changing event values.
for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(Event.prototype))) {
  if (descriptor.get && !descriptor.enumerable && descriptor.configurable) {
    Object.defineProperty(Event.prototype, key, { ...descriptor, enumerable: true });
  }
}
