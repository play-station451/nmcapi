import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import minecraftRouter from "./routes/minecraft.js";

const app = express();

app.disable("x-powered-by");
app.use(rateLimit);
app.use("/api/minecraft", minecraftRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
