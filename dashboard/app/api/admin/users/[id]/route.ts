import { NextRequest, NextResponse } from "next/server";
import { isAdmin, getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const callerId = await getUserId();
  if (id === callerId) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const sb = getSupabaseClient();
  // Deletes the auth.users row; every table with a user_id FK (user_profiles,
  // user_subscriptions, insight_bookmarks, insight_reactions, insight_comments,
  // comment_reactions) is ON DELETE CASCADE and is cleaned up automatically.
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const callerId = await getUserId();
  const body = await req.json().catch(() => ({}));
  const sb = getSupabaseClient();

  if ("is_admin" in body) {
    if (typeof body.is_admin !== "boolean") {
      return NextResponse.json({ error: "is_admin must be a boolean" }, { status: 400 });
    }
    if (id === callerId && body.is_admin === false) {
      return NextResponse.json({ error: "You cannot remove your own admin access" }, { status: 400 });
    }
    const { error } = await sb.from("user_profiles").update({ is_admin: body.is_admin }).eq("user_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.reset_onboarding === true) {
    // Clearing subscriptions sends the user back through /onboarding on
    // their next dashboard visit (dashboard/page.tsx redirects when
    // getUserSubscriptions() returns an empty array).
    const { error } = await sb.from("user_subscriptions").delete().eq("user_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "is_admin or reset_onboarding is required" }, { status: 400 });
}
