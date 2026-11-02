import { MAX_TABLES_PER_CAFE, type StaffTable } from "@siparis/shared";
import type { EventBus } from "../../lib/event-bus";
import { AppError, conflict, notFound } from "../../lib/errors";
import { qrSvg } from "../../lib/qr";
import { generateQrToken } from "../../lib/tokens";
import type { TablesRepository } from "./tables.repository";

type TableRow = { id: string; name: string; qrToken: string };

const byName = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

export function createTablesService(deps: {
  tables: TablesRepository;
  events: EventBus;
  /** Web app address the QR codes link to, without a trailing slash. */
  publicUrl: string;
}) {
  const { tables, events, publicUrl } = deps;

  const toStaffTable = async (table: TableRow): Promise<StaffTable> => {
    const menuUrl = `${publicUrl}/m/${table.qrToken}`;
    return {
      id: table.id,
      name: table.name,
      qrToken: table.qrToken,
      menuUrl,
      qrSvg: await qrSvg(menuUrl),
    };
  };

  const tableOf = async (cafeId: string, id: string) => {
    const table = await tables.find(cafeId, id);
    if (!table) throw notFound("Table");
    return table;
  };

  /** Two tables with the same name would be impossible to tell apart on the board. */
  const assertNameFree = async (cafeId: string, name: string, exceptId?: string) => {
    const existing = await tables.findByName(cafeId, name);
    if (existing && existing.id !== exceptId) {
      throw conflict("name", "A table with this name already exists");
    }
  };

  return {
    async list(cafeId: string): Promise<StaffTable[]> {
      const rows = await tables.list(cafeId);
      rows.sort((a, b) => byName.compare(a.name, b.name));
      return Promise.all(rows.map(toStaffTable));
    },

    async create(cafeId: string, name: string): Promise<StaffTable> {
      if ((await tables.count(cafeId)) >= MAX_TABLES_PER_CAFE) {
        throw new AppError(409, "CONFLICT", "Table limit reached", { reason: "TABLE_LIMIT" });
      }
      await assertNameFree(cafeId, name);
      return toStaffTable(await tables.create(cafeId, name, generateQrToken()));
    },

    async rename(cafeId: string, id: string, name: string): Promise<StaffTable> {
      await tableOf(cafeId, id);
      await assertNameFree(cafeId, name, id);
      return toStaffTable(await tables.update(id, { name }));
    },

    /** For a leaked or copied code: the table gets a new link and the old QR stops working. */
    async regenerateQr(cafeId: string, id: string): Promise<StaffTable> {
      await tableOf(cafeId, id);
      return toStaffTable(await tables.update(id, { qrToken: generateQrToken() }));
    },

    async delete(cafeId: string, id: string): Promise<void> {
      await tableOf(cafeId, id);
      for (const callId of await tables.delete(id)) {
        events.publish(cafeId, { type: "waiterCall.resolved", callId });
      }
    },
  };
}

export type TablesService = ReturnType<typeof createTablesService>;
