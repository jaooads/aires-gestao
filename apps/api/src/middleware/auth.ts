import type { NextFunction, Request, Response } from "express";
import { organizationRoleSchema, type OrganizationRole } from "@aires/shared";
import { AppError } from "../errors.js";
import { adminClient, authClient } from "../supabase.js";

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = req.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError(401, "missing_token", "Sessão não informada.");
    }

    const token = authorization.slice("Bearer ".length);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) {
      throw new AppError(401, "invalid_token", "Sessão inválida ou expirada.");
    }

    const requestedOrganization = req.header("x-organization-id");
    let query = adminClient
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", data.user.id)
      .eq("active", true);

    if (requestedOrganization) {
      query = query.eq("organization_id", requestedOrganization);
    }

    const { data: memberships, error: membershipError } = await query.limit(2);
    if (membershipError) throw membershipError;
    if (!memberships?.length) {
      throw new AppError(403, "membership_required", "Usuário sem acesso à empresa.");
    }
    if (!requestedOrganization && memberships.length > 1) {
      throw new AppError(
        400,
        "organization_required",
        "Informe a empresa ativa no cabeçalho x-organization-id.",
      );
    }

    const membership = memberships[0];
    if (!membership) {
      throw new AppError(403, "membership_required", "Usuário sem acesso à empresa.");
    }

    req.auth = {
      user: data.user,
      organizationId: membership.organization_id as string,
      role: organizationRoleSchema.parse(membership.role),
    };
    next();
  } catch (error) {
    next(error);
  }
}

export const allowRoles =
  (...roles: OrganizationRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, "insufficient_role", "Você não pode fazer este lançamento."));
      return;
    }
    next();
  };

