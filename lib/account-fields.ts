import {z} from "zod";

export const usernameField=z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,23}$/,"Use 3–24 letters, numbers or underscores.");
export const accountSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("signup"),username:usernameField,name:z.string().trim().min(2).max(80),password:z.string().min(10).max(128)}),
  z.object({action:z.literal("login"),username:usernameField,password:z.string().min(1).max(128)}),
  z.object({action:z.literal("reset"),username:usernameField,password:z.string().min(10).max(128),
    recovery:z.string().trim().toLowerCase().regex(/^[a-f0-9]{48}$/,"Enter the full recovery code.")}),
  z.object({action:z.literal("logout")})
]);
