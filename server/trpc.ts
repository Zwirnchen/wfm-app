import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

const isSupervisor = t.middleware(({ ctx, next }) => {
  if (ctx.session?.user?.role !== "SUPERVISOR") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const employeeProcedure = t.procedure.use(isAuthed);
export const supervisorProcedure = t.procedure.use(isAuthed).use(isSupervisor);
