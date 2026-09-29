import { createCn } from "cn/config";

// Keep Bootstrap class names intact; merge only prefixed Tailwind utilities.
export const cn = createCn({ prefix: "tw" });
