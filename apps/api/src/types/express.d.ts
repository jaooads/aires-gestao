import type { User } from "@supabase/supabase-js";
import type { OrganizationRole } from "@aires/shared";

declare global {
  namespace Express {
    interface Request {
      auth: {
        user: User;
        organizationId: string;
        role: OrganizationRole;
      };
    }
  }
}

export {};

