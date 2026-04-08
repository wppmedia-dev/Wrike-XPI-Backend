export const normalizeString = (value) => {
  if (typeof value !== "string") return value;

  // Step 1: Try JSON parsing
  try {
    return JSON.parse(value);
  } catch (err) {
    // Not JSON, continue
  }

  // Step 2: Handle comma-separated values
  if (value.includes(",")) {
    return value.split(",").map((v) => {
      const trimmed = v.trim();

      // Convert to number if it's a valid number
      return isNaN(trimmed) ? trimmed : Number(trimmed);
    });
  }

  // Step 3: Return as-is
  return value;
};
