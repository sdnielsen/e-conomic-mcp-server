import { z } from "zod";
import { request } from "../economic/api-client.js";
import {
  buildListQuery,
  companySchema,
  dateRangeClauses,
  dateSchema,
  errorToContent,
  joinFilters,
  jsonContent,
  pageSchema,
  pageSizeSchema,
} from "./tool-helpers.js";

export const registerListJournalDraftEntriesTool = (server) => {
  server.registerTool(
    "list_journal_draft_entries",
    {
      title: "List journal draft entries",
      description:
        "List the entries waiting unbooked in a journal (kassekladde), optionally within a date range. Get the journalNumber from list_journals.",
      inputSchema: z.object({
        company: companySchema,
        journalNumber: z.number().int().positive().describe("Journal number."),
        fromDate: dateSchema.optional().describe("Inclusive start date (YYYY-MM-DD)."),
        toDate: dateSchema.optional().describe("Inclusive end date (YYYY-MM-DD)."),
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, journalNumber, fromDate, toDate, pageSize, page }) => {
      try {
        const query = buildListQuery({
          pageSize,
          page,
          filter: joinFilters(dateRangeClauses(fromDate, toDate)),
        });
        const data = await request(
          "GET",
          `/journals/${journalNumber}/entries?${query}`,
          undefined,
          { company }
        );
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
