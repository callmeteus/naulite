import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import type { AdminLoginResult, AdminRole, AdminUserPublic } from "../../auth/AdminAuthTypes";
import { parseAdminRole } from "../../auth/AdminAuthTypes";
import { AdminSessionModel, AdminUserModel } from "../../database/models/index";

import { AdminPasswordCrypto } from "./AdminPasswordCrypto";
import { AdminSessionCrypto } from "./AdminSessionCrypto";

const DEFAULT_SESSION_TTL_SECONDS = 86_400;

/**
 * Persistence layer for admin users and sessions.
 */
export class AdminStore {
    /**
     * Counts active admin users.
     *
     * @returns Number of admin users
     */
    async countUsers(): Promise<number> {
        return AdminUserModel.count();
    }

    /**
     * Finds an admin user by username.
     *
     * @param username Login username
     * @returns User row when found
     */
    async findUserByUsername(username: string): Promise<AdminUserModel | null> {
        return AdminUserModel.findOne({ where: { username } });
    }

    /**
     * Finds an admin user by id.
     *
     * @param userId User identifier
     * @returns User row when found
     */
    async findUserById(userId: string): Promise<AdminUserModel | null> {
        return AdminUserModel.findByPk(userId);
    }

    /**
     * Creates the first admin user when the table is empty.
     *
     * @param input Bootstrap user payload
     * @returns Created public user or null when users already exist
     */
    async createBootstrapUser(input: {
        username: string;
        password: string;
        role?: AdminRole;
        tenantId?: string | null;
    }): Promise<AdminUserPublic | null> {
        const existingCount = await this.countUsers();

        if (existingCount > 0) {
            return null;
        }

        const now = new Date().toISOString();
        const passwordHash = await AdminPasswordCrypto.hashPassword(input.password);
        const role = input.role ?? "admin";
        const row = await AdminUserModel.create({
            id: randomUUID(),
            username: input.username,
            passwordHash,
            role,
            tenantId: input.tenantId ?? null,
            createdAt: now,
            updatedAt: now,
            disabledAt: null
        });

        return mapAdminUser(row);
    }

    /**
     * Authenticates credentials and creates a session.
     *
     * @param username Login username
     * @param password Plaintext password
     * @returns Login result when credentials are valid
     */
    async login(username: string, password: string): Promise<AdminLoginResult | null> {
        const user = await this.findUserByUsername(username);

        if (!user || user.disabledAt) {
            return null;
        }

        const validPassword = await AdminPasswordCrypto.verifyPassword(password, user.passwordHash);

        if (!validPassword) {
            return null;
        }

        const role = parseAdminRole(user.role);

        if (!role) {
            return null;
        }

        const session = await this.createSession(user.id);
        const publicUser = mapAdminUser(user);

        return {
            sessionToken: session.token,
            expiresAt: session.expiresAt,
            user: publicUser
        };
    }

    /**
     * Resolves a session token to the authenticated user.
     *
     * @param sessionToken Plaintext session token
     * @returns Public user when the session is active
     */
    async resolveSession(sessionToken: string): Promise<AdminUserPublic | null> {
        const tokenHash = AdminSessionCrypto.hashToken(sessionToken);
        const now = new Date().toISOString();
        const session = await AdminSessionModel.findOne({
            where: {
                tokenHash,
                revokedAt: { [Op.is]: null },
                expiresAt: { [Op.gt]: now }
            }
        });

        if (!session) {
            return null;
        }

        const user = await this.findUserById(session.userId);

        if (!user || user.disabledAt) {
            return null;
        }

        return mapAdminUser(user);
    }

    /**
     * Revokes an active session token.
     *
     * @param sessionToken Plaintext session token
     * @returns Whether a session was revoked
     */
    async logout(sessionToken: string): Promise<boolean> {
        const tokenHash = AdminSessionCrypto.hashToken(sessionToken);
        const now = new Date().toISOString();
        const [affectedCount] = await AdminSessionModel.update(
            { revokedAt: now },
            {
                where: {
                    tokenHash,
                    revokedAt: { [Op.is]: null }
                }
            }
        );

        return affectedCount > 0;
    }

    /**
     * Creates a persisted session for a user.
     *
     * @param userId Admin user identifier
     * @returns Session token metadata
     */
    private async createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
        const generated = AdminSessionCrypto.generate();
        const now = new Date();
        const ttlSeconds = resolveSessionTtlSeconds();
        const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

        await AdminSessionModel.create({
            id: randomUUID(),
            userId,
            tokenHash: generated.tokenHash,
            expiresAt,
            createdAt: now.toISOString(),
            revokedAt: null
        });

        return {
            token: generated.token,
            expiresAt
        };
    }
}

/**
 * Maps a Sequelize admin user row to the public API shape.
 *
 * @param row Admin user model instance
 * @returns Public admin user
 */
function mapAdminUser(row: AdminUserModel): AdminUserPublic {
    const role = parseAdminRole(row.role) ?? "viewer";

    return {
        id: row.id,
        username: row.username,
        role,
        tenantId: row.tenantId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

/**
 * Resolves admin session TTL from environment.
 *
 * @returns Session TTL in seconds
 */
function resolveSessionTtlSeconds(): number {
    const configured = Number(process.env.PLATFORM_SESSION_TTL_SECONDS ?? DEFAULT_SESSION_TTL_SECONDS);

    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_SESSION_TTL_SECONDS;
    }

    return configured;
}
