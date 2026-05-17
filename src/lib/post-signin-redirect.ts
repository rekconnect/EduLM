import type { Role } from "@prisma/client";

/**
 * Where each role should land after a successful sign-in. Centralized so the
 * Auth.js `redirectTo` and any post-login pages stay in sync.
 */
export function postSignInPath(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin";
    case "SCHOOL_ADMIN":
    case "TEACHER":
      return "/dashboard";
    case "PARENT":
      return "/parent/dashboard";
  }
}
