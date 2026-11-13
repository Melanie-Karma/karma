import { Suspense } from "react";
import RequestDetail from "@/components/app/RequestDetail";
import { Spinner } from "@/components/ui";

export default function Page({ params }: PageProps<"/app/anfrage/[id]">) {
  return (
    <Suspense fallback={<Spinner />}>
      {params.then(({ id }) => (
        <RequestDetail id={id} />
      ))}
    </Suspense>
  );
}
