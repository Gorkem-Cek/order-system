import type { RouteObject } from "react-router";
import { LoginPage } from "./features/auth/LoginPage";
import { MenuPage } from "./features/menu/MenuPage";
import { MenuAdminPage } from "./features/menu-admin/MenuAdminPage";
import { OrdersBoard } from "./features/orders/OrdersBoard";
import { StaffLayout } from "./features/staff/StaffLayout";
import { QrPrintPage } from "./features/tables/QrPrintPage";
import { TablesPage } from "./features/tables/TablesPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const routes: RouteObject[] = [
  { path: "/", Component: HomePage },
  // Opened by scanning a table's QR code.
  { path: "/m/:qrToken", Component: MenuPage },
  // Café staff and the super-admin.
  { path: "/staff/login", Component: LoginPage },
  {
    path: "/staff",
    Component: StaffLayout,
    children: [
      { index: true, Component: OrdersBoard },
      { path: "menu", Component: MenuAdminPage },
      { path: "tables", Component: TablesPage },
      { path: "tables/print", Component: QrPrintPage },
    ],
  },
  { path: "*", Component: NotFoundPage },
];
