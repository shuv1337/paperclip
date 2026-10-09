import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { describeNoActiveCeoError } from "../lib/join-approval-error";

export type ActionErrorState = {
  message: string;
  link?: { label: string; href: string };
} | null;

export function actionErrorFromUnknown(error: unknown, fallback: string): Exclude<ActionErrorState, null> {
  const notice = describeNoActiveCeoError(error);
  if (notice) {
    return {
      message: notice.message,
      link: { label: notice.actionLabel, href: notice.href },
    };
  }
  return { message: error instanceof Error ? error.message : fallback };
}

export function ActionErrorLine({ error }: { error: ActionErrorState }): ReactNode {
  if (!error) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {error.message}
      {error.link ? (
        <>
          {" "}
          <Link to={error.link.href} className="font-medium underline underline-offset-4">
            {error.link.label}
          </Link>
        </>
      ) : null}
    </p>
  );
}
