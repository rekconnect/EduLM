import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { postSignInPath } from "@/lib/post-signin-redirect";

export default async function PostSignInPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  redirect(postSignInPath(session.user.role));
}
