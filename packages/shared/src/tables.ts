import { z } from "zod";
import { idSchema } from "./common";
import { qrTokenSchema } from "./menu";

// Table management for café staff, mounted at /api/staff/tables.

export const MAX_TABLES_PER_CAFE = 300;

export const tableNameSchema = z.string().trim().min(1).max(50);

export const staffTableSchema = z.object({
  id: idSchema,
  name: z.string(),
  qrToken: qrTokenSchema,
  /** The link encoded in the QR code (`<PUBLIC_URL>/m/<qrToken>`). */
  menuUrl: z.string(),
  /** The QR code as an SVG document, ready to show or print. */
  qrSvg: z.string(),
});
export type StaffTable = z.infer<typeof staffTableSchema>;

// GET /api/staff/tables — sorted by name, numbers in natural order (Masa 2 before Masa 10).
export const staffTablesResponseSchema = z.object({ tables: z.array(staffTableSchema) });
export type StaffTablesResponse = z.infer<typeof staffTablesResponseSchema>;

// POST /api/staff/tables, PATCH /api/staff/tables/:id
export const tableInputSchema = z.object({ name: tableNameSchema });
export type TableInput = z.infer<typeof tableInputSchema>;

// POST /api/staff/tables/:id/qr — gives the table a new QR token; the old code stops working.
