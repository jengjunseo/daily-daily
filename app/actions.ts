"use server";

import { signIn, signOut } from "@/auth";

export async function startGitHubSignIn() {
  await signIn("github", { redirectTo: "/" });
}

export async function finishSignOut() {
  await signOut({ redirectTo: "/" });
}
