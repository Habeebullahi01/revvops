import { ErrorPanel } from "@/components/error-panel";
import { BackButton } from "@/components/back-button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh w-full flex-col justify-center">
      <ErrorPanel
        code="404"
        title="That page is not in the workshop"
        body="The link may be wrong, or the record it points at has been removed. Nothing was changed."
        secondary={<BackButton />}
      />
    </main>
  );
}
