import type { LinksFunction } from "@react-router/node";
import type { ErrorResponse } from "react-router";

export namespace Route {
  export interface MetaArgs {
    params: Record<string, string>;
  }

  export interface ErrorBoundaryProps {
    error: ErrorResponse | Error;
  }

  export type LinksFunction = LinksFunction;
}