import SuperTokens from "supertokens-auth-react";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import Session from "supertokens-auth-react/recipe/session";

export function initSuperTokens(): void {
  SuperTokens.init({
    appInfo: {
      appName: "Champagne Festival",
      apiDomain: import.meta.env.VITE_API_DOMAIN ?? "https://champagnefestival.tjor.im",
      websiteDomain: window.location.origin,
      apiBasePath: "/auth",
      websiteBasePath: "/admin/auth",
    },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}
