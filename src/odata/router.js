// src/odata/router.js
import express from "express";
import { WrikeODataServer } from "./server.js";
import { ValidateToken } from "../middlewares/authentication.js";

const odataRouter = express.Router();

odataRouter.use(async (req, res, next) => {
  try {
    if (
      req.path === "/$metadata" ||
      req.path === "/$batch" ||
      req.method === "OPTIONS"
    ) {
      return next();
    }
    await ValidateToken(req, res);
    next();
  } catch (err) {
    res.status(err?.statusCode || 401).json({
      success: false,
      message: err?.message || "Authentication failed",
    });
  }
});

odataRouter.get("/$metadata", async (req, res) => {
  try {
    await WrikeODataServer.execute(req, res, {
      context: { wrikeToken: req.wrikeToken },
    });
  } catch (err) {
    console.error("Metadata Error:", err);
    res.status(500).json({ error: err.message });
  }
});

odataRouter.post("/$batch", async (req, res) => {
  try {
    await WrikeODataServer.execute(req, res, {
      context: { wrikeToken: req.wrikeToken },
    });
  } catch (err) {
    console.error("Batch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for all other OData requests
// odataRouter.all("*", async (req, res) => {
//   try {
//     await WrikeODataServer.execute(req, res, {
//       context: { wrikeToken: req.wrikeToken },
//     });
//   } catch (err) {
//     console.error("OData Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

export default odataRouter;
