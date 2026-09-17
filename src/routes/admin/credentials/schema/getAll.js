/**
 * GET /admin/credentials: the Environments table's list, and its search box.
 *
 * `search` is the one query parameter this route reads. A full environment id
 * in it names that one environment; anything else is matched against the name
 * (and the two Wrike values) by substring. The rule lives in
 * src/utils/environmentFilters.js, and the filtering happens in the handler
 * rather than in SQL because it also covers `client_id`, which is ciphertext
 * at rest.
 *
 * Kept optional and blank-tolerant: the console leaves the parameter out when
 * the box is empty, and a client that sends it blank asks for the whole list,
 * which is the same thing.
 */
export const GetAllSchema = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        // maxLength rather than an id shape: the same field carries a name
        // search, and 200 characters is the ceiling the token list uses.
        search: { type: "string", maxLength: 200 },
      },
    },
  },
};
