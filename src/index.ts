import express, { Application, Request, Response, NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "./config";
import { DBconnection } from "./database";
import { commonResponse } from "./utils/response";
import { logger } from "./utils/logger";
import rootRouter from "./routes/index";
import { setupSwagger } from "./swagger";
import { initializeQueues } from "./queue";
import { IAuthRequest } from "./types";
import { cleanupAbandonedOrders } from "./modules/order/order.controller";

const app: Application = express();
const API_VERSION = "v1";
const LEGACY_API_PREFIX = "/premind/api";
const VERSIONED_API_PREFIX = `/premind/api/${API_VERSION}`;

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseTrustProxy = (
  value: string | undefined,
  nodeEnv: string,
): boolean | number => {
  if (!value || value.trim() === "")
    return nodeEnv === "development" ? false : 1;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "on"].includes(normalized)) return true;
  if (["false", "no", "off"].includes(normalized)) return false;
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  return nodeEnv === "development" ? false : 1;
};

const buildCorsError = (origin: string) => {
  const error = new Error("Not allowed by CORS") as Error & {
    status: number;
    code: string;
    origin: string;
  };
  error.status = 403;
  error.code = "CORS_NOT_ALLOWED";
  error.origin = origin;
  return error;
};

const redactSensitive = (
  payload: Record<string, unknown> = {},
): Record<string, unknown> => {
  const sensitiveKeys = new Set([
    "password",
    "token",
    "otp",
    "authorization",
    "razorpaySignature",
    "razorpayPaymentId",
    "razorpayOrderId",
  ]);
  const redacted: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    redacted[key] = sensitiveKeys.has(key.toLowerCase())
      ? "***redacted***"
      : value;
  });
  return redacted;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
};

const buildRateLimitKey = (req: Request): string => {
  const token = getBearerToken(req);
  if (token && config.jwt.secret) {
    try {
      const user = jwt.verify(token, config.jwt.secret) as { id?: string };
      if (user?.id) return `user:${user.id}`;
    } catch {
      // Invalid token — use IP
    }
  }
  return `ip:${req.ip}`;
};

const versionedApiPaths = (path: string): string[] => [
  `${VERSIONED_API_PREFIX}${path}`,
  `${LEGACY_API_PREFIX}${path}`,
];

const apiVersionNegotiation = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const accept = req.get("accept") || "";
  const mediaVersion = accept.match(
    /application\/vnd\.premind\.v(\d+)\+json/i,
  )?.[1];

  if (mediaVersion && `v${mediaVersion}` !== API_VERSION) {
    res.status(406).json(
      commonResponse(`Unsupported API version v${mediaVersion}`, false, {
        supportedVersions: [API_VERSION],
      }),
    );
    return;
  }

  res.setHeader("X-API-Version", API_VERSION);
  if (
    req.originalUrl.startsWith(LEGACY_API_PREFIX) &&
    !req.originalUrl.startsWith(VERSIONED_API_PREFIX)
  ) {
    res.setHeader("Deprecation", "true");
    res.setHeader(
      "Link",
      `<${VERSIONED_API_PREFIX}${req.path}>; rel="successor-version"`,
    );
  }

  next();
};

