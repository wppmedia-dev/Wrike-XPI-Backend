import { SYNC_SOURCE_KEYS } from "../../../../utils/syncSources";

/** The source in the path must be one the registry knows. */
export const RunSchema = {
  schema: {
    params: {
      type: "object",
      required: ["source"],
      properties: { source: { type: "string", enum: SYNC_SOURCE_KEYS } },
    },
  },
};
