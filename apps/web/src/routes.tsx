import type { RouteObject } from "react-router";
import { MenuPage } from "./features/menu/MenuPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const routes: RouteObject[] = [
  { path: "/", Component: HomePage },
  // Opened by scanning a table's QR code.
  { path: "/m/:qrToken", Component: MenuPage },
  { path: "*", Component: NotFoundPage },
];
