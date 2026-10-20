import { ErrorPanel } from "@/components/error-panel";
import { BackButton } from "@/components/back-button";

/** 404 rendered inside the dashboard frame (notFound() from a nested route). */
export default function DashboardNotFound() {
  return (
    <div className="flex flex-col justify-center">
      <ErrorPanel
        code="404"
        title="That page is not in the workshop"
        body="The link may be wrong, or the record it points at has been removed. Nothing was changed."
        secondary={<BackButton />}
      />
    </div>
  );
}
