import type { SessionUser } from "@siparis/shared";
import { Role } from "../../generated/prisma/client";
import { AppError, unauthorized } from "../../lib/errors";
import { hashPassword, verifyPassword } from "../../lib/password";
import { generateSessionToken, hashToken } from "../../lib/tokens";
import type { SessionsRepository } from "./sessions.repository";
import type { UsersRepository } from "./users.repository";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  cafeId: string | null;
  isActive: boolean;
  cafe: { isActive: boolean } | null;
};

export type AuthenticatedSession = {
  sessionId: string;
  user: SessionUser;
  /** Set when the session was extended, so the cookie should be re-sent. */
  renewedExpiresAt?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");

export function toSessionUser(user: UserRow): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, cafeId: user.cafeId };
}

/** A user may be logged in only while active and, for staff, while their café is active. */
function canUseAccount(user: UserRow): boolean {
  return user.isActive && (user.role === Role.SUPER_ADMIN || user.cafe?.isActive === true);
}

export function createAuthService(deps: {
  users: UsersRepository;
  sessions: SessionsRepository;
  sessionTtlDays: number;
  now?: () => Date;
}) {
  const { users, sessions } = deps;
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.sessionTtlDays * DAY_MS;
  // Verified against when the email is unknown, so both cases take the same time.
  const dummyHash = hashPassword("not-a-real-password");

  return {
    async login(email: string, password: string) {
      const user = await users.findByEmailWithCafe(email);
      const valid = user
        ? await verifyPassword(user.passwordHash, password)
        : (await verifyPassword(await dummyHash, password), false);

      if (!user || !valid || !user.isActive) throw invalidCredentials();
      if (!canUseAccount(user)) throw new AppError(403, "CAFE_INACTIVE", "Café is inactive");

      const token = generateSessionToken();
      const expiresAt = new Date(now().getTime() + ttlMs);
      await sessions.create({ userId: user.id, tokenHash: hashToken(token), expiresAt });
      return { token, expiresAt, user: toSessionUser(user) };
    },

    /** Resolves a cookie token to its user, or null if the session is no longer valid. */
    async authenticate(token: string): Promise<AuthenticatedSession | null> {
      const session = await sessions.findByTokenHash(hashToken(token));
      if (!session) return null;

      const current = now();
      if (session.expiresAt <= current || !canUseAccount(session.user)) {
        await sessions.deleteById(session.id);
        return null;
      }

      const result: AuthenticatedSession = {
        sessionId: session.id,
        user: toSessionUser(session.user),
      };
      // Sliding expiry: extend once less than half of the lifetime is left.
      if (session.expiresAt.getTime() - current.getTime() < ttlMs / 2) {
        result.renewedExpiresAt = new Date(current.getTime() + ttlMs);
        await sessions.updateExpiry(session.id, result.renewedExpiresAt);
      }
      return result;
    },

    async logout(token: string) {
      await sessions.deleteByTokenHash(hashToken(token));
    },

    /** Changes the password and logs out every other device. */
    async changePassword(input: {
      userId: string;
      sessionId: string;
      currentPassword: string;
      newPassword: string;
    }) {
      const user = await users.findById(input.userId);
      if (!user) throw unauthorized();
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Current password is wrong");
      }
      await users.updatePasswordHash(user.id, await hashPassword(input.newPassword));
      await sessions.deleteForUser(user.id, input.sessionId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
