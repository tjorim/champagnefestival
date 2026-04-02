import SuperTokens from "supertokens-auth-react";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import Session from "supertokens-auth-react/recipe/session";

export function initSuperTokens(): void {
  const apiDomain =
    import.meta.env.VITE_API_DOMAIN || window.location.origin;

  SuperTokens.init({
    appInfo: {
      appName: "Champagne Festival",
      apiDomain,
      websiteDomain: window.location.origin,
      apiBasePath: "/auth",
      websiteBasePath: "/admin",
    },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}