const startServer = async (): Promise<void> => {
  try {
    await DBconnection();
    await initializeQueues();

    const trustProxy = parseTrustProxy(process.env.TRUST_PROXY, config.nodeEnv);
    app.set("trust proxy", trustProxy);
    app.disable("x-powered-by");

    // Swagger UI before helmet
    setupSwagger(app);

    app.use(helmet());
    app.use(compression());

    const allowedOrigins = [
      "https://www.store.prempackaging.com",
      "https://admin.prempackaging.com",
      "https://master.d2j0i95kjy4gj7.amplifyapp.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      ...config.cors.origins,
    ];

    app.all(/^\/socket\.io(\/.*)?$/, (_req: Request, res: Response) => {
      res
        .status(404)
        .json(commonResponse("Socket.IO is not enabled on this server", false));
    });

    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          return callback(buildCorsError(origin));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      }),
    );

    // Razorpay webhook — raw body before JSON parser
    const { razorpayWebhook } = require("./modules/order/order.controller");
    app.use(LEGACY_API_PREFIX, apiVersionNegotiation);
    app.post(
      versionedApiPaths("/order/webhook/razorpay"),
      express.raw({ type: "application/json" }),
      razorpayWebhook,
    );

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get("/", (_req: Request, res: Response) => {
      res.send(
        "Welcome to Prempackaging. Visit - https://prempackaging.com for more details.",
      );
    });

    const rateLimitWindowMs = parseInteger(
      process.env.RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
    );
    const rateLimitMax = parseInteger(process.env.RATE_LIMIT_MAX, 1200);
    const apiLimiter = rateLimit({
      windowMs: rateLimitWindowMs,
      max: rateLimitMax,
      keyGenerator: buildRateLimitKey,
      skip: (req) => req.method === "OPTIONS",
      handler: (_req: Request, res: Response) => {
        const retryAfter = Number(res.getHeader("Retry-After")) || null;
        res
          .status(429)
          .json(
            commonResponse(
              "Too many requests. Please try again later.",
              false,
              { retryAfter },
            ),
          );
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    const orderCreateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: {
        success: false,
        message: "Too many orders created. Please try again later.",
      },
      keyGenerator: (req) =>
        req.ip + ((req.body as Record<string, string>)?.email || ""),
      standardHeaders: true,
      legacyHeaders: false,
    });

    const cartLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      message: {
        success: false,
        message: "Too many requests. Please slow down.",
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Password-reset flow: far tighter than the global limiter to blunt OTP
    // brute-forcing and reset-email bombing. Keyed by IP + email so a single
    // client can't churn through guesses or spam codes to one inbox.
    const passwordResetRequestLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: {
        success: false,
        message: "Too many password reset requests. Please try again later.",
      },
      keyGenerator: (req) =>
        req.ip +
        ((req.body as Record<string, string>)?.email ||
          (req.body as Record<string, string>)?.email_address ||
          ""),
      standardHeaders: true,
      legacyHeaders: false,
    });

    const otpVerifyLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: {
        success: false,
        message: "Too many OTP attempts. Please try again later.",
      },
      keyGenerator: (req) =>
        req.ip + ((req.body as Record<string, string>)?.email || ""),
      standardHeaders: true,
      legacyHeaders: false,
    });

    app.use("/premind", healthRouter);
    app.use(LEGACY_API_PREFIX, apiLimiter);
    app.use(versionedApiPaths("/order/create"), orderCreateLimiter);
    app.use(versionedApiPaths("/AddtoCart"), cartLimiter);
    app.use(versionedApiPaths("/alterQunatity"), cartLimiter);
    app.use(versionedApiPaths("/AddtoWishlist"), cartLimiter);
    app.use(versionedApiPaths("/removefromwishlist"), cartLimiter);
    app.use(
      versionedApiPaths("/reset/password/otp"),
      passwordResetRequestLimiter,
    );
    app.use(versionedApiPaths("/reset/password/verify/otp"), otpVerifyLimiter);
    app.use(
      versionedApiPaths("/reset/password/update"),
      passwordResetRequestLimiter,
    );

    app.use(VERSIONED_API_PREFIX, rootRouter);
    app.use(LEGACY_API_PREFIX, rootRouter);

    // Error handler
    app.use(
      (
        err: Error & {
          status?: number;
          statusCode?: number;
          code?: string;
          origin?: string;
        },
        req: Request,
        res: Response,
        _next: NextFunction,
      ) => {
        const status = err.status || err.statusCode || 500;
        const safeBody =
          req.method === "GET"
            ? undefined
            : redactSensitive((req.body || {}) as Record<string, unknown>);
        const logMeta = {
          ip: req.ip,
          method: req.method,
          path: req.originalUrl,
          status,
          body: safeBody,
          message: err.message,
        };

        if (err.code === "CORS_NOT_ALLOWED") {
          logger.warn("CORS request rejected", {
            ...logMeta,
            origin: err.origin,
          });
        } else {
          logger.error("Request error", logMeta);
        }

        if (res.headersSent) return _next(err);
        const message = status === 500 ? "Internal server error" : err.message;
        res
          .status(status)
          .json(commonResponse(message || "Internal server error", false));
      },
    );

    const PORT = config.port;
    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);

      // Schedule order cleanup every 5 minutes
      const cron = require("node-cron");
      cron.schedule("*/5 * * * *", async () => {
        if (mongoose.connection.readyState !== 1) {
          logger.warn("Skipping order cleanup — DB not connected");
          return;
        }
        logger.info("Running order cleanup job...");
        try {
          const result = await cleanupAbandonedOrders();
          if (result.cleaned > 0) {
            logger.info(`Order cleanup: ${result.message}`);
          }
        } catch (error) {
          logger.error("Order cleanup failed", {
            error: error instanceof Error ? error.message : "Unknown",
          });
        }
      });
      logger.info("Order cleanup job scheduled (runs every 5 minutes)");
    });

    server.keepAliveTimeout = parseInteger(
      process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
      65 * 1000,
    );
    server.headersTimeout = parseInteger(
      process.env.HTTP_HEADERS_TIMEOUT_MS,
      server.keepAliveTimeout + 5 * 1000,
    );
    server.requestTimeout = parseInteger(
      process.env.HTTP_REQUEST_TIMEOUT_MS,
      120 * 1000,
    );
  } catch (error) {
    logger.error("Server startup aborted because database connection failed.", {
      error,
    });
    process.exit(1);
  }
};

// Import health route
import healthRouter from "./modules/health/health.route";

startServer();
