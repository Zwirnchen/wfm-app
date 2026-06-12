import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth";
import { prisma } from "@/infrastructure/db";

export async function createContext() {
  const session = await getServerSession(authOptions);
  return { session, prisma };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
