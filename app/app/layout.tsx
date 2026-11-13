import { Suspense } from "react";
import AppShell from "@/components/app/AppShell";
import { Spinner } from "@/components/ui";

export const metadata = { title: "Karma" };

export default function Layout({ children }: LayoutProps<"/app">) {
  return (
    <Suspense fallback={<Spinner label="Karma wird geladen" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
