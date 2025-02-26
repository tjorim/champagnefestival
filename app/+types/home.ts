// Import types from React Router
import type { LoaderFunctionArgs } from "@react-router/node";

export namespace Route {
  export interface MetaArgs {
    params: Record<string, string>;
  }

  export interface LoaderArgs extends LoaderFunctionArgs {}
}