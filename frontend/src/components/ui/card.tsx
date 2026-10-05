import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Owned shadcn Card presentation. Runtime themes style the stable slot hooks.
function Card({
  className,
  tone = "secondary",
  ...props
}: ComponentProps<"div"> & {
  tone?: "secondary" | "success" | "warning" | "info" | "danger";
}) {
  return (
    <div
      data-slot="card"
      data-tone={tone}
      className={cn("relative flex min-w-0 flex-col", className)}
      {...props}
    />
  );
}
function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn(className)} {...props} />;
}
function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("flex-auto", className)} {...props} />;
}
function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn(className)} {...props} />;
}
function CardTitle({ className, ...props }: ComponentProps<"h5">) {
  return <h5 data-slot="card-title" className={cn("mb-2", className)} {...props} />;
}
export { Card, CardHeader, CardContent, CardFooter, CardTitle };
