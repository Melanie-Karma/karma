import { Suspense } from "react";
import PersonPage from "@/components/app/PersonPage";
import { Spinner } from "@/components/ui";

export default function Page({ params }: PageProps<"/app/person/[id]">) {
  return (
    <Suspense fallback={<Spinner />}>
      {params.then(({ id }) => (
        <PersonPage id={id} />
      ))}
    </Suspense>
  );
}
