"use strict";

const fp = require("fastify-plugin");
require("dotenv").config();

const session = require("@fastify/session");
const SessionStore = require("connect-session-sequelize")(session.Store);
const db = require("../../models");

module.exports = fp(async function (fastify, opts) {
  fastify.register(session, {
    cookieName: "sessionId",
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET,
    cookie: {
      // "auto": Secure whenever the request arrived over HTTPS (honours
      // X-Forwarded-Proto via trustProxy, see src/index.js), so production
      // behind TLS gets a Secure cookie while plain-http local dev still works.
      // SESSION_COOKIE_SECURE=true forces it on regardless.
      secure: process.env.SESSION_COOKIE_SECURE === "true" ? true : "auto",
      httpOnly: true,
      sameSite: process.env.SESSION_COOKIE_SAMESITE || "lax",
      maxAge: 259200000,
    },
    store: new SessionStore({
      db: db.sequelize,
      tableName: "sessions",
      disableTouch: true,
      expiration: 259200000,
      checkExpirationInterval: 900000,
    }),
  });
});
