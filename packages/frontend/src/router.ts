import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout, RootErrorComponent } from "./routes/__root";
import { ChatPage } from "./routes/chat";
import { LibraryPage } from "./routes/library";
import { NotFoundPage } from "./routes/not-found";

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryPage,
});

const routeTree = rootRoute.addChildren([indexRoute, libraryRoute]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
