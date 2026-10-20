"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewVehicleDialog } from "@/components/new-vehicle-dialog";

/** Trigger + dialog for adding a vehicle to the customer on this page. */
export function AddVehicleButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        Add vehicle
      </Button>

      <NewVehicleDialog
        open={open}
        onOpenChange={setOpen}
        customerId={customerId}
        customerName={customerName}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
