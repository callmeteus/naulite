import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import { TenantModel } from "../../database/models/index";

/**
 * Persistence layer for tenant records.
 */
export class TenantStore {
    /**
     * Lists active tenants.
     *
     * @returns Tenant records
     */
    async listTenants(): Promise<Array<{
        id: string;
        slug: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        disabledAt: string | null;
    }>> {
        const rows = await TenantModel.findAll({
            where: { disabledAt: { [Op.is]: null } },
            order: [["createdAt", "ASC"]]
        });

        return rows.map((row) => row.get({ plain: true }) as {
            id: string;
            slug: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            disabledAt: string | null;
        });
    }

    /**
     * Finds a tenant by id.
     *
     * @param tenantId Tenant identifier
     * @returns Tenant when found
     */
    async getTenant(tenantId: string): Promise<{
        id: string;
        slug: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        disabledAt: string | null;
    } | null> {
        const row = await TenantModel.findByPk(tenantId);
        return row ? row.get({ plain: true }) as {
            id: string;
            slug: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            disabledAt: string | null;
        } : null;
    }

    /**
     * Creates a tenant record.
     *
     * @param input Tenant payload
     * @returns Created tenant
     */
    async createTenant(input: { slug: string; name: string }): Promise<{
        id: string;
        slug: string;
        name: string;
        createdAt: string;
        updatedAt: string;
        disabledAt: string | null;
    }> {
        const now = new Date().toISOString();
        const row = await TenantModel.create({
            id: randomUUID(),
            slug: input.slug,
            name: input.name,
            createdAt: now,
            updatedAt: now,
            disabledAt: null
        });

        return row.get({ plain: true }) as {
            id: string;
            slug: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            disabledAt: string | null;
        };
    }
}
